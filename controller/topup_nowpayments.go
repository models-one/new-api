package controller

import (
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/shopspring/decimal"
	"github.com/thanhpk/randstr"
)

type NowPaymentsPayRequest struct {
	Amount int64 `json:"amount"`
}

func getNowPaymentsPayMoney(amount int64, group string) float64 {
	unitPrice := setting.NowPaymentsUnitPrice
	if unitPrice <= 0 || math.IsNaN(unitPrice) || math.IsInf(unitPrice, 0) {
		return 0
	}
	dAmount := decimal.NewFromInt(amount)
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dAmount = dAmount.Div(decimal.NewFromFloat(common.QuotaPerUnit))
	}

	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio <= 0 || math.IsNaN(topupGroupRatio) || math.IsInf(topupGroupRatio, 0) {
		topupGroupRatio = 1
	}
	discount := 1.0
	if configured, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok && configured > 0 {
		discount = configured
	}

	money := dAmount.
		Mul(decimal.NewFromFloat(unitPrice)).
		Mul(decimal.NewFromFloat(topupGroupRatio)).
		Mul(decimal.NewFromFloat(discount)).
		Round(2)
	return money.InexactFloat64()
}

func normalizeNowPaymentsTopUpAmount(amount int64) int64 {
	if operation_setting.GetQuotaDisplayType() != operation_setting.QuotaDisplayTypeTokens {
		return amount
	}
	normalized := decimal.NewFromInt(amount).
		Div(decimal.NewFromFloat(common.QuotaPerUnit)).
		IntPart()
	if normalized < 1 {
		return 1
	}
	return normalized
}

func validateNowPaymentsAmount(amount int64) error {
	minimum := setting.NowPaymentsMinTopUp
	if minimum < 1 {
		minimum = 1
	}
	if amount < int64(minimum) {
		return fmt.Errorf("充值数量不能小于 %d", minimum)
	}
	normalized := normalizeNowPaymentsTopUpAmount(amount)
	quota, clamp := common.QuotaFromDecimalChecked(
		decimal.NewFromInt(normalized).Mul(decimal.NewFromFloat(common.QuotaPerUnit)),
	)
	if clamp != nil || quota <= 0 {
		return errors.New("充值数量过大")
	}
	return nil
}

func RequestNowPaymentsAmount(c *gin.Context) {
	var req NowPaymentsPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	if err := validateNowPaymentsAmount(req.Amount); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": err.Error()})
		return
	}

	group, err := model.GetUserGroup(c.GetInt("id"), true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getNowPaymentsPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": fmt.Sprintf("%.2f", payMoney)})
}

func RequestNowPaymentsPay(c *gin.Context) {
	if !isNowPaymentsTopUpEnabled() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "NOWPayments 配置不完整"})
		return
	}

	var req NowPaymentsPayRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	if err := validateNowPaymentsAmount(req.Amount); err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": err.Error()})
		return
	}

	userID := c.GetInt("id")
	group, err := model.GetUserGroup(userID, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getNowPaymentsPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}

	callbackAddress := strings.TrimRight(service.GetCallbackAddress(), "/")
	ipnCallbackURL := callbackAddress + "/api/nowpayments/webhook"
	successURL := paymentReturnPath("/wallet?pay=success")
	cancelURL := paymentReturnPath("/wallet?pay=cancelled")
	for _, rawURL := range []string{ipnCallbackURL, successURL, cancelURL} {
		parsedURL, err := url.Parse(rawURL)
		if err != nil || (parsedURL.Scheme != "http" && parsedURL.Scheme != "https") || parsedURL.Host == "" {
			c.JSON(http.StatusOK, gin.H{"message": "error", "data": "请先配置有效的服务器地址"})
			return
		}
	}
	tradeNo := fmt.Sprintf("NOWPAYMENTS-%d-%d-%s", userID, time.Now().UnixMilli(), randstr.String(6))
	topUp := &model.TopUp{
		UserId:          userID,
		Amount:          normalizeNowPaymentsTopUpAmount(req.Amount),
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   model.PaymentMethodNowPayments,
		PaymentProvider: model.PaymentProviderNowPayments,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	if err := topUp.Insert(); err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("NOWPayments 创建充值订单失败 user_id=%d trade_no=%s error=%q", userID, tradeNo, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}

	invoice, err := service.CreateNowPaymentsInvoice(c.Request.Context(), &service.NowPaymentsInvoiceParams{
		PriceAmount:      payMoney,
		PriceCurrency:    "usd",
		OrderID:          tradeNo,
		OrderDescription: "Account top-up",
		IPNCallbackURL:   ipnCallbackURL,
		SuccessURL:       successURL,
		CancelURL:        cancelURL,
		FeePaidByUser:    setting.NowPaymentsFeePaidByUser,
	})
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("NOWPayments 创建 invoice 失败 user_id=%d trade_no=%s error=%q", userID, tradeNo, err.Error()))
		_ = model.UpdatePendingTopUpStatus(tradeNo, model.PaymentProviderNowPayments, common.TopUpStatusFailed)
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}

	logger.LogInfo(c.Request.Context(), fmt.Sprintf("NOWPayments 充值订单创建成功 user_id=%d trade_no=%s invoice_id=%v amount=%d money=%.2f", userID, tradeNo, invoice.ID, req.Amount, payMoney))
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data": gin.H{
			"invoice_url": invoice.InvoiceURL,
			"invoice_id":  invoice.ID,
			"order_id":    tradeNo,
		},
	})
}

func validateNowPaymentsFinishedPayment(topUp *model.TopUp, payload *service.NowPaymentsIPN) error {
	if topUp == nil || payload == nil {
		return errors.New("missing order or payment payload")
	}
	if topUp.PaymentProvider != model.PaymentProviderNowPayments {
		return model.ErrPaymentMethodMismatch
	}
	if strings.TrimSpace(payload.OrderID) == "" || payload.OrderID != topUp.TradeNo {
		return errors.New("order id mismatch")
	}
	if !strings.EqualFold(strings.TrimSpace(payload.PriceCurrency), "usd") {
		return errors.New("price currency mismatch")
	}
	if payload.HasParentPayment() {
		return errors.New("child payment is not eligible for top-up")
	}
	priceAmount, err := payload.PriceAmountDecimal()
	if err != nil {
		return err
	}
	expected := decimal.NewFromFloat(topUp.Money).Round(2)
	if !priceAmount.Equal(expected) {
		return fmt.Errorf("price amount mismatch: expected=%s actual=%s", expected.StringFixed(2), priceAmount.String())
	}
	return nil
}

func NowPaymentsWebhook(c *gin.Context) {
	if !isNowPaymentsWebhookEnabled() {
		c.String(http.StatusForbidden, "webhook disabled")
		return
	}
	body, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.String(http.StatusBadRequest, "bad request")
		return
	}
	payload, err := service.VerifyNowPaymentsIPN(body, c.GetHeader("X-Nowpayments-Sig"), setting.NowPaymentsIPNSecret)
	if err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("NOWPayments IPN 验签失败 client_ip=%s error=%q", c.ClientIP(), err.Error()))
		c.String(http.StatusUnauthorized, "invalid signature")
		return
	}

	status := strings.ToLower(strings.TrimSpace(payload.PaymentStatus))
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("NOWPayments IPN 验签成功 payment_id=%s trade_no=%s status=%s client_ip=%s", payload.PaymentIDString(), payload.OrderID, status, c.ClientIP()))
	if status != "finished" {
		if status == "failed" || status == "expired" {
			targetStatus := common.TopUpStatusFailed
			if status == "expired" {
				targetStatus = common.TopUpStatusExpired
			}
			err := model.UpdatePendingTopUpStatus(payload.OrderID, model.PaymentProviderNowPayments, targetStatus)
			if err != nil && !errors.Is(err, model.ErrTopUpNotFound) && !errors.Is(err, model.ErrTopUpStatusInvalid) {
				logger.LogWarn(c.Request.Context(), fmt.Sprintf("NOWPayments 更新订单状态失败 trade_no=%s status=%s error=%q", payload.OrderID, status, err.Error()))
			}
		}
		c.Status(http.StatusOK)
		return
	}

	topUp := model.GetTopUpByTradeNo(payload.OrderID)
	if err := validateNowPaymentsFinishedPayment(topUp, payload); err != nil {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("NOWPayments IPN 订单校验失败 payment_id=%s trade_no=%s error=%q", payload.PaymentIDString(), payload.OrderID, err.Error()))
		c.String(http.StatusBadRequest, "payment validation failed")
		return
	}
	if err := model.RechargeNowPayments(payload.OrderID, c.ClientIP()); err != nil {
		if errors.Is(err, model.ErrTopUpStatusInvalid) {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("NOWPayments finished IPN 对应订单已关闭 payment_id=%s trade_no=%s", payload.PaymentIDString(), payload.OrderID))
			c.Status(http.StatusOK)
			return
		}
		logger.LogError(c.Request.Context(), fmt.Sprintf("NOWPayments 充值处理失败 payment_id=%s trade_no=%s error=%q", payload.PaymentIDString(), payload.OrderID, err.Error()))
		c.String(http.StatusInternalServerError, "top-up failed")
		return
	}
	c.Status(http.StatusOK)
}
