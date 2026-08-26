package middleware

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSetupContextForTokenIncludesScopedAutoGroups(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	token := &model.Token{
		Id:         42,
		UserId:     7,
		Group:      "auto",
		AutoGroups: "gpt-priority,claude-standard",
	}

	require.NoError(t, SetupContextForToken(ctx, token))
	assert.Equal(t, []string{"gpt-priority", "claude-standard"}, common.GetContextKeyStringSlice(ctx, constant.ContextKeyTokenAutoGroups))
}
