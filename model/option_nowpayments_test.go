package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUpdateOptionPersistsNowPaymentsFeePaidByUser(t *testing.T) {
	db := useFrontendOptionMigrationDB(t)
	previousOptionMap := common.OptionMap
	previousValue := setting.NowPaymentsFeePaidByUser
	common.OptionMap = map[string]string{}
	t.Cleanup(func() {
		common.OptionMap = previousOptionMap
		setting.NowPaymentsFeePaidByUser = previousValue
	})

	require.NoError(t, UpdateOption("NowPaymentsFeePaidByUser", "true"))
	assert.True(t, setting.NowPaymentsFeePaidByUser)
	assert.Equal(t, "true", common.OptionMap["NowPaymentsFeePaidByUser"])
	assert.Equal(t, "true", requireOptionValue(t, db, "NowPaymentsFeePaidByUser"))

	require.NoError(t, UpdateOption("NowPaymentsFeePaidByUser", "false"))
	assert.False(t, setting.NowPaymentsFeePaidByUser)
	assert.Equal(t, "false", common.OptionMap["NowPaymentsFeePaidByUser"])
}
