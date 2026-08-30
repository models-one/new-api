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
		"/playground",
		"/usage-logs/drawing",
		"/usage-logs/task",
		"/dashboard/flow",
		"/dashboard/users",
		"/chat/0",
		"/chat2link",
		"/users",
		"/system-info",
		"/channels",
		"/system-settings",
		"/system-settings/billing/payment",
		"/keys",
		"/profile",
		"/profile/security",
		"/profile/preferences",
		"/subscriptions",
		"/redemption-codes",
		"/rankings",
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

	// The trailing entries guard the prefix match: a name that merely starts with a
	// whitelisted path is not under it, and stays on the legacy frontend.
	legacyPaths := []string{
		"/dashboard-old",
		"/models2",
		"/usernames",
		"/channels-old",
		"/system-settings-old",
		"/resets",
		"/aboutus",
		"/profiles",
		"/rankings-old",
	}
	for _, path := range legacyPaths {
		assert.Equal(t, legacyIndex, webIndexForPath(path, legacyIndex, customIndex), path)
	}
}

func TestWebIndexForPathFallsBackWhenCustomBuildIsUnavailable(t *testing.T) {
	legacyIndex := []byte("legacy")

	assert.Equal(t, legacyIndex, webIndexForPath("/settings", legacyIndex, nil))
}
