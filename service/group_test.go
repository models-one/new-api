package service

import (
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestGetRequestAutoGroupsPrefersTokenScopedGroups(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	common.SetContextKey(ctx, constant.ContextKeyTokenAutoGroups, []string{"gpt-priority", "claude-standard"})

	groups := GetRequestAutoGroups(ctx, "default")
	groups[0] = "changed"

	assert.Equal(t, []string{"gpt-priority", "claude-standard"}, common.GetContextKeyStringSlice(ctx, constant.ContextKeyTokenAutoGroups))
}
