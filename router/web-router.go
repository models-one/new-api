package router

import (
	"embed"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   embed.FS
	IndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets WebAssets) {
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")
	customIndexPage, _ := assets.BuildFS.ReadFile("web/dist/web-custom-index.html")

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	router.GET("/", func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", webIndexForPath("/", assets.IndexPage, customIndexPage))
	})
	router.Use(static.Serve("/", frontendFS))
	router.NoRoute(func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/v1") || strings.HasPrefix(path, "/api") || strings.HasPrefix(path, "/assets") || strings.HasPrefix(path, "/web-custom-assets/") {
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", webIndexForPath(path, assets.IndexPage, customIndexPage))
	})
}

func webIndexForPath(path string, legacyIndexPage []byte, customIndexPage []byte) []byte {
	if len(customIndexPage) == 0 {
		return legacyIndexPage
	}

	customRoutes := [...]string{
		"/dashboard",
		"/settings",
		"/models",
		"/usage",
		"/analytics",
		"/logs",
		"/organization",
		"/wallet",
	}
	if path == "/" {
		return customIndexPage
	}
	for _, route := range customRoutes {
		if path == route || strings.HasPrefix(path, route+"/") {
			return customIndexPage
		}
	}
	return legacyIndexPage
}
