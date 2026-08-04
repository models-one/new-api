package controller

import (
	"math"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// inMemoryRatioMaps is the merge base for tests that do not need a database;
// the DB-preferring production path is covered by the integration test below.
func inMemoryRatioMaps() map[string]map[string]float64 {
	return map[string]map[string]float64{
		"ModelRatio":       ratio_setting.GetModelRatioCopy(),
		"CompletionRatio":  ratio_setting.GetCompletionRatioCopy(),
		"CacheRatio":       ratio_setting.GetCacheRatioCopy(),
		"CreateCacheRatio": ratio_setting.GetCreateCacheRatioCopy(),
	}
}

// setRatioMapsForTest replaces the live ratio maps for one test and restores the
// previous contents afterwards. Every Update*ByJSONString is a whole-map
// replace, which is exactly what the restore relies on.
func setRatioMapsForTest(t *testing.T, modelRatio, completionRatio, cacheRatio, createCacheRatio, modelPrice map[string]float64) {
	t.Helper()

	restore := map[string]map[string]float64{
		"model":       ratio_setting.GetModelRatioCopy(),
		"completion":  ratio_setting.GetCompletionRatioCopy(),
		"cache":       ratio_setting.GetCacheRatioCopy(),
		"createCache": ratio_setting.GetCreateCacheRatioCopy(),
		"price":       ratio_setting.GetModelPriceCopy(),
	}
	apply := func(values map[string]map[string]float64) {
		t.Helper()
		for name, update := range map[string]func(string) error{
			"model":       ratio_setting.UpdateModelRatioByJSONString,
			"completion":  ratio_setting.UpdateCompletionRatioByJSONString,
			"cache":       ratio_setting.UpdateCacheRatioByJSONString,
			"createCache": ratio_setting.UpdateCreateCacheRatioByJSONString,
			"price":       ratio_setting.UpdateModelPriceByJSONString,
		} {
			payload, err := common.Marshal(values[name])
			require.NoError(t, err)
			require.NoError(t, update(string(payload)))
		}
	}

	t.Cleanup(func() { apply(restore) })
	apply(map[string]map[string]float64{
		"model":       modelRatio,
		"completion":  completionRatio,
		"cache":       cacheRatio,
		"createCache": createCacheRatio,
		"price":       modelPrice,
	})
}

func TestConvertLiteLLMToRatioData(t *testing.T) {
	table := `{
		"gpt-5.6-terra": {
			"mode": "chat",
			"input_cost_per_token": 2e-06,
			"output_cost_per_token": 1.2e-05,
			"cache_read_input_token_cost": 2e-07,
			"cache_creation_input_token_cost": 2.5e-06
		},
		"gpt-5.6-luna": {
			"mode": "chat",
			"input_cost_per_token": 2e-07,
			"output_cost_per_token": 1.2e-06,
			"cache_read_input_token_cost": 2e-08
		},
		"gpt-5-codex": {
			"mode": "responses",
			"input_cost_per_token": 1.25e-06,
			"output_cost_per_token": 1e-05
		},
		"free-model": {
			"mode": "chat",
			"input_cost_per_token": 0,
			"output_cost_per_token": 0
		},
		"output-only-model": {
			"mode": "chat",
			"input_cost_per_token": 0,
			"output_cost_per_token": 1e-06
		},
		"negative-model": {
			"mode": "chat",
			"input_cost_per_token": -1e-06,
			"output_cost_per_token": 1e-06
		},
		"no-input-model": {
			"mode": "chat",
			"output_cost_per_token": 1e-06
		},
		"text-embedding-3-small": {
			"mode": "embedding",
			"input_cost_per_token": 2e-08
		},
		"gpt-realtime": {
			"mode": "realtime",
			"input_cost_per_token": 4e-06,
			"output_cost_per_token": 1.6e-05
		}
	}`

	converted, err := convertLiteLLMToRatioData(strings.NewReader(table))
	require.NoError(t, err)

	modelRatio := valueMap(converted["model_ratio"])
	completionRatio := valueMap(converted["completion_ratio"])
	cacheRatio := valueMap(converted["cache_ratio"])
	createCacheRatio := valueMap(converted["create_cache_ratio"])

	// $2/1M input -> ratio 1.0, $12/1M output -> completion 6.
	assert.Equal(t, 1.0, modelRatio["gpt-5.6-terra"])
	assert.Equal(t, 6.0, completionRatio["gpt-5.6-terra"])
	assert.Equal(t, 0.1, cacheRatio["gpt-5.6-terra"])
	assert.Equal(t, 1.25, createCacheRatio["gpt-5.6-terra"])

	assert.Equal(t, 0.1, modelRatio["gpt-5.6-luna"])
	assert.Equal(t, 6.0, completionRatio["gpt-5.6-luna"])
	assert.Equal(t, 0.1, cacheRatio["gpt-5.6-luna"])
	assert.NotContains(t, createCacheRatio, "gpt-5.6-luna")

	// responses mode is token billed and must be converted like chat.
	assert.Equal(t, 0.625, modelRatio["gpt-5-codex"])
	assert.Equal(t, 8.0, completionRatio["gpt-5-codex"])

	// A zero upstream price is a gap in the table far more often than a real
	// giveaway; pricing it at 0 would make the model free for every token class.
	assert.NotContains(t, modelRatio, "free-model")

	// A free input with a paid output cannot be expressed as
	// model_ratio * completion_ratio, so it must be dropped, not zero priced.
	assert.NotContains(t, modelRatio, "output-only-model")
	assert.NotContains(t, modelRatio, "negative-model")
	assert.NotContains(t, modelRatio, "no-input-model")

	// Non token-billed modes price a different unit.
	assert.NotContains(t, modelRatio, "text-embedding-3-small")
	assert.NotContains(t, modelRatio, "gpt-realtime")
}

func TestConvertLiteLLMToRatioDataRejectsEmptyTable(t *testing.T) {
	_, err := convertLiteLLMToRatioData(strings.NewReader(`{"text-embedding-3-small":{"mode":"embedding","input_cost_per_token":2e-08}}`))
	require.Error(t, err)
}

func TestPlanModelPriceSyncDecreaseOnlyDefersIncreases(t *testing.T) {
	setRatioMapsForTest(t,
		map[string]float64{"gpt-5.6-terra": 1.25, "gpt-5.6-luna": 0.05},
		map[string]float64{"gpt-5.6-terra": 6, "gpt-5.6-luna": 6},
		map[string]float64{}, map[string]float64{}, map[string]float64{})

	cfg := &ratio_setting.PriceSyncSetting{OnlyKnownModels: true}
	upstream := map[string]any{
		"model_ratio":      map[string]float64{"gpt-5.6-terra": 1.0, "gpt-5.6-luna": 0.1},
		"completion_ratio": map[string]float64{"gpt-5.6-terra": 6, "gpt-5.6-luna": 6},
	}

	plan := planModelPriceSync(upstream, cfg, ratio_setting.PriceSyncApplyModeDecreaseOnly)

	require.Len(t, plan.Changes, 1)
	assert.Equal(t, "gpt-5.6-terra", plan.Changes[0].Model)
	require.NotNil(t, plan.Changes[0].ModelRatio)
	assert.Equal(t, 1.0, *plan.Changes[0].ModelRatio)
	assert.InDelta(t, 2.5, plan.Changes[0].Old.Input, 1e-9)
	assert.InDelta(t, 2.0, plan.Changes[0].New.Input, 1e-9)
	assert.InDelta(t, 15.0, plan.Changes[0].Old.Output, 1e-9)
	assert.InDelta(t, 12.0, plan.Changes[0].New.Output, 1e-9)

	require.Len(t, plan.Deferred, 1)
	assert.Equal(t, "gpt-5.6-luna", plan.Deferred[0].Model)

	// The same plan under apply_mode=all writes both.
	planAll := planModelPriceSync(upstream, cfg, ratio_setting.PriceSyncApplyModeAll)
	assert.Len(t, planAll.Changes, 2)
	assert.Empty(t, planAll.Deferred)
}

func TestPlanModelPriceSyncDefersOutputOnlyIncrease(t *testing.T) {
	setRatioMapsForTest(t,
		map[string]float64{"model-a": 1.0},
		map[string]float64{"model-a": 4},
		map[string]float64{}, map[string]float64{}, map[string]float64{})

	cfg := &ratio_setting.PriceSyncSetting{OnlyKnownModels: true}
	// Input drops but output rises: a per-field comparison would apply this.
	upstream := map[string]any{
		"model_ratio":      map[string]float64{"model-a": 0.9},
		"completion_ratio": map[string]float64{"model-a": 10},
	}

	plan := planModelPriceSync(upstream, cfg, ratio_setting.PriceSyncApplyModeDecreaseOnly)
	assert.Empty(t, plan.Changes)
	require.Len(t, plan.Deferred, 1)
	assert.InDelta(t, 8.0, plan.Deferred[0].Old.Output, 1e-9)
	assert.InDelta(t, 18.0, plan.Deferred[0].New.Output, 1e-9)
}

func TestPlanModelPriceSyncDefersCacheReadIncrease(t *testing.T) {
	// claude-3-haiku is the real case: input and output are already in sync but
	// the upstream cache read multiplier is 0.12 against a local 0.1, which is a
	// 20% rise on cached input. Comparing only input and output would apply it.
	setRatioMapsForTest(t,
		map[string]float64{"claude-3-haiku-20240307": 0.125},
		map[string]float64{},
		map[string]float64{"claude-3-haiku-20240307": 0.1},
		map[string]float64{"claude-3-haiku-20240307": 1.25},
		map[string]float64{})

	cfg := &ratio_setting.PriceSyncSetting{OnlyKnownModels: true}
	upstream := map[string]any{
		"model_ratio": map[string]float64{"claude-3-haiku-20240307": 0.125},
		"cache_ratio": map[string]float64{"claude-3-haiku-20240307": 0.12},
	}

	plan := planModelPriceSync(upstream, cfg, ratio_setting.PriceSyncApplyModeDecreaseOnly)
	assert.Empty(t, plan.Changes)
	require.Len(t, plan.Deferred, 1)
	assert.InDelta(t, 0.025, plan.Deferred[0].Old.CacheRead, 1e-9)
	assert.InDelta(t, 0.03, plan.Deferred[0].New.CacheRead, 1e-9)
	assert.InDelta(t, plan.Deferred[0].Old.Input, plan.Deferred[0].New.Input, 1e-9)
}

func TestPlanModelPriceSyncIgnoresZeroCacheRatio(t *testing.T) {
	// An upstream cache_read_input_token_cost of 0 derives a cache ratio of 0,
	// which would make cached input free. Treat it as missing data.
	setRatioMapsForTest(t,
		map[string]float64{"model-a": 0.15},
		map[string]float64{}, map[string]float64{}, map[string]float64{}, map[string]float64{})

	cfg := &ratio_setting.PriceSyncSetting{OnlyKnownModels: true}
	upstream := map[string]any{
		"model_ratio": map[string]float64{"model-a": 0.15},
		"cache_ratio": map[string]float64{"model-a": 0.0},
	}

	plan := planModelPriceSync(upstream, cfg, ratio_setting.PriceSyncApplyModeDecreaseOnly)
	assert.Empty(t, plan.Changes)
	assert.Empty(t, plan.Deferred)
	assert.Equal(t, 1, plan.Skipped[priceSyncSkipInSync])
}

func TestPlanModelPriceSyncRejectsZeroRatios(t *testing.T) {
	// An upstream zero is a gap in the price table, not a giveaway. Accepting it
	// would read as a price decrease and make the model free — the worst
	// possible failure mode for a job whose safe mode is "only apply decreases".
	setRatioMapsForTest(t,
		map[string]float64{"zero-input-model": 1.0, "zero-output-model": 1.0},
		map[string]float64{"zero-output-model": 4},
		map[string]float64{}, map[string]float64{}, map[string]float64{})

	cfg := &ratio_setting.PriceSyncSetting{OnlyKnownModels: true}
	upstream := map[string]any{
		"model_ratio":      map[string]float64{"zero-input-model": 0, "zero-output-model": 1.0},
		"completion_ratio": map[string]float64{"zero-output-model": 0},
	}

	plan := planModelPriceSync(upstream, cfg, ratio_setting.PriceSyncApplyModeDecreaseOnly)
	assert.Empty(t, plan.Changes)
	assert.Empty(t, plan.Deferred)
	assert.Equal(t, 1, plan.Skipped[priceSyncSkipUnusable], "a zero model_ratio must be rejected outright")
	assert.Equal(t, 1, plan.Skipped[priceSyncSkipInSync], "a zero completion_ratio must be ignored, leaving the model unchanged")
}

func TestPlanModelPriceSyncTreatsRoundingNoiseAsInSync(t *testing.T) {
	// The converter rounds ratios to 6 decimals, so a repeating decimal such as
	// 4/3 never compares exactly equal. Without a grid-aware comparison every
	// run would rewrite these models and log a price move that does not exist.
	setRatioMapsForTest(t,
		map[string]float64{"model-a": 1.0},
		map[string]float64{"model-a": 4.0 / 3.0},
		map[string]float64{}, map[string]float64{}, map[string]float64{})

	cfg := &ratio_setting.PriceSyncSetting{OnlyKnownModels: true}
	upstream := map[string]any{
		"model_ratio":      map[string]float64{"model-a": 1.0},
		"completion_ratio": map[string]float64{"model-a": 1.333333},
	}

	plan := planModelPriceSync(upstream, cfg, ratio_setting.PriceSyncApplyModeDecreaseOnly)
	assert.Empty(t, plan.Changes)
	assert.Equal(t, 1, plan.Skipped[priceSyncSkipInSync])
}

func TestPlanModelPriceSyncComparesNewModelsAgainstTheFallback(t *testing.T) {
	// An unpriced model is not free today: billing charges the unknown-model
	// fallback (ratio 37.5). Pricing it above that is still a price increase.
	setRatioMapsForTest(t,
		map[string]float64{}, map[string]float64{}, map[string]float64{}, map[string]float64{}, map[string]float64{})

	cfg := &ratio_setting.PriceSyncSetting{OnlyKnownModels: false}
	plan := planModelPriceSync(
		map[string]any{"model_ratio": map[string]float64{"cheap-new-model": 1.0, "pricey-new-model": 50}},
		cfg, ratio_setting.PriceSyncApplyModeDecreaseOnly)

	require.Len(t, plan.Changes, 1)
	assert.Equal(t, "cheap-new-model", plan.Changes[0].Model)
	require.Len(t, plan.Deferred, 1)
	assert.Equal(t, "pricey-new-model", plan.Deferred[0].Model)
	assert.InDelta(t, 75.0, plan.Deferred[0].Old.Input, 1e-9, "old price must be the 37.5 fallback, not zero")
}

func TestRatioMapsForMergePrefersPersistedRow(t *testing.T) {
	// Options propagate between nodes only by DB polling, so the in-memory map
	// can lag an edit made on another node. Merging onto the stale copy would
	// silently revert that edit, because the write replaces the whole map.
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}))
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB })

	setRatioMapsForTest(t,
		map[string]float64{"stale-view": 1.0},
		map[string]float64{}, map[string]float64{}, map[string]float64{}, map[string]float64{})
	require.NoError(t, db.Create(&model.Option{
		Key:   "ModelRatio",
		Value: `{"stale-view":1.0,"edited-on-another-node":7.0}`,
	}).Error)

	merged := ratioMapsForMerge()
	assert.Equal(t, map[string]float64{"stale-view": 1.0, "edited-on-another-node": 7.0}, merged["ModelRatio"])
	// A key with no row has never been customized, so the in-memory value stands.
	assert.NotNil(t, merged["CacheRatio"])
}

func TestPlanModelPriceSyncSkipReasons(t *testing.T) {
	setRatioMapsForTest(t,
		map[string]float64{"kept-model": 1.0, "in-sync-model": 2.0, "per-call-model": 3.0},
		map[string]float64{"in-sync-model": 4},
		map[string]float64{}, map[string]float64{},
		map[string]float64{"per-call-model": 0.05})

	cfg := &ratio_setting.PriceSyncSetting{OnlyKnownModels: true, ExcludeModels: "deepseek-*, kept-model"}
	upstream := map[string]any{
		"model_ratio": map[string]float64{
			"deepseek-reasoner": 0.14,
			"kept-model":        0.5,
			"unknown-model":     1.0,
			"per-call-model":    0.1,
			"in-sync-model":     2.0,
		},
		"completion_ratio": map[string]float64{"in-sync-model": 4},
	}

	plan := planModelPriceSync(upstream, cfg, ratio_setting.PriceSyncApplyModeDecreaseOnly)

	assert.Empty(t, plan.Changes)
	assert.Empty(t, plan.Deferred)
	assert.Equal(t, 2, plan.Skipped[priceSyncSkipExcluded])
	assert.Equal(t, 1, plan.Skipped[priceSyncSkipUnknown])
	assert.Equal(t, 1, plan.Skipped[priceSyncSkipPerCall])
	assert.Equal(t, 1, plan.Skipped[priceSyncSkipInSync])
}

func TestPlanModelPriceSyncAddsUnknownModelWhenAllowed(t *testing.T) {
	setRatioMapsForTest(t,
		map[string]float64{"kept-model": 1.0},
		map[string]float64{}, map[string]float64{}, map[string]float64{}, map[string]float64{})

	cfg := &ratio_setting.PriceSyncSetting{OnlyKnownModels: false}
	upstream := map[string]any{"model_ratio": map[string]float64{"brand-new-model": 7.5}}

	// A model that was not priced before is not a price increase: until it is
	// priced it hits the 37.5 unknown-model fallback.
	plan := planModelPriceSync(upstream, cfg, ratio_setting.PriceSyncApplyModeDecreaseOnly)
	require.Len(t, plan.Changes, 1)
	assert.True(t, plan.Changes[0].IsNew)
	assert.Equal(t, "brand-new-model", plan.Changes[0].Model)
}

func TestPlanModelPriceSyncSkipsLockedCompletionRatio(t *testing.T) {
	// gpt-5 (no minor version) has a hardcoded, locked completion ratio of 8;
	// anything written to CompletionRatio for it is ignored by billing.
	require.True(t, ratio_setting.GetCompletionRatioInfo("gpt-5").Locked)

	setRatioMapsForTest(t,
		map[string]float64{"gpt-5": 0.7},
		map[string]float64{}, map[string]float64{}, map[string]float64{}, map[string]float64{})

	cfg := &ratio_setting.PriceSyncSetting{OnlyKnownModels: true}
	upstream := map[string]any{
		"model_ratio":      map[string]float64{"gpt-5": 0.625},
		"completion_ratio": map[string]float64{"gpt-5": 4},
	}

	plan := planModelPriceSync(upstream, cfg, ratio_setting.PriceSyncApplyModeDecreaseOnly)
	require.Len(t, plan.Changes, 1)
	assert.Nil(t, plan.Changes[0].CompletionRatio)
	assert.Equal(t, 1, plan.Skipped[priceSyncCompletionLocke])
	// The output price must be computed from the locked ratio (8), not the
	// upstream one, otherwise decrease_only would compare against a price that
	// billing never charges.
	assert.InDelta(t, 0.625*8*2, plan.Changes[0].New.Output, 1e-9)
}

func TestBuildPriceSyncOptionUpdatesPreservesUntouchedModels(t *testing.T) {
	setRatioMapsForTest(t,
		map[string]float64{"model-a": 1.0, "model-b": 2.0, "model-c": 3.0},
		map[string]float64{"model-b": 4.0},
		map[string]float64{}, map[string]float64{}, map[string]float64{})

	newRatio := 0.5
	updates, err := buildPriceSyncOptionUpdates(inMemoryRatioMaps(), []modelPriceSyncChange{{Model: "model-a", ModelRatio: &newRatio}})
	require.NoError(t, err)

	// Only the map that actually changed is written.
	require.Contains(t, updates, "ModelRatio")
	assert.NotContains(t, updates, "CompletionRatio")
	assert.NotContains(t, updates, "CacheRatio")
	assert.NotContains(t, updates, "CreateCacheRatio")

	var written map[string]float64
	require.NoError(t, common.Unmarshal([]byte(updates["ModelRatio"]), &written))

	// The whole map is replaced on write, so every previously priced model must
	// survive: a dropped key stops being priced and bills at 37.5.
	assert.Equal(t, map[string]float64{"model-a": 0.5, "model-b": 2.0, "model-c": 3.0}, written)
}

func TestBuildPriceSyncOptionUpdatesRejectsNonFiniteValue(t *testing.T) {
	setRatioMapsForTest(t,
		map[string]float64{"model-a": 1.0},
		map[string]float64{}, map[string]float64{}, map[string]float64{}, map[string]float64{})

	inf := math.Inf(1)
	_, err := buildPriceSyncOptionUpdates(inMemoryRatioMaps(), []modelPriceSyncChange{{Model: "model-a", ModelRatio: &inf}})
	require.Error(t, err)
}

func TestBuildPriceSyncOptionUpdatesNoChanges(t *testing.T) {
	updates, err := buildPriceSyncOptionUpdates(inMemoryRatioMaps(), nil)
	require.NoError(t, err)
	assert.Empty(t, updates)
}

// TestApplyModelPriceSyncChangesPersistsAndKeepsOtherModels exercises the real
// write path end to end against SQLite: merge -> marshal -> UpdateOptionsBulk ->
// options row + in-memory ratio map. It is the guard against the whole-map
// replace semantics silently unpricing every model the sync did not touch.
func TestApplyModelPriceSyncChangesPersistsAndKeepsOtherModels(t *testing.T) {
	previousDB := model.DB
	previousOptionMap := common.OptionMap
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Option{}))
	model.DB = db
	// updateOptionMap writes into common.OptionMap, which InitOptionMap fills at
	// startup.
	common.OptionMap = make(map[string]string)
	t.Cleanup(func() {
		model.DB = previousDB
		common.OptionMap = previousOptionMap
	})

	setRatioMapsForTest(t,
		map[string]float64{"gpt-5.6-terra": 1.25, "untouched-model": 9.0},
		map[string]float64{}, map[string]float64{}, map[string]float64{}, map[string]float64{})

	newRatio := 1.0
	newCache := 0.1
	require.NoError(t, applyModelPriceSyncChanges([]modelPriceSyncChange{{
		Model:      "gpt-5.6-terra",
		ModelRatio: &newRatio,
		CacheRatio: &newCache,
	}}))

	// In-memory maps are what billing reads.
	ratio, found, _ := ratio_setting.GetModelRatio("gpt-5.6-terra")
	assert.True(t, found)
	assert.Equal(t, 1.0, ratio)
	untouched, found, _ := ratio_setting.GetModelRatio("untouched-model")
	assert.True(t, found, "a model the sync never mentioned must stay priced")
	assert.Equal(t, 9.0, untouched)
	cacheRatio, cacheFound := ratio_setting.GetCacheRatio("gpt-5.6-terra")
	assert.True(t, cacheFound)
	assert.Equal(t, 0.1, cacheRatio)

	// And the same thing must be on disk, or SyncOptions reverts it within a minute.
	var stored model.Option
	require.NoError(t, db.Where("`key` = ?", "ModelRatio").First(&stored).Error)
	var persisted map[string]float64
	require.NoError(t, common.Unmarshal([]byte(stored.Value), &persisted))
	assert.Equal(t, map[string]float64{"gpt-5.6-terra": 1.0, "untouched-model": 9.0}, persisted)

	// Only the maps that changed are written.
	var keys []string
	require.NoError(t, db.Model(&model.Option{}).Order("`key`").Pluck("key", &keys).Error)
	assert.Equal(t, []string{"CacheRatio", "ModelRatio"}, keys)
}

func TestIsLiteLLMPriceEndpoint(t *testing.T) {
	assert.True(t, isLiteLLMPriceEndpoint(ratio_setting.PriceSyncDefaultSourceURL))
	assert.True(t, isLiteLLMPriceEndpoint("https://example.internal/mirror/model_prices_and_context_window.json"))
	assert.False(t, isLiteLLMPriceEndpoint("https://models.dev/api.json"))
	assert.False(t, isLiteLLMPriceEndpoint("https://example.com/api/pricing"))
}
