package service

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting"
	"github.com/shopspring/decimal"
)

const nowPaymentsAPIBaseURL = "https://api.nowpayments.io"

type NowPaymentsInvoiceParams struct {
	PriceAmount      float64 `json:"price_amount"`
	PriceCurrency    string  `json:"price_currency"`
	OrderID          string  `json:"order_id"`
	OrderDescription string  `json:"order_description"`
	IPNCallbackURL   string  `json:"ipn_callback_url"`
	SuccessURL       string  `json:"success_url"`
	CancelURL        string  `json:"cancel_url"`
	FeePaidByUser    bool    `json:"is_fee_paid_by_user"`
}

type NowPaymentsInvoice struct {
	ID            any    `json:"id"`
	OrderID       string `json:"order_id"`
	InvoiceURL    string `json:"invoice_url"`
	PriceAmount   any    `json:"price_amount"`
	PriceCurrency string `json:"price_currency"`
}

type NowPaymentsIPN struct {
	PaymentID        any    `json:"payment_id"`
	PaymentStatus    string `json:"payment_status"`
	PayAddress       string `json:"pay_address"`
	PriceAmount      any    `json:"price_amount"`
	PriceCurrency    string `json:"price_currency"`
	PayAmount        any    `json:"pay_amount"`
	ActuallyPaid     any    `json:"actually_paid"`
	PayCurrency      string `json:"pay_currency"`
	OrderID          string `json:"order_id"`
	OrderDescription string `json:"order_description"`
	ParentPaymentID  any    `json:"parent_payment_id"`
}

func (payload *NowPaymentsIPN) PriceAmountDecimal() (decimal.Decimal, error) {
	if payload == nil {
		return decimal.Zero, errors.New("missing NOWPayments payload")
	}
	return nowPaymentsDecimal(payload.PriceAmount)
}

func (payload *NowPaymentsIPN) HasParentPayment() bool {
	if payload == nil || payload.ParentPaymentID == nil {
		return false
	}
	switch value := payload.ParentPaymentID.(type) {
	case string:
		trimmed := strings.TrimSpace(value)
		return trimmed != "" && trimmed != "0"
	case float64:
		return value != 0
	default:
		return true
	}
}

func (payload *NowPaymentsIPN) PaymentIDString() string {
	if payload == nil || payload.PaymentID == nil {
		return ""
	}
	return nowPaymentsValueString(payload.PaymentID)
}

type nowPaymentsClient struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

func CreateNowPaymentsInvoice(ctx context.Context, params *NowPaymentsInvoiceParams) (*NowPaymentsInvoice, error) {
	requestContext, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	client := &nowPaymentsClient{
		baseURL:    nowPaymentsAPIBaseURL,
		apiKey:     setting.NowPaymentsAPIKey,
		httpClient: GetHttpClient(),
	}
	return client.createInvoice(requestContext, params)
}

func (client *nowPaymentsClient) createInvoice(
	ctx context.Context,
	params *NowPaymentsInvoiceParams,
) (*NowPaymentsInvoice, error) {
	if params == nil {
		return nil, errors.New("missing invoice params")
	}
	if strings.TrimSpace(client.apiKey) == "" {
		return nil, errors.New("NOWPayments API key is required")
	}
	if client.httpClient == nil {
		return nil, errors.New("NOWPayments HTTP client is not initialized")
	}

	body, err := common.Marshal(params)
	if err != nil {
		return nil, fmt.Errorf("marshal NOWPayments invoice: %w", err)
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		strings.TrimRight(client.baseURL, "/")+"/v1/invoice",
		bytes.NewReader(body),
	)
	if err != nil {
		return nil, fmt.Errorf("create NOWPayments invoice request: %w", err)
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("X-Api-Key", strings.TrimSpace(client.apiKey))

	response, err := client.httpClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("call NOWPayments invoice API: %w", err)
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if err != nil {
		return nil, fmt.Errorf("read NOWPayments invoice response: %w", err)
	}
	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return nil, fmt.Errorf("NOWPayments invoice API returned status %d", response.StatusCode)
	}

	invoice := &NowPaymentsInvoice{}
	if err := common.Unmarshal(responseBody, invoice); err != nil {
		return nil, fmt.Errorf("decode NOWPayments invoice response: %w", err)
	}
	if strings.TrimSpace(invoice.InvoiceURL) == "" {
		return nil, errors.New("NOWPayments returned an empty invoice URL")
	}
	return invoice, nil
}

func VerifyNowPaymentsIPN(body []byte, signature string, secret string) (*NowPaymentsIPN, error) {
	if strings.TrimSpace(secret) == "" {
		return nil, errors.New("NOWPayments IPN secret is required")
	}
	providedSignature, err := hex.DecodeString(strings.TrimSpace(signature))
	if err != nil || len(providedSignature) != sha512.Size {
		return nil, errors.New("invalid NOWPayments IPN signature")
	}

	var canonicalValue any
	if err := common.Unmarshal(body, &canonicalValue); err != nil {
		return nil, fmt.Errorf("decode NOWPayments IPN: %w", err)
	}
	canonicalBody, err := common.Marshal(canonicalValue)
	if err != nil {
		return nil, fmt.Errorf("canonicalize NOWPayments IPN: %w", err)
	}
	canonicalBody = normalizeCanonicalJSONForJavaScript(canonicalBody)

	mac := hmac.New(sha512.New, []byte(strings.TrimSpace(secret)))
	_, _ = mac.Write(canonicalBody)
	if !hmac.Equal(mac.Sum(nil), providedSignature) {
		return nil, errors.New("invalid NOWPayments IPN signature")
	}

	payload := &NowPaymentsIPN{}
	if err := common.Unmarshal(body, payload); err != nil {
		return nil, fmt.Errorf("decode verified NOWPayments IPN: %w", err)
	}
	return payload, nil
}

func normalizeCanonicalJSONForJavaScript(value []byte) []byte {
	replacements := []struct {
		old []byte
		new []byte
	}{
		{[]byte(`\u003c`), []byte("<")},
		{[]byte(`\u003e`), []byte(">")},
		{[]byte(`\u0026`), []byte("&")},
		{[]byte(`\u2028`), []byte{0xe2, 0x80, 0xa8}},
		{[]byte(`\u2029`), []byte{0xe2, 0x80, 0xa9}},
	}
	for _, replacement := range replacements {
		value = bytes.ReplaceAll(value, replacement.old, replacement.new)
	}
	return value
}

func nowPaymentsDecimal(value any) (decimal.Decimal, error) {
	text := nowPaymentsValueString(value)
	if text == "" {
		return decimal.Zero, errors.New("missing decimal value")
	}
	parsed, err := decimal.NewFromString(text)
	if err != nil {
		return decimal.Zero, fmt.Errorf("invalid decimal value %q: %w", text, err)
	}
	return parsed, nil
}

func nowPaymentsValueString(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	case float32:
		return strconv.FormatFloat(float64(typed), 'f', -1, 32)
	case int:
		return strconv.Itoa(typed)
	case int64:
		return strconv.FormatInt(typed, 10)
	case nil:
		return ""
	default:
		return strings.TrimSpace(fmt.Sprint(typed))
	}
}
