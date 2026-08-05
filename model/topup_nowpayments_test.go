package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRechargeNowPaymentsCreditsOrderExactlyOnce(t *testing.T) {
	truncateTables(t)
	originalQuotaPerUnit := common.QuotaPerUnit
	common.QuotaPerUnit = 500000
	t.Cleanup(func() { common.QuotaPerUnit = originalQuotaPerUnit })

	insertUserForPaymentGuardTest(t, 501, 100)
	insertTopUpForPaymentGuardTest(t, "nowpayments-idempotent", 501, PaymentProviderNowPayments)

	require.NoError(t, RechargeNowPayments("nowpayments-idempotent", "127.0.0.1"))
	require.NoError(t, RechargeNowPayments("nowpayments-idempotent", "127.0.0.1"))

	assert.Equal(t, 1000000+100, getUserQuotaForPaymentGuardTest(t, 501))
	assert.Equal(t, common.TopUpStatusSuccess, getTopUpStatusForPaymentGuardTest(t, "nowpayments-idempotent"))
}

func TestRechargeNowPaymentsRejectsMismatchedProvider(t *testing.T) {
	truncateTables(t)
	insertUserForPaymentGuardTest(t, 502, 0)
	insertTopUpForPaymentGuardTest(t, "nowpayments-provider-guard", 502, PaymentProviderStripe)

	err := RechargeNowPayments("nowpayments-provider-guard", "127.0.0.1")
	require.ErrorIs(t, err, ErrPaymentMethodMismatch)
	assert.Equal(t, 0, getUserQuotaForPaymentGuardTest(t, 502))
	assert.Equal(t, common.TopUpStatusPending, getTopUpStatusForPaymentGuardTest(t, "nowpayments-provider-guard"))
}
