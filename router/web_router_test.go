package router

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestWebIndexForPathUsesCustomIndexForCustomRoutes(t *testing.T) {
	legacyIndex := []byte("legacy")
	customIndex := []byte("custom")

	customPaths := []string{
		"/",
		"/dashboard",
		"/settings",
		"/models/compare",
		"/usage",
		"/analytics",
		"/logs/request-1",
		"/organization",
		"/wallet",
	}
	for _, path := range customPaths {
		assert.Equal(t, customIndex, webIndexForPath(path, legacyIndex, customIndex), path)
	}
}

func TestWebIndexForPathKeepsLegacyRoutesOnLegacyFrontend(t *testing.T) {
	legacyIndex := []byte("legacy")
	customIndex := []byte("custom")

	legacyPaths := []string{
		"/sign-in",
		"/oauth/github",
		"/keys",
		"/system-settings",
		"/dashboard-old",
		"/models2",
	}
	for _, path := range legacyPaths {
		assert.Equal(t, legacyIndex, webIndexForPath(path, legacyIndex, customIndex), path)
	}
}

func TestWebIndexForPathFallsBackWhenCustomBuildIsUnavailable(t *testing.T) {
	legacyIndex := []byte("legacy")

	assert.Equal(t, legacyIndex, webIndexForPath("/settings", legacyIndex, nil))
}
