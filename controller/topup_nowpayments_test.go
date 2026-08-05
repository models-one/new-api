package controller

import (
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/stretchr/testify/require"
)

func TestValidateNowPaymentsFinishedPayment(t *testing.T) {
	baseTopUp := model.TopUp{
		TradeNo:         "NOWPAYMENTS-ORDER-1",
		Money:           49.99,
		PaymentProvider: model.PaymentProviderNowPayments,
	}
	basePayload := service.NowPaymentsIPN{
		OrderID:         baseTopUp.TradeNo,
		PriceAmount:     49.99,
		PriceCurrency:   "USD",
		ParentPaymentID: nil,
	}

	testCases := []struct {
		name    string
		topUp   model.TopUp
		payload service.NowPaymentsIPN
		valid   bool
	}{
		{name: "valid finished payment", topUp: baseTopUp, payload: basePayload, valid: true},
		{name: "wrong amount", topUp: baseTopUp, payload: func() service.NowPaymentsIPN {
			value := basePayload
			value.PriceAmount = 49.98
			return value
		}()},
		{name: "wrong currency", topUp: baseTopUp, payload: func() service.NowPaymentsIPN {
			value := basePayload
			value.PriceCurrency = "eur"
			return value
		}()},
		{name: "child payment", topUp: baseTopUp, payload: func() service.NowPaymentsIPN {
			value := basePayload
			value.ParentPaymentID = 12345
			return value
		}()},
		{name: "wrong order id", topUp: baseTopUp, payload: func() service.NowPaymentsIPN {
			value := basePayload
			value.OrderID = "OTHER"
			return value
		}()},
		{name: "wrong provider", topUp: func() model.TopUp {
			value := baseTopUp
			value.PaymentProvider = model.PaymentProviderEpay
			return value
		}(), payload: basePayload},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			err := validateNowPaymentsFinishedPayment(&testCase.topUp, &testCase.payload)
			if testCase.valid {
				require.NoError(t, err)
				return
			}
			require.Error(t, err)
		})
	}
}
