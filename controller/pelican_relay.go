package controller

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"github.com/tidwall/gjson"
)

const pelicanContextKey = "pelican_execution"

type pelicanObservation struct {
	Info       *relaycommon.RelayInfo
	Err        *types.NewAPIError
	ChannelKey string
	Headers    http.Header
}

// The ordinary relay performs validation, provider conversion and quota
// settlement. Only routing/health behavior is scoped for this internal probe.
func generatePelican(ctx context.Context, rule model.PelicanRule, runID string, config pelicanConfig) (map[string]any, error) {
	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("generation context ended before dispatch: %w", err)
	}
	token, err := model.GetTokenById(config.TokenID)
	if err != nil {
		return nil, fmt.Errorf("load pelican billing token: %w", err)
	}
	channel, err := model.GetChannelById(rule.ChannelID, true)
	if err != nil {
		return nil, fmt.Errorf("load selected channel: %w", err)
	}
	if channel.Status != common.ChannelStatusEnabled {
		return nil, errors.New("Selected channel is disabled")
	}
	if !slices.Contains(channel.GetModels(), rule.Model) {
		return nil, errors.New("The selected model is no longer configured on this channel")
	}
	if token.ModelLimitsEnabled && !middleware.TokenModelLimitAllows(token.GetModelLimitsMap(), rule.Model) {
		return nil, errors.New("The test token does not allow this model")
	}
	body, format, path, err := pelicanRequest(rule)
	if err != nil {
		return nil, err
	}
	encoded, err := common.Marshal(body)
	if err != nil {
		return nil, err
	}
	observation := &pelicanObservation{}
	recorder := &pelicanResponseWriter{header: make(http.Header)}
	router := gin.New()
	router.Use(middleware.BodyStorageCleanup(), middleware.TokenAuth())
	router.POST(path, func(c *gin.Context) {
		group := common.GetContextKeyString(c, constant.ContextKeyUsingGroup)
		if group == "auto" || !slices.Contains(channel.GetGroups(), group) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "Test token must use a fixed group supported by the channel"})
			return
		}
		c.Set(pelicanContextKey, observation)
		c.Set("pelican_test", true)
		c.Set(common.RequestIdKey, runID)
		c.Set("token_name", "Pelican test")
		service.GetChannelConstraints(c).AddPin(dto.ChannelPin{ChannelId: channel.Id, Source: dto.PinSourceToken, Rank: dto.PinRankToken, RetryMode: dto.PinRetrySingleAttempt})
		c.Next()
	}, middleware.Distribute(), func(c *gin.Context) {
		// Testing never auto-disables channels and never changes session affinity.
		common.SetContextKey(c, constant.ContextKeyChannelAutoBan, false)
		observation.ChannelKey = common.GetContextKeyString(c, constant.ContextKeyChannelKey)
		Relay(c, format)
		if value, exists := c.Get("pelican_upstream_headers"); exists {
			observation.Headers, _ = value.(http.Header)
		}
	})
	request := httptest.NewRequestWithContext(ctx, http.MethodPost, path, bytes.NewReader(encoded))
	request.RemoteAddr = "127.0.0.1:0"
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+token.Key)
	start := time.Now()
	router.ServeHTTP(recorder, request)
	secrets := append([]string{token.Key, observation.ChannelKey, config.ServiceToken}, channel.GetKeys()...)
	for key, value := range channel.GetHeaderOverride() {
		if !pelicanSensitiveHeader.MatchString(key) {
			continue
		}
		if text, ok := value.(string); ok {
			secrets = append(secrets, text)
		}
	}
	for name, values := range observation.Headers {
		if !pelicanSensitiveHeader.MatchString(name) {
			continue
		}
		for _, value := range values {
			secrets = append(secrets, value)
			if scheme, credential, found := strings.Cut(value, " "); found && (strings.EqualFold(scheme, "bearer") || strings.EqualFold(scheme, "basic")) {
				secrets = append(secrets, credential)
				if strings.EqualFold(scheme, "basic") {
					if decoded, err := base64.StdEncoding.DecodeString(credential); err == nil {
						secrets = append(secrets, string(decoded))
					}
				}
			}
		}
	}
	if recorder.tooLarge {
		return nil, errors.New("Generated response exceeded 4 MiB; output was discarded and will not be regenerated automatically")
	}
	raw := recorder.body.String()
	if observation.Err != nil || recorder.status >= 400 {
		detail := map[string]any{"stage": "generation", "status": recorder.status, "response_body": raw, "request_id": runID}
		if observation.Err != nil {
			detail["code"] = observation.Err.GetErrorCode()
			detail["upstream_status"] = observation.Err.StatusCode
			detail["relay_error"] = observation.Err.RelayError
			causes := []string{}
			for cause, depth := error(observation.Err), 0; cause != nil && depth < 5; cause, depth = errors.Unwrap(cause), depth+1 {
				causes = append(causes, cause.Error())
			}
			detail["causes"] = causes
		}
		return nil, &pelicanDiagnosticError{Detail: pelicanSanitize(detail, secrets, 0)}
	}
	result, err := pelicanOutput(raw, rule.Protocol)
	if err != nil {
		return nil, &pelicanDiagnosticError{Detail: pelicanSanitize(map[string]any{"stage": "generation", "message": err.Error(), "response_body": raw}, secrets, 0)}
	}
	text := result["text"].(string)
	for _, secret := range secrets {
		if secret != "" {
			text = strings.ReplaceAll(text, secret, "[REDACTED]")
		}
	}
	result["text"] = text
	generation := result["generation"].(map[string]any)
	generation["duration_ms"] = time.Since(start).Milliseconds()
	generation["request_id"] = runID
	if observation.Info != nil {
		generation["model"] = observation.Info.GetUpstreamModelName()
	}
	configuration := map[string]any{"model_mapping": channel.GetModelMapping(), "parameter_override": channel.GetParamOverride(), "setting": channel.GetSetting(), "other_setting": channel.GetOtherSettings()}
	configurationJSON, marshalErr := common.Marshal(configuration)
	if marshalErr != nil {
		return nil, marshalErr
	}
	generation["channel_config_sha256"] = fmt.Sprintf("%x", sha256.Sum256(configurationJSON))
	// Retain routing conditions for administrator debugging. The gallery exposes
	// only the fingerprint, never the underlying channel configuration.
	generation["channel_configuration"] = configuration
	generation["key_slot"] = 0
	if observation.Info != nil && observation.Info.ChannelMeta != nil {
		generation["key_slot"] = observation.Info.ChannelMultiKeyIndex
	}
	result["generation"] = pelicanSanitize(generation, secrets, 0)
	return result, nil
}

type pelicanResponseWriter struct {
	header   http.Header
	body     bytes.Buffer
	status   int
	tooLarge bool
}

func (w *pelicanResponseWriter) Header() http.Header { return w.header }
func (w *pelicanResponseWriter) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
}
func (w *pelicanResponseWriter) Write(p []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	if w.body.Len()+len(p) > 4<<20 {
		w.tooLarge = true
		return len(p), nil
	}
	if w.tooLarge {
		return len(p), nil
	}
	return w.body.Write(p)
}
func (w *pelicanResponseWriter) Flush() {}

func pelicanRequest(rule model.PelicanRule) (map[string]any, types.RelayFormat, string, error) {
	params := map[string]any{}
	if err := common.UnmarshalJsonStr(string(rule.Parameters), &params); err != nil {
		return nil, "", "", fmt.Errorf("invalid generation parameters: %w", err)
	}
	allowed := []string{"temperature", "top_p"}
	var path string
	var format types.RelayFormat
	switch rule.Protocol {
	case "openai-chat":
		allowed = append(allowed, "max_tokens", "max_completion_tokens", "seed", "stop", "reasoning_effort", "presence_penalty", "frequency_penalty")
		path, format = "/v1/chat/completions", types.RelayFormatOpenAI
	case "openai-responses":
		allowed = append(allowed, "max_output_tokens", "reasoning", "text")
		path, format = "/v1/responses", types.RelayFormatOpenAIResponses
	case "anthropic":
		allowed = append(allowed, "max_tokens", "top_k", "stop_sequences", "thinking", "output_config")
		path, format = "/v1/messages", types.RelayFormatClaude
	default:
		return nil, "", "", errors.New("Unsupported test protocol")
	}
	for key := range params {
		if !slices.Contains(allowed, key) {
			return nil, "", "", fmt.Errorf("unsupported parameter %q for %s", key, rule.Protocol)
		}
	}
	params["model"], params["stream"] = rule.Model, false
	if rule.Protocol == "openai-responses" {
		params["input"] = []any{map[string]any{"role": "user", "content": string(rule.Prompt)}}
		params["store"], params["background"] = false, false
		if rule.SystemPrompt != "" {
			params["instructions"] = string(rule.SystemPrompt)
		}
	} else {
		messages := []any{}
		if rule.SystemPrompt != "" {
			if rule.Protocol == "anthropic" {
				params["system"] = string(rule.SystemPrompt)
			} else {
				messages = append(messages, map[string]any{"role": "system", "content": string(rule.SystemPrompt)})
			}
		}
		params["messages"] = append(messages, map[string]any{"role": "user", "content": string(rule.Prompt)})
	}
	return params, format, path, nil
}

func pelicanOutput(raw, protocol string) (map[string]any, error) {
	if !gjson.Valid(raw) {
		return nil, errors.New("Model response is not valid JSON")
	}
	response := gjson.Parse(raw)
	var text strings.Builder
	reason := ""
	generation := map[string]any{"model": response.Get("model").String(), "usage": response.Get("usage").Value()}
	switch protocol {
	case "openai-chat":
		message := response.Get("choices.0.message.content")
		if message.Type == gjson.String {
			text.WriteString(message.String())
		} else {
			for _, block := range message.Array() {
				if block.Get("type").String() == "text" {
					text.WriteString(block.Get("text").String())
				}
			}
		}
		reason = response.Get("choices.0.finish_reason").String()
		generation["incomplete"] = reason != "stop"
	case "anthropic":
		for _, block := range response.Get("content").Array() {
			if block.Get("type").String() == "text" {
				text.WriteString(block.Get("text").String())
			}
		}
		reason = response.Get("stop_reason").String()
		generation["incomplete"] = reason != "end_turn" && reason != "stop_sequence"
	case "openai-responses":
		output := response.Get("output").Array()
		hasFinal := slices.ContainsFunc(output, func(item gjson.Result) bool {
			return item.Get("type").String() == "message" && item.Get("phase").String() == "final_answer"
		})
		for _, message := range output {
			if message.Get("type").String() != "message" || message.Get("role").String() != "assistant" {
				continue
			}
			phase := message.Get("phase").String()
			if hasFinal && phase != "final_answer" || !hasFinal && phase != "" {
				continue
			}
			for _, block := range message.Get("content").Array() {
				if block.Get("type").String() == "output_text" {
					text.WriteString(block.Get("text").String())
				}
			}
		}
		reason = response.Get("incomplete_details.reason").String()
		status := response.Get("status").String()
		if reason == "" {
			reason = status
		}
		generation["response_status"], generation["incomplete_details"], generation["incomplete"] = status, response.Get("incomplete_details").Value(), status != "completed"
	}
	if reason == "" || text.Len() == 0 && generation["incomplete"] == false {
		return nil, errors.New("Model response has no final text or completion status")
	}
	generation["finish_reason"] = reason
	return map[string]any{"text": text.String(), "generation": generation}, nil
}

var _ http.Flusher = (*pelicanResponseWriter)(nil)
var _ io.Writer = (*pelicanResponseWriter)(nil)
