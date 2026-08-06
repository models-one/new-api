package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVerifyNowPaymentsIPNUsesRecursiveSortedHMACSHA512(t *testing.T) {
	body := []byte(`{"items":[{"z":"<&","a":1}],"b":2,"a":{"d":4,"c":3},"payment_status":"finished","order_id":"order-1","price_amount":49.99,"price_currency":"usd"}`)

	payload, err := VerifyNowPaymentsIPN(
		body,
		"4acc43030301bd44f452b11b60cc001fb77a1e35e02dbb8472b12e24930f63287ad84970a11e1eb5505ce86ec5f8452f33132f4cbb3f6e767e573a130f5d0f79",
		"secret",
	)

	require.NoError(t, err)
	assert.Equal(t, "finished", payload.PaymentStatus)
	assert.Equal(t, "order-1", payload.OrderID)

	_, err = VerifyNowPaymentsIPN(body, "bad-signature", "secret")
	require.Error(t, err)
}

func TestNowPaymentsClientCreatesHostedInvoice(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		assert.Equal(t, http.MethodPost, request.Method)
		assert.Equal(t, "/v1/invoice", request.URL.Path)
		assert.Equal(t, "test-api-key", request.Header.Get("X-Api-Key"))
		assert.Equal(t, "application/json", request.Header.Get("Content-Type"))

		var body map[string]any
		require.NoError(t, common.DecodeJson(request.Body, &body))
		assert.Equal(t, float64(49.99), body["price_amount"])
		assert.Equal(t, "usd", body["price_currency"])
		assert.Equal(t, "order-1", body["order_id"])
		assert.Equal(t, true, body["is_fee_paid_by_user"])
		assert.NotContains(t, body, "pay_currency")

		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusCreated)
		_, _ = writer.Write([]byte(`{"id":"invoice-1","invoice_url":"https://nowpayments.io/payment/?iid=invoice-1","price_amount":"49.99","price_currency":"usd","order_id":"order-1"}`))
	}))
	t.Cleanup(server.Close)

	client := &nowPaymentsClient{
		baseURL:    server.URL,
		apiKey:     "test-api-key",
		httpClient: server.Client(),
	}
	invoice, err := client.createInvoice(context.Background(), &NowPaymentsInvoiceParams{
		PriceAmount:      49.99,
		PriceCurrency:    "usd",
		OrderID:          "order-1",
		OrderDescription: "Account top-up",
		IPNCallbackURL:   "https://example.com/api/nowpayments/webhook",
		SuccessURL:       "https://example.com/wallet?pay=success",
		CancelURL:        "https://example.com/wallet?pay=cancelled",
		FeePaidByUser:    true,
	})

	require.NoError(t, err)
	assert.Equal(t, "invoice-1", invoice.ID)
	assert.Equal(t, "https://nowpayments.io/payment/?iid=invoice-1", invoice.InvoiceURL)
}
