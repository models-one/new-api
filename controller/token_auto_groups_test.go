package controller

import (
	"net/http"
	"testing"

	"github.com/QuantumNous/new-api/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAddTokenPersistsScopedAutoGroups(t *testing.T) {
	db := setupTokenControllerTestDB(t)
	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/token/", model.Token{
		Name:           "multi-group-key",
		ExpiredTime:    -1,
		UnlimitedQuota: true,
		Group:          "default",
		AutoGroups:     "gpt-priority, claude-standard,gpt-priority",
	}, 9)

	AddToken(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var token model.Token
	require.NoError(t, db.Where("user_id = ?", 9).First(&token).Error)
	assert.Equal(t, "auto", token.Group)
	assert.Equal(t, "gpt-priority,claude-standard", token.AutoGroups)
}
