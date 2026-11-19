package controller

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func pelicanAPIError(c *gin.Context, err error, status int) {
	config, _ := loadPelicanServiceConfig()
	pelicanConnectionError(c, err, status, config)
}

func pelicanConnectionError(c *gin.Context, err error, status int, config pelicanConfig) {
	message := common.NewMessage("Pelican operation failed")
	fields := message.Fields()
	fields["success"], fields["message"], fields["details"] = false, message.Error(), pelicanErrorDetail(err, config)
	c.JSON(status, fields)
}

func GetPelicanStatus(c *gin.Context) {
	config, err := loadPelicanConfig()
	if err == nil {
		err = pelicanCheckService(c.Request.Context(), config)
	}
	if err == nil {
		_, err = model.GetTokenById(config.TokenID)
	}
	data := pelicanConfigurationSummary(config)
	data["ready"] = err == nil
	data["error_detail"] = pelicanErrorDetail(err, config)
	common.ApiSuccess(c, data)
}

func GetPelicanRules(c *gin.Context) {
	var rules []model.PelicanRule
	if err := model.DB.Order("id desc").Limit(1000).Find(&rules).Error; err != nil {
		pelicanAPIError(c, err, 500)
		return
	}
	common.ApiSuccess(c, rules)
}

func SavePelicanRule(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 256<<10)
	var rule model.PelicanRule
	if err := c.ShouldBindJSON(&rule); err != nil {
		pelicanAPIError(c, err, 400)
		return
	}
	if c.Param("id") != "" {
		id, err := strconv.ParseInt(c.Param("id"), 10, 64)
		if err != nil || id <= 0 {
			pelicanAPIError(c, errors.New("Invalid rule ID"), 400)
			return
		}
		rule.ID = id
	} else {
		rule.ID = 0
	}
	if strings.TrimSpace(rule.Name) == "" || len(rule.Name) > 120 || len(rule.Model) > 200 || len(rule.Prompt) == 0 || len(rule.Prompt) > 100000 || len(rule.SystemPrompt) > 100000 || len(rule.Parameters) > 16000 {
		pelicanAPIError(c, errors.New("Name, model, prompt or parameter size is invalid"), 422)
		return
	}
	if rule.IntervalSeconds != 0 && (rule.IntervalSeconds < 300 || rule.IntervalSeconds > 30*24*3600) {
		pelicanAPIError(c, errors.New("Interval must be zero for manual mode, or between 5 minutes and 30 days"), 422)
		return
	}
	if rule.Parameters == "" {
		rule.Parameters = "{}"
	}
	channel, err := model.GetChannelById(rule.ChannelID, false)
	if err != nil {
		pelicanAPIError(c, err, 422)
		return
	}
	if !slices.Contains(channel.GetModels(), rule.Model) {
		pelicanAPIError(c, errors.New("Model must be configured on the selected channel"), 422)
		return
	}
	body, format, path, err := pelicanRequest(rule)
	if err != nil {
		pelicanAPIError(c, err, 422)
		return
	}
	encoded, err := common.Marshal(body)
	if err != nil {
		pelicanAPIError(c, err, 422)
		return
	}
	// Validate through the same protocol validator as the real relay, including
	// max-token bounds; no request is sent and no quota is consumed here.
	validation, _ := gin.CreateTestContext(c.Writer)
	validation.Request, _ = http.NewRequestWithContext(c.Request.Context(), "POST", path, strings.NewReader(string(encoded)))
	validation.Request.Header.Set("Content-Type", "application/json")
	_, err = helper.GetAndValidateRequest(validation, format)
	if storage, bodyErr := common.GetBodyStorage(validation); bodyErr == nil && storage != nil {
		_ = storage.Close()
	}
	if err != nil {
		pelicanAPIError(c, err, 422)
		return
	}
	if err := model.SavePelicanRule(&rule, rule.Revision); err != nil {
		pelicanAPIError(c, err, 409)
		return
	}
	common.ApiSuccess(c, rule)
}

func DeletePelicanRule(c *gin.Context) {
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		pelicanAPIError(c, errors.New("Invalid rule ID"), 400)
		return
	}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Delete(&model.PelicanRule{}, id).Error; err != nil {
			return err
		}
		return tx.Model(&model.PelicanRun{}).Where("rule_id = ? AND status = ?", id, "queued").Updates(map[string]any{"status": "failed", "active_key": nil, "finished_at": time.Now().Unix(), "error_detail": `{"message":"Rule deleted before generation"}`}).Error
	})
	if err != nil {
		pelicanAPIError(c, err, 500)
		return
	}
	common.ApiSuccess(c, nil)
}

func RunPelicanRule(c *gin.Context) {
	config, err := loadPelicanConfig()
	if err == nil {
		err = pelicanCheckService(c.Request.Context(), config)
	}
	if err != nil {
		pelicanConnectionError(c, err, 503, config)
		return
	}
	id, err := strconv.ParseInt(c.Param("id"), 10, 64)
	if err != nil || id <= 0 {
		pelicanAPIError(c, errors.New("Invalid rule ID"), 400)
		return
	}
	run, err := model.EnqueuePelicanRun(id, false, time.Now().Unix())
	if err != nil {
		pelicanAPIError(c, err, 409)
		return
	}
	if _, _, err := service.EnqueueSystemTask("pelican_execute", nil); err != nil {
		pelicanAPIError(c, err, 500)
		return
	}
	common.ApiSuccess(c, run)
}

func GetPelicanRuns(c *gin.Context) {
	page, _ := strconv.Atoi(c.Query("page"))
	page = max(1, min(page, 100000))
	query := model.DB.Model(&model.PelicanRun{}).Where("expires_at > ?", time.Now().Unix())
	if id := c.Query("rule_id"); id != "" {
		query = query.Where("rule_id = ?", id)
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		pelicanAPIError(c, err, 500)
		return
	}
	var runs []model.PelicanRun
	if err := query.Order("created_at desc, id desc").Offset((page - 1) * 20).Limit(20).Find(&runs).Error; err != nil {
		pelicanAPIError(c, err, 500)
		return
	}
	common.ApiSuccess(c, gin.H{"items": runs, "total": count, "page": page})
}

type pelicanGalleryGroup struct {
	Key             string  `json:"key"`
	ChannelID       int     `json:"channel_id"`
	ChannelName     string  `json:"channel_name"`
	Model           string  `json:"model"`
	IntervalSeconds int64   `json:"interval_seconds"`
	LatestStatus    string  `json:"latest_status"`
	LatestAttemptAt int64   `json:"latest_attempt_at"`
	Runs            []gin.H `json:"runs"`
}

func GetPelicanGallery(c *gin.Context) {
	now := time.Now().Unix()
	var rules []model.PelicanRule
	if err := model.DB.Where("published = ?", true).Order("channel_id, model, id").Limit(1000).Find(&rules).Error; err != nil {
		pelicanAPIError(c, errors.New("Gallery data is temporarily unavailable"), 503)
		return
	}
	search := strings.ToLower(strings.TrimSpace(c.Query("search")))
	groups := []pelicanGalleryGroup{}
	ruleIDs := map[string][]int64{}
	channels := map[int]string{}
	var channelRows []struct {
		Id   int
		Name string
	}
	if err := model.DB.Model(&model.Channel{}).Select("id", "name").Find(&channelRows).Error; err != nil {
		pelicanAPIError(c, errors.New("Gallery data is temporarily unavailable"), 503)
		return
	}
	for _, channel := range channelRows {
		channels[channel.Id] = channel.Name
	}
	for _, rule := range rules {
		name, exists := channels[rule.ChannelID]
		if !exists {
			continue
		}
		key := model.PelicanCollection(rule.ChannelID, rule.Model)
		if _, exists := ruleIDs[key]; !exists {
			groups = append(groups, pelicanGalleryGroup{Key: key, ChannelID: rule.ChannelID, ChannelName: name, Model: rule.Model, IntervalSeconds: rule.IntervalSeconds, Runs: []gin.H{}})
		}
		ruleIDs[key] = append(ruleIDs[key], rule.ID)
	}
	// Publication belongs to the rule, while channel/model identity belongs to
	// each immutable run. Changing a target must not orphan its visible history.
	publishedIDs := make([]int64, 0, len(rules))
	for _, rule := range rules {
		publishedIDs = append(publishedIDs, rule.ID)
	}
	if len(publishedIDs) > 0 {
		var historical []struct {
			CollectionKey string
			ChannelID     int
			ChannelName   string
			Model         string
			RuleID        int64
		}
		if err := model.DB.Model(&model.PelicanRun{}).Distinct("collection_key", "channel_id", "channel_name", "model", "rule_id").
			Where("rule_id IN ? AND status = ? AND expires_at > ?", publishedIDs, "succeeded", now).Find(&historical).Error; err != nil {
			pelicanAPIError(c, errors.New("Gallery data is temporarily unavailable"), 503)
			return
		}
		for _, past := range historical {
			if _, exists := ruleIDs[past.CollectionKey]; !exists {
				name := channels[past.ChannelID]
				if name == "" {
					name = past.ChannelName
				}
				groups = append(groups, pelicanGalleryGroup{Key: past.CollectionKey, ChannelID: past.ChannelID, ChannelName: name, Model: past.Model, Runs: []gin.H{}})
			}
			if !slices.Contains(ruleIDs[past.CollectionKey], past.RuleID) {
				ruleIDs[past.CollectionKey] = append(ruleIDs[past.CollectionKey], past.RuleID)
			}
		}
	}
	groups = slices.DeleteFunc(groups, func(group pelicanGalleryGroup) bool {
		return search != "" && !strings.Contains(strings.ToLower(group.ChannelName+" "+group.Model), search) || c.Query("channel_id") != "" && c.Query("channel_id") != strconv.Itoa(group.ChannelID)
	})
	slices.SortFunc(groups, func(a, b pelicanGalleryGroup) int {
		if a.ChannelID < b.ChannelID {
			return -1
		}
		if a.ChannelID > b.ChannelID {
			return 1
		}
		return strings.Compare(a.Model, b.Model)
	})
	total := len(groups)
	page, _ := strconv.Atoi(c.Query("page"))
	page = max(1, min(page, 100000))
	start := min((page-1)*8, total)
	groups = groups[start:min(start+8, total)]
	for i := range groups {
		group := &groups[i]
		var runs []model.PelicanRun
		if err := model.DB.Where("rule_id IN ? AND collection_key = ? AND status = ? AND expires_at > ?", ruleIDs[group.Key], group.Key, "succeeded", now).
			Order("generated_at desc, id desc").Limit(model.PelicanMaxImages).Find(&runs).Error; err != nil {
			pelicanAPIError(c, errors.New("Gallery data is temporarily unavailable"), 503)
			return
		}
		for _, run := range runs {
			var rule model.PelicanRule
			_ = common.UnmarshalJsonStr(string(run.Snapshot), &rule)
			var artifacts []pelicanArtifact
			_ = common.UnmarshalJsonStr(string(run.Artifacts), &artifacts)
			var generation map[string]any
			_ = common.UnmarshalJsonStr(string(run.Generation), &generation)
			publicGeneration := map[string]any{}
			for _, field := range []string{"model", "duration_ms", "finish_reason", "channel_config_sha256"} {
				if value, exists := generation[field]; exists {
					publicGeneration[field] = value
				}
			}
			group.Runs = append(group.Runs, gin.H{"id": run.ID, "channel_name": run.ChannelName, "model": run.Model, "protocol": run.Protocol, "revision": run.Revision, "generated_at": run.GeneratedAt, "expires_at": run.ExpiresAt,
				"prompt": string(rule.Prompt), "system_prompt": string(rule.SystemPrompt), "parameters": string(rule.Parameters), "generation": publicGeneration, "artifacts": artifacts})
		}
		var latest model.PelicanRun
		if err := model.DB.Where("rule_id IN ? AND collection_key = ? AND expires_at > ?", ruleIDs[group.Key], group.Key, now).Order("created_at desc, id desc").First(&latest).Error; err == nil {
			group.LatestStatus, group.LatestAttemptAt = latest.Status, latest.CreatedAt
		}
	}
	common.ApiSuccess(c, gin.H{"groups": groups, "total": total, "page": page, "max_images": 20, "max_age_seconds": model.PelicanRetentionSeconds})
}

var pelicanArtifactIDPattern = regexp.MustCompile(`^art_[a-zA-Z0-9-]+$`)

func GetPelicanArtifact(c *gin.Context)      { servePelicanArtifact(c, false) }
func GetPelicanAdminArtifact(c *gin.Context) { servePelicanArtifact(c, true) }

func servePelicanArtifact(c *gin.Context, admin bool) {
	var run model.PelicanRun
	query := model.DB.Where("id = ? AND expires_at > ? AND status <> ?", c.Param("run_id"), time.Now().Unix(), "expired")
	if !admin {
		query = query.Where("status = ? AND rule_id IN (?)", "succeeded", model.DB.Model(&model.PelicanRule{}).Select("id").Where("published = ?", true))
	}
	if err := query.First(&run).Error; err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	var artifacts []pelicanArtifact
	if err := common.UnmarshalJsonStr(string(run.Artifacts), &artifacts); err != nil {
		c.Status(500)
		return
	}
	index := slices.IndexFunc(artifacts, func(artifact pelicanArtifact) bool { return artifact.ID == c.Param("artifact_id") })
	if index < 0 || !pelicanArtifactIDPattern.MatchString(artifacts[index].ID) {
		c.Status(404)
		return
	}
	artifact := artifacts[index]
	if artifact.Size < 0 || artifact.Size > 20<<20 {
		c.Status(502)
		return
	}
	config, err := loadPelicanServiceConfig()
	if err != nil {
		if admin {
			pelicanConnectionError(c, err, 503, config)
		} else {
			c.Status(503)
		}
		return
	}
	request, err := http.NewRequestWithContext(c.Request.Context(), "GET", config.URL+"/v1/artifacts/"+url.PathEscape(artifact.ID), nil)
	if err != nil {
		c.Status(500)
		return
	}
	request.Header.Set("Authorization", "Bearer "+config.ServiceToken)
	response, err := pelicanHTTP.Do(request)
	if err != nil {
		if admin {
			pelicanConnectionError(c, err, 502, config)
		} else {
			c.Status(502)
		}
		return
	}
	defer response.Body.Close()
	if response.StatusCode != 200 && response.StatusCode != 204 {
		if response.StatusCode == 404 || response.StatusCode == 410 {
			c.Status(410)
			return
		}
		if admin {
			body, _ := io.ReadAll(io.LimitReader(response.Body, 32000))
			pelicanConnectionError(c, &pelicanDiagnosticError{Detail: map[string]any{"status": response.StatusCode, "response_body": string(body)}}, 502, config)
		} else {
			c.Status(502)
		}
		return
	}
	contentType, extension, disposition := "text/plain; charset=utf-8", "txt", "attachment"
	if artifact.Type == "png" {
		contentType, extension, disposition = "image/png", "png", "inline"
	}
	if artifact.Type == "svg" {
		contentType, extension = "image/svg+xml", "svg"
	}
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Header("Content-Security-Policy", "default-src 'none'; sandbox")
	c.Header("Content-Disposition", fmt.Sprintf(`%s; filename="%s.%s"`, disposition, artifact.ID, extension))
	c.Header("Content-Type", contentType)
	_, _ = io.Copy(c.Writer, io.LimitReader(response.Body, artifact.Size))
}
