package controller

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/i18n"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/jsplugin"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPelicanDatabaseLifecycle(t *testing.T) {
	for _, dialect := range []struct{ kind, env string }{{"sqlite", ""}, {"mysql", "TEST_MYSQL_DSN"}, {"postgres", "TEST_POSTGRES_DSN"}} {
		t.Run(dialect.kind, func(t *testing.T) {
			if dialect.env != "" && os.Getenv(dialect.env) == "" {
				t.Skip("external test database is not configured")
			}
			db := modelManagementDB(t, dialect.kind, os.Getenv(dialect.env))
			require.NoError(t, db.AutoMigrate(&model.PelicanRule{}, &model.PelicanRun{}))
			channel := model.Channel{Name: "Channel A", Type: 1, Key: "fake-key", Models: "fixture-model", Group: "default", Status: common.ChannelStatusEnabled}
			require.NoError(t, db.Create(&channel).Error)
			rule := model.PelicanRule{Name: "Fixture", ChannelID: channel.Id, Model: "fixture-model", Protocol: "openai-chat", Prompt: model.LongText(strings.Repeat("pelican ", 12000)), Parameters: `{"max_tokens":1024}`, Enabled: true, Published: true, IntervalSeconds: 3600}
			require.NoError(t, model.SavePelicanRule(&rule, 0))
			for range 2 {
				require.NoError(t, db.AutoMigrate(&model.PelicanRule{}, &model.PelicanRun{}))
			}
			var restored model.PelicanRule
			require.NoError(t, db.First(&restored, rule.ID).Error)
			assert.Equal(t, rule.Prompt, restored.Prompt, "large prompts survive migrations on every dialect")
			now := time.Now().Unix()
			run, err := model.EnqueuePelicanRun(rule.ID, false, now)
			require.NoError(t, err)
			require.NotNil(t, run)
			_, err = model.EnqueuePelicanRun(rule.ID, false, now)
			require.ErrorIs(t, err, model.ErrPelicanBusy)
			var claims atomic.Int32
			var wg sync.WaitGroup
			for _, owner := range []string{"master-a", "master-b"} {
				wg.Go(func() {
					claimed, err := model.ClaimPelicanRun(run.ID, owner, now, 300)
					assert.NoError(t, err)
					if claimed != nil {
						claims.Add(1)
					}
				})
			}
			wg.Wait()
			assert.EqualValues(t, 1, claims.Load())
			var claimed model.PelicanRun
			require.NoError(t, db.First(&claimed, "id = ?", run.ID).Error)
			require.Error(t, model.FinishPelicanGeneration(run.ID, "stale-owner", "text", "{}", "", now))
			payload := strings.Repeat("x", 150000)
			require.NoError(t, model.FinishPelicanGeneration(run.ID, claimed.LeaseOwner, payload, "{}", "", now))
			var pending model.PelicanRun
			require.NoError(t, db.First(&pending, "id = ?", run.ID).Error)
			assert.Equal(t, payload, string(pending.RenderPayload))
			assert.Equal(t, "render_pending", pending.Status)
			require.NoError(t, model.MaintainPelicanRuns(now+1000))
			require.NoError(t, db.First(&pending, "id = ?", run.ID).Error)
			assert.Equal(t, "render_pending", pending.Status, "render work survives worker loss without another generation")
			require.NoError(t, db.Model(&pending).Updates(map[string]any{"status": "failed", "active_key": nil}).Error)
			interrupted, err := model.EnqueuePelicanRun(rule.ID, false, now)
			require.NoError(t, err)
			_, err = model.ClaimPelicanRun(interrupted.ID, "dead-node", now-1000, 300)
			require.NoError(t, err)
			require.NoError(t, model.MaintainPelicanRuns(now))
			var recovered model.PelicanRun
			require.NoError(t, db.First(&recovered, "id = ?", interrupted.ID).Error)
			assert.Equal(t, "failed", recovered.Status)
			assert.Nil(t, recovered.ActiveKey)
			assert.Contains(t, string(recovered.ErrorDetail), "No automatic generation retry")
			for i := range 21 {
				item := model.PelicanRun{ID: fmt.Sprintf("image-%02d", i), RuleID: rule.ID, CollectionKey: run.CollectionKey, ChannelID: channel.Id, Model: rule.Model, Protocol: rule.Protocol, Status: "succeeded", CreatedAt: now + int64(i), GeneratedAt: now + int64(i), ExpiresAt: now + model.PelicanRetentionSeconds, Artifacts: "[]"}
				require.NoError(t, db.Create(&item).Error)
			}
			require.NoError(t, model.TrimPelicanCollection(run.CollectionKey, now))
			var count int64
			require.NoError(t, db.Model(&model.PelicanRun{}).Where("status = ?", "succeeded").Count(&count).Error)
			assert.EqualValues(t, 20, count)
			var oldest model.PelicanRun
			require.NoError(t, db.First(&oldest, "id = ?", "image-00").Error)
			assert.Equal(t, "expired", oldest.Status)
			require.NoError(t, model.MaintainPelicanRuns(now+model.PelicanRetentionSeconds))
			require.NoError(t, db.Model(&model.PelicanRun{}).Count(&count).Error)
			assert.Zero(t, count)
		})
	}
}

func TestPelicanGenerationUsesSelectedChannelAndQuota(t *testing.T) {
	require.NoError(t, i18n.Init())
	_, err := jsplugin.DefaultRegistry.Register(`
export const meta = {apiVersion:1,key:"pelican-provider-fixture",name:"Pelican provider fixture",version:"1.0.0",author:{name:"Test"},relay:[{incoming_path:"/v1/chat/completions",upstream_path:"/v1/chat/completions"}]};
export function exchangeKey() { return {token:{value:"fixture-generated-signature"}}; }
export function signRequest(ctx) { return {query:{signature:ctx.token.value,page:"0"}}; }
export function credentialRejected(ctx, response) { return response.status === 503; }
`, jsplugin.Options{})
	require.NoError(t, err)
	t.Cleanup(func() { jsplugin.DefaultRegistry.Unregister("pelican-provider-fixture") })
	for _, tc := range []struct {
		name        string
		channelType int
		setting     *string
		signature   string
	}{
		{name: "openai", channelType: constant.ChannelTypeOpenAI},
		{name: "signed-provider", channelType: constant.ChannelTypeTaskPlugin, setting: common.GetPointer(`{"task_plugin_key":"pelican-provider-fixture"}`), signature: "fixture-generated-signature"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := modelManagementDB(t, "sqlite", "")
			require.NoError(t, db.AutoMigrate(&model.Token{}, &model.Log{}, &model.SubscriptionPlan{}, &model.UserSubscription{}, &model.SubscriptionPreConsumeRecord{}))
			oldGroups := setting.UserUsableGroups2JSONString()
			oldGroupRatio, err := common.Marshal(ratio_setting.GetGroupRatioCopy())
			require.NoError(t, err)
			require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(`{"default":"Default"}`))
			require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(`{"default":1}`))
			require.NoError(t, ratio_setting.UpdateModelRatioByJSONString(`{"pelican-fixture":1}`))
			require.NoError(t, ratio_setting.UpdateCompletionRatioByJSONString(`{"pelican-fixture":1}`))
			oldQuota := *operation_setting.GetQuotaSetting()
			operation_setting.GetQuotaSetting().TrustQuotaUSD = 0
			t.Cleanup(func() {
				require.NoError(t, setting.UpdateUserUsableGroupsByJSONString(oldGroups))
				require.NoError(t, ratio_setting.UpdateGroupRatioByJSONString(string(oldGroupRatio)))
				*operation_setting.GetQuotaSetting() = oldQuota
			})
			service.InitHttpClient()
			var calls atomic.Int32
			var failing atomic.Bool
			var blockUntilCancelled atomic.Bool
			reached := make(chan struct{})
			release := make(chan struct{})
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				var request map[string]any
				if !assert.NoError(t, common.DecodeJson(r.Body, &request)) {
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				assert.Equal(t, tc.signature, r.URL.Query().Get("signature"))
				if blockUntilCancelled.Load() {
					close(reached)
					select {
					case <-r.Context().Done():
					case <-release:
					}
					return
				}
				assert.Equal(t, "pelican-fixture", request["model"])
				assert.Equal(t, false, request["stream"])
				assert.Equal(t, "Bearer override-fixture-secret", r.Header.Get("Authorization"))
				if failing.Load() {
					w.WriteHeader(503)
					_, _ = w.Write([]byte(fmt.Sprintf(`{"error":{"message":"provider failed: override-fixture-secret %s","type":"backend_error"}}`, tc.signature)))
					return
				}
				_, _ = w.Write([]byte(`{"id":"local-fixture","object":"chat.completion","model":"pelican-fixture","choices":[{"index":0,"message":{"role":"assistant","content":"<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\"><circle r=\"2\"/></svg>"},"finish_reason":"stop"}],"usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}`))
			}))
			defer upstream.Close()
			defer close(release)
			channel := model.Channel{Name: "Pinned", Type: tc.channelType, Setting: tc.setting, Key: "provider-fixture-secret", HeaderOverride: common.GetPointer(`{"Authorization":"Bearer override-fixture-secret","X-Fixture-Value":"0"}`), BaseURL: &upstream.URL, Models: "pelican-fixture", Group: "default", Status: common.ChannelStatusEnabled}
			require.NoError(t, db.Create(&channel).Error)
			require.NoError(t, channel.AddAbilities(db))
			model.InitChannelCache()
			user := model.User{Username: "pelican-billing", DisplayName: "Pelican", Status: common.UserStatusEnabled, Role: common.RoleCommonUser, Group: "default", Quota: 1000000, AffCode: "pelican-fixture-aff"}
			require.NoError(t, db.Create(&user).Error)
			token := model.Token{UserId: user.Id, Key: "pelicanfixturetestkey000000000001", Name: "Pelican billing", Status: common.TokenStatusEnabled, Group: "default", RemainQuota: 1000000, ExpiredTime: -1}
			require.NoError(t, db.Create(&token).Error)
			config := pelicanConfig{TokenID: token.Id, Timeout: time.Minute}
			rule := model.PelicanRule{ChannelID: channel.Id, Model: "pelican-fixture", Protocol: "openai-chat", Prompt: "Generate an SVG", Parameters: `{"max_tokens":1024,"temperature":0}`}
			cancelled, cancel := context.WithCancel(context.Background())
			cancel()
			_, err = generatePelican(cancelled, rule, "expired-context", config)
			require.ErrorIs(t, err, context.Canceled)
			assert.Zero(t, calls.Load())
			result, err := generatePelican(context.Background(), rule, "fixture-request", config)
			require.NoError(t, err)
			assert.Contains(t, result["text"], "<svg")
			assert.Contains(t, result["text"], `viewBox="0 0 10 10"`, "non-secret header values must not alter generated SVG coordinates")
			var charged model.Token
			require.NoError(t, db.First(&charged, token.Id).Error)
			assert.Less(t, charged.RemainQuota, token.RemainQuota)
			failing.Store(true)
			_, err = generatePelican(context.Background(), rule, "failed-fixture", config)
			require.Error(t, err)
			assert.Contains(t, err.Error(), "backend_error")
			assert.NotContains(t, err.Error(), channel.Key)
			assert.NotContains(t, err.Error(), "override-fixture-secret")
			if tc.signature != "" {
				assert.NotContains(t, err.Error(), tc.signature, "upstream error echoes must redact the final signing credential")
			}
			assert.EqualValues(t, 2, calls.Load(), "no channel, model or provider credential retries")
			var preserved model.Channel
			require.NoError(t, db.First(&preserved, channel.Id).Error)
			assert.Equal(t, common.ChannelStatusEnabled, preserved.Status)
			require.NoError(t, db.First(&charged, token.Id).Error)
			remaining := charged.RemainQuota
			token.ModelLimitsEnabled, token.ModelLimits = true, "other-model"
			require.NoError(t, db.Save(&token).Error)
			_, err = generatePelican(context.Background(), rule, "forbidden-fixture", config)
			require.ErrorContains(t, err, "does not allow this model")
			require.NoError(t, db.First(&charged, token.Id).Error)
			assert.Equal(t, token.RemainQuota, charged.RemainQuota)
			assert.Greater(t, remaining, 0)
			assert.EqualValues(t, 2, calls.Load())
			token.ModelLimitsEnabled = false
			require.NoError(t, db.Save(&token).Error)
			blockUntilCancelled.Store(true)
			active, abort := context.WithCancel(context.Background())
			defer abort()
			finished := make(chan error, 1)
			go func() { _, err := generatePelican(active, rule, "cancel-in-flight", config); finished <- err }()
			select {
			case <-reached:
			case <-time.After(5 * time.Second):
				t.Fatal("upstream was not reached")
			}
			abort()
			select {
			case err := <-finished:
				require.Error(t, err)
				assert.Contains(t, err.Error(), "context canceled")
				if tc.signature != "" {
					assert.NotContains(t, err.Error(), tc.signature, "transport diagnostics must redact the final signing credential")
				}
			case <-time.After(5 * time.Second):
				t.Fatal("cancelled generation did not stop")
			}
		})
	}
}

func TestPelicanRenderSyncRetainsPayloadAndUsesIdempotency(t *testing.T) {
	db := modelManagementDB(t, "sqlite", "")
	require.NoError(t, db.AutoMigrate(&model.PelicanRun{}))
	var fail atomic.Bool
	fail.Store(true)
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		assert.Equal(t, "stable-run-id", r.Header.Get("Idempotency-Key"))
		if fail.Load() {
			w.WriteHeader(503)
			_, _ = w.Write([]byte(`{"error":{"message":"storage is temporarily offline"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"id":"run_remote","status":"queued","artifacts":[]}`))
	}))
	defer server.Close()
	run := model.PelicanRun{ID: "stable-run-id", CollectionKey: "group", ChannelID: 1, Model: "fixture", Status: "render_pending", RenderPayload: `{"text":"saved output"}`, ExpiresAt: time.Now().Unix() + 1000}
	require.NoError(t, db.Create(&run).Error)
	config := pelicanConfig{URL: server.URL, ServiceToken: "nonsecret-test-token"}
	require.Error(t, syncPelicanRun(context.Background(), config, run))
	var saved model.PelicanRun
	require.NoError(t, db.First(&saved, "id = ?", run.ID).Error)
	assert.Equal(t, run.RenderPayload, saved.RenderPayload)
	assert.Equal(t, "render_pending", saved.Status)
	assert.Contains(t, string(saved.ErrorDetail), "storage is temporarily offline")
	fail.Store(false)
	require.NoError(t, syncPelicanRun(context.Background(), config, saved))
	require.NoError(t, db.First(&saved, "id = ?", run.ID).Error)
	assert.Equal(t, "rendering", saved.Status)
	assert.Equal(t, "run_remote", saved.ServiceRunID)
	assert.Empty(t, saved.RenderPayload)
	assert.EqualValues(t, 2, requests.Load())
}

func TestPelicanGalleryFiltersPrivateAndExpiredArtifacts(t *testing.T) {
	db := modelManagementDB(t, "sqlite", "")
	require.NoError(t, db.AutoMigrate(&model.PelicanRule{}, &model.PelicanRun{}))
	channel := model.Channel{Name: "Visible channel", Type: 1, Models: "m", Group: "default"}
	require.NoError(t, db.Create(&channel).Error)
	rule := model.PelicanRule{Name: "private", ChannelID: channel.Id, Model: "m", Prompt: "p", Parameters: "{}", Protocol: "openai-chat"}
	require.NoError(t, model.SavePelicanRule(&rule, 0))
	key := model.PelicanCollection(channel.Id, "m")
	run := model.PelicanRun{ID: "private-run", RuleID: rule.ID, CollectionKey: key, ChannelID: channel.Id, Model: "m", Status: "succeeded", ExpiresAt: time.Now().Unix() + 1000, Artifacts: `[{"id":"art_fixture","type":"png","size":1}]`, Generation: "{}"}
	require.NoError(t, db.Create(&run).Error)
	for _, published := range []bool{false, true} {
		require.NoError(t, db.Model(&rule).Update("published", published).Error)
		var response struct {
			Data struct {
				Total int `json:"total"`
			} `json:"data"`
		}
		modelManagementRequest(t, GetPelicanGallery, "GET", "/api/pelican/gallery", nil, &response)
		if published {
			assert.Equal(t, 1, response.Data.Total)
		} else {
			assert.Zero(t, response.Data.Total)
		}
	}
	rule.Published = true
	rule.Model = "new-target"
	require.NoError(t, model.SavePelicanRule(&rule, rule.Revision))
	var history struct {
		Data struct {
			Groups []struct {
				Model string
				Runs  []struct{ ID string }
			}
		}
	}
	modelManagementRequest(t, GetPelicanGallery, "GET", "/api/pelican/gallery", nil, &history)
	require.Len(t, history.Data.Groups, 2)
	assert.Equal(t, "m", history.Data.Groups[0].Model)
	require.Len(t, history.Data.Groups[0].Runs, 1)
	assert.Equal(t, run.ID, history.Data.Groups[0].Runs[0].ID)
	require.NoError(t, db.Model(&rule).Update("published", false).Error)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest("GET", "/", nil)
	c.Params = gin.Params{{Key: "run_id", Value: run.ID}, {Key: "artifact_id", Value: "art_fixture"}}
	GetPelicanArtifact(c)
	c.Writer.WriteHeaderNow()
	assert.Equal(t, 404, recorder.Code)
	require.NoError(t, db.Model(&rule).Update("published", true).Error)
	require.NoError(t, db.Model(&run).Update("expires_at", time.Now().Unix()-1).Error)
	recorder = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest("GET", "/", nil)
	c.Params = gin.Params{{Key: "run_id", Value: run.ID}, {Key: "artifact_id", Value: "art_fixture"}}
	GetPelicanArtifact(c)
	c.Writer.WriteHeaderNow()
	assert.Equal(t, 404, recorder.Code)
}

func TestPelicanProtocolDiagnostics(t *testing.T) {
	result, err := pelicanOutput(`{"status":"completed","output":[{"type":"message","role":"assistant","phase":"commentary","content":[{"type":"output_text","text":"draft"}]},{"type":"message","role":"assistant","phase":"final_answer","content":[{"type":"output_text","text":"<svg/>"}]}]}`, "openai-responses")
	require.NoError(t, err)
	assert.Equal(t, "<svg/>", result["text"])
	result, err = pelicanOutput(`{"status":"incomplete","incomplete_details":{"reason":"max_output_tokens"},"output":[],"usage":{"output_tokens":100}}`, "openai-responses")
	require.NoError(t, err)
	assert.Equal(t, "max_output_tokens", result["generation"].(map[string]any)["finish_reason"])
	redacted := pelicanSanitize(map[string]any{"response_body": `{"message":"bad \u0073ecret-token","refresh_token":"opaque","cookie":"session=secret"}`}, []string{"secret-token"}, 0)
	encoded, err := common.Marshal(redacted)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), "secret-token")
	assert.NotContains(t, string(encoded), "opaque")
	assert.Contains(t, string(encoded), "REDACTED")
}
