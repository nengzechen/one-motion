package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"

	"one-motion/backend/internal/handler"
	"one-motion/backend/internal/middleware"
	"one-motion/backend/internal/model"
)

func main() {
	// 加载配置
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath("./config")
	viper.AddConfigPath("../config")
	if err := viper.ReadInConfig(); err != nil {
		log.Fatalf("failed to read config: %v", err)
	}

	// 初始化数据库
	model.InitDB()

	// 初始化 Gin
	gin.SetMode(viper.GetString("server.mode"))
	r := gin.Default()

	// 跨域（开发阶段）
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// 路由
	api := r.Group("/api")
	{
		// 认证（无需登录）
		authH := handler.NewAuthHandler(model.DB)
		auth := api.Group("/auth")
		{
			auth.POST("/sms", authH.SendSmsCode)
			auth.POST("/register", authH.Register)
			auth.POST("/login", authH.Login)
			auth.POST("/login-code", authH.LoginWithCode)
		}

		// 需要登录的接口
		authorized := api.Group("", middleware.JWTAuth())
		{
			// 游戏列表
			gameH := handler.NewGameHandler(model.DB)
			authorized.GET("/games", gameH.ListGames)

			// 存档管理
			saveH := handler.NewSaveHandler(model.DB)
			authorized.GET("/saves", saveH.ListSaves)
			authorized.POST("/saves/upload", saveH.Upload)
			authorized.GET("/saves/:id/download", saveH.GetDownloadURL)
			authorized.PATCH("/saves/:id", saveH.RenameSave)
			authorized.DELETE("/saves/:id", saveH.DeleteSave)
		}
	}

	port := viper.GetString("server.port")
	log.Printf("server starting on :%s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}
