package ratio_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPriceSyncSettingIsModelExcluded(t *testing.T) {
	setting := &PriceSyncSetting{ExcludeModels: "deepseek-*, gpt-4o ,, claude-*"}

	cases := map[string]bool{
		"deepseek-chat":     true,
		"deepseek-reasoner": true,
		"deepseek":          false,
		"gpt-4o":            true,
		"gpt-4o-mini":       false,
		"claude-opus-4-8":   true,
		"gpt-5.6-terra":     false,
	}
	for name, excluded := range cases {
		assert.Equal(t, excluded, setting.IsModelExcluded(name), name)
	}

	assert.False(t, (&PriceSyncSetting{}).IsModelExcluded("gpt-5.6-terra"))
}

func TestPriceSyncSettingResolvedApplyMode(t *testing.T) {
	cases := map[string]string{
		PriceSyncApplyModeAll:          PriceSyncApplyModeAll,
		PriceSyncApplyModeDryRun:       PriceSyncApplyModeDryRun,
		PriceSyncApplyModeDecreaseOnly: PriceSyncApplyModeDecreaseOnly,
		// An empty or unrecognized mode must never mean "write everything".
		"":        PriceSyncApplyModeDecreaseOnly,
		"garbage": PriceSyncApplyModeDecreaseOnly,
	}
	for configured, expected := range cases {
		assert.Equal(t, expected, (&PriceSyncSetting{ApplyMode: configured}).ResolvedApplyMode(), configured)
	}
}

func TestPriceSyncSettingDefaultsAreSafe(t *testing.T) {
	setting := GetPriceSyncSetting()
	assert.False(t, setting.Enabled, "price sync must be opt-in: it rewrites selling prices")
	assert.Equal(t, PriceSyncApplyModeDecreaseOnly, setting.ResolvedApplyMode())
	assert.True(t, setting.OnlyKnownModels)
	assert.Greater(t, setting.MinSourceModels, 0)
}
