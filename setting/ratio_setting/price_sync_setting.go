package ratio_setting

import (
	"strings"

	"github.com/QuantumNous/new-api/setting/config"
)

// Apply modes for the scheduled model price sync.
const (
	// PriceSyncApplyModeDecreaseOnly writes a model's ratios only when neither its
	// input nor its output price goes up. Price increases are reported but left
	// for an admin to apply by hand, so an upstream table change can never raise
	// what customers are charged without review.
	PriceSyncApplyModeDecreaseOnly = "decrease_only"
	// PriceSyncApplyModeAll writes every difference, increases included.
	PriceSyncApplyModeAll = "all"
	// PriceSyncApplyModeDryRun computes and records the differences without
	// touching any ratio.
	PriceSyncApplyModeDryRun = "dry_run"
)

// PriceSyncSetting drives the price_sync scheduled system task, which pulls a
// LiteLLM-format price table (the same source sub2api syncs from) and merges the
// derived ratios into ModelRatio / CompletionRatio / CacheRatio /
// CreateCacheRatio.
//
// The ratios are the *selling* price, so the defaults are deliberately
// conservative: the job is off until an admin turns it on, it never raises a
// price, and it never introduces a model the site does not already price.
type PriceSyncSetting struct {
	Enabled         bool    `json:"enabled"`
	SourceURL       string  `json:"source_url"`
	IntervalHours   float64 `json:"interval_hours"`
	ApplyMode       string  `json:"apply_mode"`
	OnlyKnownModels bool    `json:"only_known_models"`
	// ExcludeModels is a comma separated list of model names. A trailing "*"
	// makes an entry a prefix match ("deepseek-*").
	ExcludeModels string `json:"exclude_models"`
	// MinSourceModels rejects a truncated or corrupt upstream table: a response
	// carrying fewer than this many priced models is treated as a fetch failure
	// instead of being merged.
	MinSourceModels int `json:"min_source_models"`
}

// PriceSyncDefaultSourceURL is the LiteLLM-format table sub2api pulls from, so
// both stacks price from the same numbers.
const PriceSyncDefaultSourceURL = "https://raw.githubusercontent.com/Wei-Shaw/model-price-repo/refs/heads/main/model_prices_and_context_window.json"

var priceSyncSetting = PriceSyncSetting{
	Enabled:         false,
	SourceURL:       PriceSyncDefaultSourceURL,
	IntervalHours:   6,
	ApplyMode:       PriceSyncApplyModeDecreaseOnly,
	OnlyKnownModels: true,
	// DeepSeek is excluded by default: the upstream table reports a discounted
	// off-peak price for deepseek-chat / deepseek-reasoner that does not match
	// what the channels actually cost, so syncing it would roughly halve the
	// reasoner's price for no reason.
	ExcludeModels:   "deepseek-*",
	MinSourceModels: 50,
}

func init() {
	config.GlobalConfig.Register("price_sync_setting", &priceSyncSetting)
}

func GetPriceSyncSetting() *PriceSyncSetting {
	return &priceSyncSetting
}

// IsModelExcluded reports whether a model name matches the exclusion list.
func (s *PriceSyncSetting) IsModelExcluded(name string) bool {
	for _, pattern := range strings.Split(s.ExcludeModels, ",") {
		pattern = strings.TrimSpace(pattern)
		if pattern == "" {
			continue
		}
		if prefix, ok := strings.CutSuffix(pattern, "*"); ok {
			if strings.HasPrefix(name, prefix) {
				return true
			}
			continue
		}
		if name == pattern {
			return true
		}
	}
	return false
}

// ResolvedApplyMode normalizes an unrecognized or empty apply mode to the safe
// default rather than silently writing increases.
func (s *PriceSyncSetting) ResolvedApplyMode() string {
	switch s.ApplyMode {
	case PriceSyncApplyModeAll, PriceSyncApplyModeDryRun, PriceSyncApplyModeDecreaseOnly:
		return s.ApplyMode
	default:
		return PriceSyncApplyModeDecreaseOnly
	}
}
