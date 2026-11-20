package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
	"net/http"
)

func registerPelicanRoutes(api *gin.RouterGroup) {
	settings := api.Group("/pelican/settings", middleware.RootAuth(), middleware.SessionCookieOriginGuard(), middleware.DisableCache())
	settings.GET("", controller.GetPelicanSettings)
	settings.PUT("/connection", middleware.CriticalRateLimit(), controller.RequireRecentPelicanLogin, controller.UpdatePelicanConnection)
	settings.PUT("/test-token", middleware.CriticalRateLimit(), controller.RequireRecentPelicanLogin, controller.UpdatePelicanTestToken)
	user := api.Group("/pelican", middleware.UserAuth(), middleware.DisableCache())
	user.GET("/gallery", controller.GetPelicanGallery)
	user.GET("/runs/:run_id/artifacts/:artifact_id", controller.GetPelicanArtifact)
	admin := api.Group("/pelican/admin", middleware.AdminAuth(), middleware.SessionCookieOriginGuard(), middleware.DisableCache())
	handlePermissionRoute(admin, http.MethodGet, "/status", authz.ChannelRead, controller.GetPelicanStatus)
	handlePermissionRoute(admin, http.MethodGet, "/rules", authz.ChannelRead, controller.GetPelicanRules)
	handlePermissionRoute(admin, http.MethodPost, "/rules", authz.ChannelOperate, controller.SavePelicanRule)
	handlePermissionRoute(admin, http.MethodPut, "/rules/:id", authz.ChannelOperate, controller.SavePelicanRule)
	handlePermissionRoute(admin, http.MethodDelete, "/rules/:id", authz.ChannelOperate, controller.DeletePelicanRule)
	handlePermissionRoute(admin, http.MethodPost, "/rules/:id/run", authz.ChannelOperate, controller.RunPelicanRule)
	handlePermissionRoute(admin, http.MethodGet, "/runs", authz.ChannelRead, controller.GetPelicanRuns)
	handlePermissionRoute(admin, http.MethodGet, "/runs/:run_id/artifacts/:artifact_id", authz.ChannelRead, controller.GetPelicanAdminArtifact)
}
