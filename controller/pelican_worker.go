package controller

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
)

type pelicanConfig struct {
	URL          string
	ServiceToken string
	TokenID      int
	Concurrency  int
	Timeout      time.Duration
}

func loadPelicanConfig() (pelicanConfig, error) {
	serviceURL, err := system_setting.GetPelicanServiceURL()
	config := pelicanConfig{URL: serviceURL, ServiceToken: os.Getenv("PELICAN_SERVICE_TOKEN"),
		TokenID: common.GetEnvOrDefault("PELICAN_TEST_TOKEN_ID", 0), Concurrency: common.GetEnvOrDefault("PELICAN_CONCURRENCY", 2),
		Timeout: time.Duration(common.GetEnvOrDefault("PELICAN_TIMEOUT_SECONDS", 300)) * time.Second}
	if err != nil {
		return config, err
	}
	if config.URL == "" {
		return config, system_setting.ErrPelicanServiceURLInvalid
	}
	if len(config.ServiceToken) < 32 || strings.ContainsAny(config.ServiceToken, " \r\n\t") {
		return config, errors.New("PELICAN_SERVICE_TOKEN must contain at least 32 non-whitespace characters")
	}
	if config.TokenID <= 0 {
		return config, errors.New("PELICAN_TEST_TOKEN_ID must reference a dedicated relay token")
	}
	if config.Concurrency < 1 || config.Concurrency > 8 {
		return config, errors.New("PELICAN_CONCURRENCY must be between 1 and 8")
	}
	if config.Timeout < time.Second || config.Timeout > 30*time.Minute {
		return config, errors.New("PELICAN_TIMEOUT_SECONDS must be between 1 and 1800")
	}
	return config, nil
}

type pelicanDiagnosticError struct{ Detail any }

func (e *pelicanDiagnosticError) Error() string {
	data, err := common.Marshal(e.Detail)
	if err != nil {
		return "Pelican diagnostic serialization failed"
	}
	return string(data)
}

var pelicanSecretField = regexp.MustCompile(`(?i)^(authorization|proxy.authorization|x.api.key|api.?key|(?:access|refresh|id).?token|token|password|secret|client.?secret|private.?key|cookie|set.cookie)$`)
var pelicanSecretText = regexp.MustCompile(`(?i)((?:authorization|x-api-key|api_key|access_token|refresh_token|password|secret|cookie)\s*[:=]\s*)([^\r\n,}]+)`)
var pelicanURLCredentials = regexp.MustCompile(`(https?://)[^\s/@:]+:[^\s/@]+@`)
var pelicanSensitiveHeader = regexp.MustCompile(`(?i)(auth|api.?key|token|secret|password|cookie|credential|signature|(?:^|[-_])sig(?:$|[-_])|^key$)`)

func pelicanSanitize(value any, secrets []string, depth int) any {
	if depth > 24 {
		return "[TRUNCATED]"
	}
	switch value := value.(type) {
	case string:
		var decoded any
		trimmed := strings.TrimSpace(value)
		if (strings.HasPrefix(trimmed, "{") || strings.HasPrefix(trimmed, "[")) && common.UnmarshalJsonStr(trimmed, &decoded) == nil {
			data, err := common.Marshal(pelicanSanitize(decoded, secrets, depth+1))
			if err == nil {
				return string(data)
			}
		}
		for _, secret := range secrets {
			if secret != "" {
				value = strings.ReplaceAll(value, secret, "[REDACTED]")
				value = strings.ReplaceAll(value, url.QueryEscape(secret), "[REDACTED]")
			}
		}
		value = pelicanSecretText.ReplaceAllString(value, "$1[REDACTED]")
		value = pelicanURLCredentials.ReplaceAllString(value, "$1[REDACTED]@")
		if len(value) > 32000 {
			value = value[:32000] + " [TRUNCATED]"
		}
		return value
	case map[string]any:
		out := make(map[string]any, len(value))
		for key, item := range value {
			safeKey := key
			for _, secret := range secrets {
				if secret != "" {
					safeKey = strings.ReplaceAll(safeKey, secret, "[REDACTED]")
				}
			}
			if pelicanSecretField.MatchString(key) {
				out[safeKey] = "[REDACTED]"
			} else {
				out[safeKey] = pelicanSanitize(item, secrets, depth+1)
			}
		}
		return out
	case []any:
		out := make([]any, len(value))
		for i := range value {
			out[i] = pelicanSanitize(value[i], secrets, depth+1)
		}
		return out
	default:
		// Normalize typed provider diagnostics and slices through the project codec.
		data, err := common.Marshal(value)
		if err == nil && len(data) > 0 && (data[0] == '{' || data[0] == '[') {
			var decoded any
			if common.Unmarshal(data, &decoded) == nil {
				return pelicanSanitize(decoded, secrets, depth+1)
			}
		}
		return value
	}
}

func pelicanErrorDetail(err error, config pelicanConfig) string {
	if err == nil {
		return ""
	}
	value := any(map[string]any{"message": err.Error()})
	var diagnostic *pelicanDiagnosticError
	if errors.As(err, &diagnostic) {
		value = diagnostic.Detail
	}
	data, marshalErr := common.Marshal(pelicanSanitize(value, []string{config.ServiceToken}, 0))
	if marshalErr != nil {
		return `{"message":"Diagnostic serialization failed"}`
	}
	return string(data)
}

var pelicanHTTP = &http.Client{Timeout: 15 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}

func pelicanServiceRequest(ctx context.Context, config pelicanConfig, method, path string, payload []byte, key string) ([]byte, int, error) {
	request, err := http.NewRequestWithContext(ctx, method, config.URL+path, bytes.NewReader(payload))
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("Authorization", "Bearer "+config.ServiceToken)
	request.Header.Set("Content-Type", "application/json")
	if key != "" {
		request.Header.Set("Idempotency-Key", key)
	}
	response, err := pelicanHTTP.Do(request)
	if err != nil {
		return nil, 0, &pelicanDiagnosticError{Detail: map[string]any{"stage": "artifact_service", "path": path, "message": err.Error()}}
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20+1))
	if err != nil {
		return nil, response.StatusCode, err
	}
	if len(body) > 1<<20 {
		return nil, response.StatusCode, errors.New("Artifact service response exceeded 1 MiB")
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return body, response.StatusCode, &pelicanDiagnosticError{Detail: map[string]any{"stage": "artifact_service", "path": path,
			"status": response.StatusCode, "request_id": response.Header.Get("X-Request-Id"), "response_body": string(body)}}
	}
	return body, response.StatusCode, nil
}

func pelicanCheckService(ctx context.Context, config pelicanConfig) error {
	body, _, err := pelicanServiceRequest(ctx, config, "GET", "/v1/capabilities", nil, "")
	if err != nil {
		return err
	}
	var capabilities struct {
		Render    bool `json:"render"`
		Retention struct {
			MaxItems int   `json:"max_items"`
			MaxAge   int64 `json:"max_age_seconds"`
		} `json:"retention"`
	}
	if err := common.Unmarshal(body, &capabilities); err != nil {
		return err
	}
	if !capabilities.Render || capabilities.Retention.MaxItems != model.PelicanMaxImages || capabilities.Retention.MaxAge != model.PelicanRetentionSeconds {
		return errors.New("Artifact client must allow render and enforce max_items=20, max_age_seconds=604800")
	}
	return nil
}

type pelicanScheduleHandler struct{}

func (pelicanScheduleHandler) Type() string { return "pelican_schedule" }
func (pelicanScheduleHandler) Enabled() bool {
	serviceURL, err := system_setting.GetPelicanServiceURL()
	return err == nil && serviceURL != ""
}
func (pelicanScheduleHandler) Interval() time.Duration { return 15 * time.Second }
func (pelicanScheduleHandler) NewPayload() any         { return nil }
func (pelicanScheduleHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	err := model.MaintainPelicanRuns(time.Now().Unix())
	if err == nil {
		var rules []model.PelicanRule
		err = model.DB.Where("enabled = ? AND interval_seconds > 0 AND next_run_at <= ?", true, time.Now().Unix()).Order("next_run_at, id").Limit(100).Find(&rules).Error
		for _, rule := range rules {
			if ctx.Err() != nil {
				err = ctx.Err()
				break
			}
			if _, enqueueErr := model.EnqueuePelicanRun(rule.ID, true, time.Now().Unix()); enqueueErr != nil {
				err = enqueueErr
			}
		}
	}
	if err == nil {
		_, _, err = service.EnqueueSystemTask("pelican_execute", nil)
	}
	finishSystemTaskHandler(task, runnerID, pelicanTaskStatus(err), nil, err)
}

func pelicanTaskStatus(err error) model.SystemTaskStatus {
	if err != nil {
		return model.SystemTaskStatusFailed
	}
	return model.SystemTaskStatusSucceeded
}

type pelicanExecuteHandler struct{}

func (pelicanExecuteHandler) Type() string { return "pelican_execute" }
func (pelicanExecuteHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	config, err := loadPelicanConfig()
	if err == nil {
		err = pelicanCheckService(ctx, config)
	}
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, errors.New(pelicanErrorDetail(err, config)))
		return
	}
	var queued []model.PelicanRun
	err = model.DB.Where("status = ? AND expires_at > ?", "queued", time.Now().Unix()).Order("created_at, id").Limit(config.Concurrency).Find(&queued).Error
	var wg sync.WaitGroup
	workerErrors := make(chan error, len(queued))
	for _, candidate := range queued {
		if ctx.Err() != nil {
			break
		}
		run, claimErr := model.ClaimPelicanRun(candidate.ID, runnerID, time.Now().Unix(), int64(config.Timeout.Seconds()))
		if claimErr != nil {
			err = claimErr
			continue
		}
		if run == nil {
			continue
		}
		wg.Go(func() {
			var persistErr error
			defer func() {
				if recovered := recover(); recovered != nil {
					persistErr = model.FinishPelicanGeneration(run.ID, runnerID, "", "{}", pelicanErrorDetail(fmt.Errorf("generation panic: %v", recovered), config), time.Now().Unix())
				}
				if persistErr != nil {
					workerErrors <- persistErr
				}
			}()
			var rule model.PelicanRule
			generationErr := common.UnmarshalJsonStr(string(run.Snapshot), &rule)
			if generationErr == nil {
				var exists int64
				generationErr = model.DB.Model(&model.PelicanRule{}).Where("id = ?", rule.ID).Count(&exists).Error
				if exists == 0 {
					generationErr = errors.New("Test rule was removed before execution")
				}
			}
			var result map[string]any
			if generationErr == nil {
				generationCtx, cancel := context.WithTimeout(ctx, config.Timeout)
				result, generationErr = generatePelican(generationCtx, rule, run.ID, config)
				cancel()
			}
			payloadText, generationText := "", "{}"
			if generationErr == nil {
				generatedAt := time.Now().UTC()
				payload := map[string]any{"text": result["text"], "generation": result["generation"], "model": rule.Model,
					"prompt": string(rule.Prompt), "system_prompt": string(rule.SystemPrompt), "collection_key": run.CollectionKey,
					"generated_at": generatedAt.Format(time.RFC3339), "output": map[string]any{"type": "svg", "preview_width": 1024}, "metadata": map[string]string{"external_id": run.ID}}
				// Channel-specific diagnostics belong to new-api, not the generic
				// renderer's generation contract.
				generation := result["generation"].(map[string]any)
				renderGeneration := map[string]any{}
				for _, field := range []string{"model", "duration_ms", "request_id", "finish_reason", "response_status", "incomplete_details", "usage", "incomplete"} {
					if value, exists := generation[field]; exists {
						renderGeneration[field] = value
					}
				}
				payload["generation"] = renderGeneration
				var parameters any
				generationErr = common.UnmarshalJsonStr(string(rule.Parameters), &parameters)
				payload["parameters"] = parameters
				if generationErr == nil {
					data, marshalErr := common.Marshal(payload)
					generationErr = marshalErr
					payloadText = string(data)
				}
				if generationErr == nil {
					data, marshalErr := common.Marshal(result["generation"])
					generationErr = marshalErr
					generationText = string(data)
				}
			}
			if generationErr != nil {
				payloadText = ""
			}
			persistErr = model.FinishPelicanGeneration(run.ID, runnerID, payloadText, generationText, pelicanErrorDetail(generationErr, config), time.Now().Unix())
		})
	}
	wg.Wait()
	close(workerErrors)
	for workerErr := range workerErrors {
		err = workerErr
	}
	finishSystemTaskHandler(task, runnerID, pelicanTaskStatus(err), map[string]int{"claimed": len(queued)}, err)
}

type pelicanSyncHandler struct{}

func (pelicanSyncHandler) Type() string { return "pelican_sync" }
func (pelicanSyncHandler) Enabled() bool {
	serviceURL, err := system_setting.GetPelicanServiceURL()
	return err == nil && serviceURL != ""
}
func (pelicanSyncHandler) Interval() time.Duration { return 15 * time.Second }
func (pelicanSyncHandler) NewPayload() any         { return nil }
func (pelicanSyncHandler) Run(ctx context.Context, task *model.SystemTask, runnerID string) {
	config, err := loadPelicanConfig()
	if err != nil {
		finishSystemTaskHandler(task, runnerID, model.SystemTaskStatusFailed, nil, err)
		return
	}
	var pending []model.PelicanRun
	err = model.DB.Where("status IN ? AND next_poll_at <= ? AND expires_at > ?", []string{"render_pending", "rendering"}, time.Now().Unix(), time.Now().Unix()).Order("next_poll_at, id").Limit(12).Find(&pending).Error
	for _, run := range pending {
		if ctx.Err() != nil {
			err = ctx.Err()
			break
		}
		if syncErr := syncPelicanRun(ctx, config, run); syncErr != nil {
			err = syncErr
		}
	}
	finishSystemTaskHandler(task, runnerID, pelicanTaskStatus(err), map[string]int{"checked": len(pending)}, err)
}

func syncPelicanRun(ctx context.Context, config pelicanConfig, run model.PelicanRun) error {
	method, path, key, payload := "GET", "/v1/runs/"+url.PathEscape(run.ServiceRunID), "", []byte(nil)
	if run.Status == "render_pending" {
		method, path, key, payload = "POST", "/v1/renders", run.ID, []byte(run.RenderPayload)
	}
	body, status, err := pelicanServiceRequest(ctx, config, method, path, payload, key)
	now := time.Now().Unix()
	updates := map[string]any{"attempts": run.Attempts + 1, "next_poll_at": now + min(300, int64(15*(1<<min(run.Attempts, 4))))}
	if err != nil {
		updates["error_detail"] = pelicanErrorDetail(err, config)
		if status == http.StatusGone || status == http.StatusNotFound && run.ServiceRunID != "" {
			updates["status"], updates["active_key"], updates["render_payload"], updates["finished_at"] = "expired", nil, "", now
		} else if status >= 400 && status < 500 && status != http.StatusTooManyRequests && status != http.StatusUnauthorized && status != http.StatusForbidden {
			updates["status"], updates["active_key"], updates["render_payload"], updates["finished_at"] = "failed", nil, "", now
		}
	} else {
		var remote struct {
			ID        string            `json:"id"`
			Status    string            `json:"status"`
			Artifacts []pelicanArtifact `json:"artifacts"`
			Error     any               `json:"error"`
		}
		err = common.Unmarshal(body, &remote)
		if err == nil && (remote.ID == "" || !slices.Contains([]string{"queued", "running", "succeeded", "failed"}, remote.Status)) {
			err = errors.New("Artifact service returned an invalid task response")
		}
		if err != nil {
			updates["error_detail"] = pelicanErrorDetail(err, config)
		} else {
			updates["status"], updates["service_run_id"], updates["error_detail"], updates["attempts"], updates["next_poll_at"] = "rendering", remote.ID, "", 0, now+15
			updates["render_payload"] = ""
			if remote.Status == "succeeded" || remote.Status == "failed" {
				artifacts, marshalErr := common.Marshal(remote.Artifacts)
				if marshalErr != nil {
					return marshalErr
				}
				updates["status"], updates["active_key"], updates["artifacts"], updates["finished_at"] = remote.Status, nil, string(artifacts), now
				if remote.Error != nil {
					updates["error_detail"] = pelicanErrorDetail(&pelicanDiagnosticError{Detail: remote.Error}, config)
				}
			}
		}
	}
	if saveErr := model.DB.Model(&model.PelicanRun{}).Where("id = ? AND status = ?", run.ID, run.Status).Updates(updates).Error; saveErr != nil {
		return saveErr
	}
	if updates["status"] == "succeeded" {
		return model.TrimPelicanCollection(run.CollectionKey, now)
	}
	return err
}

type pelicanArtifact struct {
	ID     string `json:"id"`
	Type   string `json:"type"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

// Used by configuration APIs without ever returning the service credential.
func pelicanConfigurationSummary(config pelicanConfig) map[string]any {
	return map[string]any{"service_url": config.URL, "test_token_id": config.TokenID, "concurrency": config.Concurrency, "timeout_seconds": strconv.Itoa(int(config.Timeout.Seconds()))}
}
