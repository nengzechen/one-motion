package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"one-motion/backend/internal/model"
)

type GameHandler struct {
	db *gorm.DB
}

func NewGameHandler(db *gorm.DB) *GameHandler {
	return &GameHandler{db: db}
}

// ListGames GET /api/games
func (h *GameHandler) ListGames(c *gin.Context) {
	var games []model.Game
	if err := h.db.Where("is_active = true").Order("id asc").Find(&games).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取失败"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"games": games})
}
