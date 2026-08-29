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
		"/sign-in",
		"/sign-up",
		"/register",
		"/forgot-password",
		"/reset",
		"/user/reset",
		"/otp",
		"/oauth",
		"/oauth/github",
		"/pricing",
		"/pricing/gpt-4o",
		"/about",
		"/privacy-policy",
		"/user-agreement",
		"/setup",
		"/401",
		"/403",
		"/404",
		"/500",
		"/503",
		"/errors/not-found",
	}
	for _, path := range customPaths {
		assert.Equal(t, customIndex, webIndexForPath(path, legacyIndex, customIndex), path)
	}
}

func TestWebIndexForPathKeepsLegacyRoutesOnLegacyFrontend(t *testing.T) {
	legacyIndex := []byte("legacy")
	customIndex := []byte("custom")

	// The last five guard the prefix match: an entry only claims its own path and
	// what sits under it, so a longer name that merely starts with one stays legacy.
	legacyPaths := []string{
		"/keys",
		"/system-settings",
		"/channels",
		"/playground",
		"/profile",
		"/dashboard-old",
		"/models2",
		"/users",
		"/resets",
		"/aboutus",
	}
	for _, path := range legacyPaths {
		assert.Equal(t, legacyIndex, webIndexForPath(path, legacyIndex, customIndex), path)
	}
}

func TestWebIndexForPathFallsBackWhenCustomBuildIsUnavailable(t *testing.T) {
	legacyIndex := []byte("legacy")

	assert.Equal(t, legacyIndex, webIndexForPath("/settings", legacyIndex, nil))
}
