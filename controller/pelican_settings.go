package controller

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm/clause"
)

// A refresh or a PAT does not count as reauthentication for changing credentials.
func RequireRecentPelicanLogin(c *gin.Context) {
	identity, ok := middleware.GetSessionAuthIdentity(c)
	if ok {
		if session, _, err := service.ValidateLoginSession(identity); err == nil {
			age := time.Since(time.Unix(session.CreatedAt, 0))
			if age >= 0 && age <= 15*time.Minute {
				return
			}
		}
	}
	c.Abort()
	common.ApiErrorStatus(c, http.StatusForbidden, common.NewMessage("Sign in again before changing test service settings"))
}

func validatePelicanServiceToken(token string) error {
	if len(token) < 32 || len(token) > 512 || strings.ContainsFunc(token, func(r rune) bool {
		return unicode.IsSpace(r) || unicode.IsControl(r)
	}) {
		return common.NewMessage("Artifact service token must contain 32 to 512 characters without whitespace")
	}
	return nil
}

func GetPelicanSettings(c *gin.Context) {
	connection, _ := system_setting.PelicanConnectionSnapshot()
	type tokenChoice struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}
	tokens := make([]tokenChoice, 0)
	if err := model.DB.Model(&model.Token{}).
		Select("id", "name").
		Where("user_id = ? AND status = ? AND (expired_time = -1 OR expired_time > ?)", c.GetInt("id"), common.TokenStatusEnabled, time.Now().Unix()).
		Where(clause.Not(clause.IN{Column: "group", Values: []any{"", "auto"}})).
		Order("id DESC").Limit(1000).Find(&tokens).Error; err != nil {
		pelicanAPIError(c, err, http.StatusInternalServerError)
		return
	}
	common.ApiSuccess(c, gin.H{
		"url":                      connection.URL,
		"service_token_configured": connection.SealedToken != "" || validatePelicanExistingToken(os.Getenv("PELICAN_SERVICE_TOKEN")) == nil,
		"test_token_id":            system_setting.PelicanTestTokenID(),
		"test_tokens":              tokens,
	})
}

func UpdatePelicanConnection(c *gin.Context) {
	var input struct {
		URL   *string `json:"url"`
		Token string  `json:"service_token"`
	}
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 8192), &input); err != nil || input.URL == nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	address, err := system_setting.NormalizePelicanServiceURL(*input.URL)
	if err != nil {
		common.ApiErrorStatus(c, http.StatusBadRequest, err)
		return
	}
	connection := system_setting.PelicanConnection{URL: address}
	token := input.Token
	if address == "" {
		// Clearing overrides restores the environment pair, never a stored token
		// combined with a different address.
		if token != "" {
			common.ApiErrorStatus(c, http.StatusBadRequest, system_setting.ErrPelicanServiceURLInvalid)
			return
		}
		token = os.Getenv("PELICAN_SERVICE_TOKEN")
		address, err = system_setting.NormalizePelicanServiceURL(os.Getenv("PELICAN_SERVICE_URL"))
	} else if token == "" {
		current, currentErr := system_setting.PelicanConnectionSnapshot()
		if currentErr != nil || current.URL != address {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Enter a service token when changing the artifact service URL"))
			return
		}
		connection.SealedToken = current.SealedToken
		token, err = current.Token()
	} else if err = validatePelicanServiceToken(token); err == nil {
		err = connection.SealToken(token)
	}
	if err == nil && address != "" {
		err = validatePelicanExistingToken(token)
		if err == nil {
			err = pelicanCheckService(c.Request.Context(), pelicanConfig{URL: address, ServiceToken: token})
		}
	}
	if err != nil {
		if _, ok := err.(*pelicanDiagnosticError); ok {
			pelicanConnectionError(c, err, http.StatusBadRequest, pelicanConfig{ServiceToken: token})
		} else {
			common.ApiErrorStatus(c, http.StatusBadRequest, err)
		}
		return
	}
	encoded, err := common.Marshal(connection)
	if err == nil {
		err = model.UpdateOptionsBulk(map[string]string{system_setting.PelicanConnectionOptionKey: string(encoded)})
	}
	if err != nil {
		pelicanAPIError(c, err, http.StatusInternalServerError)
		return
	}
	common.ApiSuccess(c, nil)
}

func UpdatePelicanTestToken(c *gin.Context) {
	var input struct {
		ID *int `json:"id"`
	}
	if err := common.DecodeJson(http.MaxBytesReader(c.Writer, c.Request.Body, 4096), &input); err != nil || input.ID == nil || *input.ID < 0 {
		common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Invalid parameters"))
		return
	}
	value := ""
	if *input.ID > 0 {
		token, err := model.GetTokenByIds(*input.ID, c.GetInt("id"))
		if err != nil || token.Status != common.TokenStatusEnabled || token.Group == "" || token.Group == "auto" ||
			(token.ExpiredTime != -1 && token.ExpiredTime <= time.Now().Unix()) {
			common.ApiErrorStatus(c, http.StatusBadRequest, common.NewMessage("Select an enabled API key from your account with a fixed group"))
			return
		}
		value = strconv.Itoa(token.Id)
	}
	if err := model.UpdateOptionsBulk(map[string]string{system_setting.PelicanTestTokenOptionKey: value}); err != nil {
		pelicanAPIError(c, err, http.StatusInternalServerError)
		return
	}
	common.ApiSuccess(c, nil)
}
