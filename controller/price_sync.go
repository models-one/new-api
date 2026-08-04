package controller

import (
	"context"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/QuantumNous/new-api/setting/ratio_setting"
)

const (
	priceSyncFetchTimeout = 60 * time.Second
	// usdPerMillionPerRatio converts a model_ratio into USD per 1M tokens:
	// ratio == input_cost_per_token * 1000 * ratio_setting.USD, so one ratio
	// point is $2 per 1M tokens.
	usdPerMillionPerRatio = 1e6 / (1000 * float64(ratio_setting.USD))
)

// Reasons a model in the upstream table was not considered for an update. They
// are counted per run so an admin can tell "nothing changed" apart from
// "everything was filtered out".
const (
	priceSyncSkipExcluded    = "excluded"
	priceSyncSkipUnknown     = "not_priced_locally"
	priceSyncSkipPerCall     = "per_call_priced"
	priceSyncSkipTiered      = "tiered_billing"
	priceSyncSkipInSync      = "already_in_sync"
	priceSyncSkipUnusable    = "unusable_value"
	priceSyncCompletionLocke = "completion_ratio_locked"
)

// modelPriceSyncPrices is one model's effective USD price per 1M tokens across
// every billed token class, so a change can be judged as a whole. Comparing only
// input and output would let a cache ratio increase through: a model whose
// cached reads go from 10% to 12% of the input price is a price rise for
// cache-heavy traffic even when input and output are untouched.
type modelPriceSyncPrices struct {
	Input      float64 `json:"input"`
	Output     float64 `json:"output"`
	CacheRead  float64 `json:"cache_read"`
	CacheWrite float64 `json:"cache_write"`
}

// modelPriceSyncChange is one model's pending ratio update. A nil field means
// that ratio is already correct (or must not be written) and is left untouched.
type modelPriceSyncChange struct {
	Model            string               `json:"model"`
	IsNew            bool                 `json:"is_new,omitempty"`
	ModelRatio       *float64             `json:"model_ratio,omitempty"`
	CompletionRatio  *float64             `json:"completion_ratio,omitempty"`
	CacheRatio       *float64             `json:"cache_ratio,omitempty"`
	CreateCacheRatio *float64             `json:"create_cache_ratio,omitempty"`
	Old              modelPriceSyncPrices `json:"old_usd_per_m"`
	New              modelPriceSyncPrices `json:"new_usd_per_m"`
}

// priceSyncRatioTolerance is the converter's rounding grid (roundRatioValue
// keeps 6 decimals). Comparing tighter than the grid reports a repeating
// decimal such as 4/3 as a change on every single run and writes a ratio that
// moves no price.
const priceSyncRatioTolerance = 5e-7

func ratiosMatch(a, b float64) bool {
	return math.Abs(a-b) <= priceSyncRatioTolerance*math.Max(1, math.Abs(a))
}

func priceRose(old, updated float64) bool {
	return updated > old+priceSyncRatioTolerance*math.Max(1, math.Abs(old))
}

// isPriceIncrease reports whether applying the change would raise what a user
// pays for any token class, including the classes billed through a multiplier.
// IsNew is not a free pass: an unpriced model is billed at the unknown-model
// fallback today, and its Old prices are built from that fallback.
func (c modelPriceSyncChange) isPriceIncrease() bool {
	return priceRose(c.Old.Input, c.New.Input) ||
		priceRose(c.Old.Output, c.New.Output) ||
		priceRose(c.Old.CacheRead, c.New.CacheRead) ||
		priceRose(c.Old.CacheWrite, c.New.CacheWrite)
}

type modelPriceSyncPlan struct {
	Changes  []modelPriceSyncChange
	Deferred []modelPriceSyncChange
	Skipped  map[string]int
}

// modelPriceSyncSummary is stored as the system task result and logged. Deferred
// entries are the price increases decrease_only refused to write.
type modelPriceSyncSummary struct {
	Source          string                 `json:"source"`
	SourceModels    int                    `json:"source_models"`
	ApplyMode       string                 `json:"apply_mode"`
	DryRun          bool                   `json:"dry_run"`
	Applied         int                    `json:"applied"`
	DeferredUp      int                    `json:"deferred_increases"`
	Skipped         map[string]int         `json:"skipped,omitempty"`
	Changes         []modelPriceSyncChange `json:"changes,omitempty"`
	ChangesOmitted  int                    `json:"changes_omitted,omitempty"`
	Deferred        []modelPriceSyncChange `json:"deferred,omitempty"`
	DeferredOmitted int                    `json:"deferred_omitted,omitempty"`
}

// priceSyncMaxReportedChanges bounds the per-model detail stored in the task
// result so a large first run cannot overflow the TEXT column.
const priceSyncMaxReportedChanges = 60

func capPriceSyncChanges(changes []modelPriceSyncChange) ([]modelPriceSyncChange, int) {
	if len(changes) <= priceSyncMaxReportedChanges {
		return changes, 0
	}
	return changes[:priceSyncMaxReportedChanges], len(changes) - priceSyncMaxReportedChanges
}

// runModelPriceSyncTaskOnce performs one full sync: fetch the upstream table,
// plan the merge under the configured policy, and write the result.
func runModelPriceSyncTaskOnce(ctx context.Context, forceDryRun bool) (*modelPriceSyncSummary, error) {
	cfg := ratio_setting.GetPriceSyncSetting()

	// Ratios are calibrated against ratio_setting.USD. If an operator retunes
	// QuotaPerUnit the same ratio means a different price, so refuse to write
	// rather than silently rescale every synced model.
	if !nearlyEqual(common.QuotaPerUnit, 1000*float64(ratio_setting.USD)) {
		return nil, fmt.Errorf("QuotaPerUnit 为 %g，与倍率口径（%g）不一致，价格同步已中止", common.QuotaPerUnit, 1000*float64(ratio_setting.USD))
	}

	sourceURL := strings.TrimSpace(cfg.SourceURL)
	if sourceURL == "" {
		sourceURL = ratio_setting.PriceSyncDefaultSourceURL
	}

	upstream, err := fetchLiteLLMPriceTable(ctx, sourceURL)
	if err != nil {
		return nil, err
	}

	sourceModels := len(valueMap(upstream["model_ratio"]))
	if cfg.MinSourceModels > 0 && sourceModels < cfg.MinSourceModels {
		return nil, fmt.Errorf("上游价格表仅含 %d 个可用模型，低于下限 %d，疑似截断，已中止", sourceModels, cfg.MinSourceModels)
	}

	applyMode := cfg.ResolvedApplyMode()
	dryRun := forceDryRun || applyMode == ratio_setting.PriceSyncApplyModeDryRun

	plan := planModelPriceSync(upstream, cfg, applyMode)
	summary := &modelPriceSyncSummary{
		Source:       sourceURL,
		SourceModels: sourceModels,
		ApplyMode:    applyMode,
		DryRun:       dryRun,
		Applied:      len(plan.Changes),
		DeferredUp:   len(plan.Deferred),
		Skipped:      plan.Skipped,
	}
	// The result column is TEXT (64KB on MySQL); an oversized value would fail
	// the whole write and lose the record of a run that already changed prices.
	// Counters always survive, the per-model detail is capped, and the full list
	// is in the log either way.
	summary.Changes, summary.ChangesOmitted = capPriceSyncChanges(plan.Changes)
	summary.Deferred, summary.DeferredOmitted = capPriceSyncChanges(plan.Deferred)

	for _, change := range plan.Deferred {
		common.SysLog(fmt.Sprintf("[PriceSync] 涨价未自动应用（需人工确认） %s: %s", change.Model, change.describePriceMove()))
	}

	if dryRun || len(plan.Changes) == 0 {
		summary.Applied = 0
		if dryRun {
			common.SysLog(fmt.Sprintf("[PriceSync] 试运行完成：%d 个模型待更新，%d 个涨价被拦截", len(plan.Changes), len(plan.Deferred)))
		}
		return summary, nil
	}

	if err := applyModelPriceSyncChanges(plan.Changes); err != nil {
		return nil, err
	}

	for _, change := range plan.Changes {
		common.SysLog(fmt.Sprintf("[PriceSync] 已更新 %s: %s", change.Model, change.describePriceMove()))
	}
	return summary, nil
}

// describePriceMove renders only the token classes whose price actually moved,
// so the audit log line stays readable.
func (c modelPriceSyncChange) describePriceMove() string {
	moves := make([]string, 0, 4)
	for _, class := range []struct {
		label        string
		old, updated float64
	}{
		{"输入", c.Old.Input, c.New.Input},
		{"输出", c.Old.Output, c.New.Output},
		{"缓存读", c.Old.CacheRead, c.New.CacheRead},
		{"缓存写", c.Old.CacheWrite, c.New.CacheWrite},
	} {
		if !ratiosMatch(class.old, class.updated) {
			moves = append(moves, fmt.Sprintf("%s $%.4f -> $%.4f /1M", class.label, class.old, class.updated))
		}
	}
	if len(moves) == 0 {
		return "无价格变化"
	}
	return strings.Join(moves, "，")
}

// usableUpstreamRatio reads one derived cache multiplier from the converted
// upstream table. A zero is rejected rather than applied: it would make that
// token class free, and an upstream reporting a 0 cost is far more often a gap
// in the table than a genuine giveaway.
func usableUpstreamRatio(source map[string]any, modelName string) (float64, bool) {
	raw, exists := source[modelName]
	if !exists {
		return 0, false
	}
	value, ok := asFloat64(raw)
	if !ok || math.IsNaN(value) || math.IsInf(value, 0) || value <= 0 {
		return 0, false
	}
	return value, true
}

func fetchLiteLLMPriceTable(ctx context.Context, sourceURL string) (map[string]any, error) {
	parsed, err := url.Parse(sourceURL)
	if err != nil {
		return nil, fmt.Errorf("价格表地址无法解析: %w", err)
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, fmt.Errorf("价格表地址协议不支持: %s", parsed.Scheme)
	}

	fetchCtx, cancel := context.WithTimeout(ctx, priceSyncFetchTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(fetchCtx, http.MethodGet, sourceURL, nil)
	if err != nil {
		return nil, err
	}

	// The URL is operator-configured but fetched unattended, so it goes through
	// the SSRF-protected client instead of the plain one.
	resp, err := service.GetSSRFProtectedHTTPClient().Do(req)
	if err != nil {
		return nil, fmt.Errorf("拉取价格表失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("拉取价格表失败: %s", resp.Status)
	}

	return convertLiteLLMToRatioData(io.LimitReader(resp.Body, maxRatioConfigBytes))
}

// planModelPriceSync decides, per model, which ratios to rewrite. It compares
// against the *effective* current price (including the hardcoded completion
// ratio fallbacks), so a model whose stored ratios differ from the upstream
// table only in fields that never reach billing is reported as in sync.
func planModelPriceSync(upstream map[string]any, cfg *ratio_setting.PriceSyncSetting, applyMode string) modelPriceSyncPlan {
	upstreamRatios := valueMap(upstream["model_ratio"])
	upstreamCompletion := valueMap(upstream["completion_ratio"])
	upstreamCache := valueMap(upstream["cache_ratio"])
	upstreamCreateCache := valueMap(upstream["create_cache_ratio"])

	currentRatios := ratio_setting.GetModelRatioCopy()
	currentPrices := ratio_setting.GetModelPriceCopy()

	plan := modelPriceSyncPlan{Skipped: make(map[string]int)}

	// Iterate in name order so the audit log and the task result read the same
	// way on every run.
	modelNames := make([]string, 0, len(upstreamRatios))
	for modelName := range upstreamRatios {
		modelNames = append(modelNames, modelName)
	}
	sort.Strings(modelNames)

	for _, modelName := range modelNames {
		// A zero is rejected here for the same reason it is rejected for the
		// cache multipliers: it would make the model free for every token
		// class, and an upstream reporting no price is a gap in the table far
		// more often than a real giveaway.
		newRatio, ok := usableUpstreamRatio(upstreamRatios, modelName)
		if !ok {
			plan.Skipped[priceSyncSkipUnusable]++
			continue
		}
		if cfg.IsModelExcluded(modelName) {
			plan.Skipped[priceSyncSkipExcluded]++
			continue
		}
		currentRatio, priced := currentRatios[modelName]
		if !priced && cfg.OnlyKnownModels {
			plan.Skipped[priceSyncSkipUnknown]++
			continue
		}
		// A model present in ModelPrice is billed per call and its ratio is
		// dead config — writing one would look applied but change nothing.
		if _, perCall := currentPrices[modelName]; perCall {
			plan.Skipped[priceSyncSkipPerCall]++
			continue
		}
		if billing_setting.GetBillingMode(modelName) == billing_setting.BillingModeTieredExpr {
			plan.Skipped[priceSyncSkipTiered]++
			continue
		}

		// An unpriced model is not free today — billing falls back to the
		// unknown-model ratio — so it is compared against that fallback rather
		// than waved through as "new".
		if !priced {
			currentRatio, _, _ = ratio_setting.GetModelRatio(modelName)
		}

		change := modelPriceSyncChange{Model: modelName, IsNew: !priced}
		if !ratiosMatch(currentRatio, newRatio) || !priced {
			change.ModelRatio = &newRatio
		}

		// Completion ratio: the hardcoded table wins for some families, and a
		// value written for those is silently ignored by billing, so it is
		// reported rather than written.
		completionInfo := ratio_setting.GetCompletionRatioInfo(modelName)
		effectiveCompletion := completionInfo.Ratio
		if newCompletion, ok := usableUpstreamRatio(upstreamCompletion, modelName); ok && !ratiosMatch(effectiveCompletion, newCompletion) {
			if completionInfo.Locked {
				plan.Skipped[priceSyncCompletionLocke]++
			} else {
				change.CompletionRatio = &newCompletion
				effectiveCompletion = newCompletion
			}
		}

		currentCache, _ := ratio_setting.GetCacheRatio(modelName)
		effectiveCache := currentCache
		if newCache, ok := usableUpstreamRatio(upstreamCache, modelName); ok && !ratiosMatch(currentCache, newCache) {
			change.CacheRatio = &newCache
			effectiveCache = newCache
		}

		currentCreateCache, _ := ratio_setting.GetCreateCacheRatio(modelName)
		effectiveCreateCache := currentCreateCache
		if newCreateCache, ok := usableUpstreamRatio(upstreamCreateCache, modelName); ok && !ratiosMatch(currentCreateCache, newCreateCache) {
			change.CreateCacheRatio = &newCreateCache
			effectiveCreateCache = newCreateCache
		}

		if change.ModelRatio == nil && change.CompletionRatio == nil && change.CacheRatio == nil && change.CreateCacheRatio == nil {
			plan.Skipped[priceSyncSkipInSync]++
			continue
		}

		change.Old = modelPriceSyncPrices{
			Input:      currentRatio * usdPerMillionPerRatio,
			Output:     currentRatio * completionInfo.Ratio * usdPerMillionPerRatio,
			CacheRead:  currentRatio * currentCache * usdPerMillionPerRatio,
			CacheWrite: currentRatio * currentCreateCache * usdPerMillionPerRatio,
		}
		change.New = modelPriceSyncPrices{
			Input:      newRatio * usdPerMillionPerRatio,
			Output:     newRatio * effectiveCompletion * usdPerMillionPerRatio,
			CacheRead:  newRatio * effectiveCache * usdPerMillionPerRatio,
			CacheWrite: newRatio * effectiveCreateCache * usdPerMillionPerRatio,
		}

		if applyMode == ratio_setting.PriceSyncApplyModeDecreaseOnly && change.isPriceIncrease() {
			plan.Deferred = append(plan.Deferred, change)
			continue
		}
		plan.Changes = append(plan.Changes, change)
	}

	return plan
}

// buildPriceSyncOptionUpdates merges the planned changes into a copy of each
// live ratio map and returns the option payloads to persist.
//
// Every ratio option is stored as a whole map and applied with replace, not
// merge semantics: a model missing from the written JSON stops being priced and
// falls back to the 37.5 unknown-model ratio. So the merge starts from the
// current map, only ever adds or overwrites keys, and refuses to emit a payload
// that lost one.
func buildPriceSyncOptionUpdates(merged map[string]map[string]float64, changes []modelPriceSyncChange) (map[string]string, error) {
	originalSize := make(map[string]int, len(merged))
	for key, values := range merged {
		originalSize[key] = len(values)
	}

	touched := make(map[string]bool, len(merged))
	for _, change := range changes {
		for key, value := range map[string]*float64{
			"ModelRatio":       change.ModelRatio,
			"CompletionRatio":  change.CompletionRatio,
			"CacheRatio":       change.CacheRatio,
			"CreateCacheRatio": change.CreateCacheRatio,
		} {
			if value == nil {
				continue
			}
			if math.IsNaN(*value) || math.IsInf(*value, 0) {
				return nil, fmt.Errorf("模型 %s 的 %s 不是有效数值，已中止写入", change.Model, key)
			}
			merged[key][change.Model] = *value
			touched[key] = true
		}
	}

	updates := make(map[string]string, len(touched))
	for key := range touched {
		values := merged[key]
		if len(values) < originalSize[key] {
			return nil, fmt.Errorf("%s 合并后条目减少（%d -> %d），已中止写入以避免模型丢价", key, originalSize[key], len(values))
		}
		payload, err := common.Marshal(values)
		if err != nil {
			return nil, fmt.Errorf("序列化 %s 失败: %w", key, err)
		}
		// Round-trip before persisting: UpdateOption writes the DB row before
		// applying the value, and a payload that fails to parse empties the
		// in-memory map on every node.
		var verify map[string]float64
		if err := common.Unmarshal(payload, &verify); err != nil {
			return nil, fmt.Errorf("校验 %s 失败: %w", key, err)
		}
		if len(verify) != len(values) {
			return nil, fmt.Errorf("校验 %s 失败：条目数不一致（%d != %d）", key, len(verify), len(values))
		}
		updates[key] = string(payload)
	}
	return updates, nil
}

// ratioMapsForMerge returns the map each ratio option must be merged onto.
//
// It prefers the persisted row over this process's in-memory copy: options
// propagate between nodes only by polling the database every SyncFrequency
// seconds, so the in-memory map can be up to a minute behind an edit made on
// another node — and since the write replaces the whole map, merging onto a
// stale copy would silently revert that edit. A key with no row yet has never
// been customized, so the in-memory value (the code defaults) is authoritative.
func ratioMapsForMerge() map[string]map[string]float64 {
	merged := map[string]map[string]float64{
		"ModelRatio":       ratio_setting.GetModelRatioCopy(),
		"CompletionRatio":  ratio_setting.GetCompletionRatioCopy(),
		"CacheRatio":       ratio_setting.GetCacheRatioCopy(),
		"CreateCacheRatio": ratio_setting.GetCreateCacheRatioCopy(),
	}

	options, err := model.AllOption()
	if err != nil {
		common.SysLog(fmt.Sprintf("[PriceSync] 读取已保存倍率失败，改用内存快照合并: %v", err))
		return merged
	}
	for _, option := range options {
		if _, wanted := merged[option.Key]; !wanted {
			continue
		}
		var persisted map[string]float64
		if err := common.UnmarshalJsonStr(option.Value, &persisted); err != nil {
			common.SysLog(fmt.Sprintf("[PriceSync] 已保存的 %s 无法解析，改用内存快照合并: %v", option.Key, err))
			continue
		}
		merged[option.Key] = persisted
	}
	return merged
}

func applyModelPriceSyncChanges(changes []modelPriceSyncChange) error {
	updates, err := buildPriceSyncOptionUpdates(ratioMapsForMerge(), changes)
	if err != nil {
		return err
	}
	if len(updates) == 0 {
		return nil
	}
	if err := model.UpdateOptionsBulk(updates); err != nil {
		return fmt.Errorf("写入倍率失败: %w", err)
	}
	// Ratio writes do not invalidate the pricing cache on their own, so the
	// console would keep serving the old prices for up to a minute.
	model.InvalidatePricingCache()
	return nil
}
