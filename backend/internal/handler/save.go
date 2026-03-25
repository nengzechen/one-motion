package handler

import (
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/spf13/viper"
	"gorm.io/gorm"

	"one-motion/backend/internal/model"
)

type SaveHandler struct {
	db *gorm.DB
}

func NewSaveHandler(db *gorm.DB) *SaveHandler {
	return &SaveHandler{db: db}
}

// ListSaves GET /api/saves?game_id=1&type=save
// 获取用户某个游戏的存档列表（最近 N 个版本）
func (h *SaveHandler) ListSaves(c *gin.Context) {
	userID := c.GetUint("user_id")
	gameID := c.Query("game_id")
	saveType := c.DefaultQuery("type", "save")

	query := h.db.Where("user_id = ? AND type = ?", userID, saveType).
		Preload("Game").
		Order("created_at desc")

	if gameID != "" {
		query = query.Where("game_id = ?", gameID)
	}

	var saves []model.UserSave
	if err := query.Find(&saves).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saves": saves})
}

// Upload POST /api/saves/upload
// 上传存档压缩包（multipart/form-data）
func (h *SaveHandler) Upload(c *gin.Context) {
	userID := c.GetUint("user_id")

	gameIDStr := c.PostForm("game_id")
	saveType := c.DefaultPostForm("type", "save") // save | config
	note := c.PostForm("note")

	gameID, err := strconv.ParseUint(gameIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "game_id 无效"})
		return
	}

	// 检查游戏是否存在
	var game model.Game
	if err := h.db.First(&game, gameID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "游戏不存在"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件不能为空"})
		return
	}
	defer file.Close()

	// 限制文件大小
	maxSize := int64(viper.GetInt("upload.max_size_mb")) * 1024 * 1024
	if header.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("文件超过 %dMB 限制", viper.GetInt("upload.max_size_mb"))})
		return
	}

	// 计算文件 hash
	hasher := sha256.New()
	fileBytes, err := io.ReadAll(io.TeeReader(file, hasher))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return
	}
	fileHash := fmt.Sprintf("%x", hasher.Sum(nil))

	// 检查是否已有相同内容（去重）
	var existing model.UserSave
	if err := h.db.Where("user_id = ? AND game_id = ? AND type = ? AND file_hash = ?",
		userID, gameID, saveType, fileHash).First(&existing).Error; err == nil {
		name := existing.Note
		if name == "" {
			name = fmt.Sprintf("版本 v%d", existing.Version)
		}
		c.JSON(http.StatusOK, gin.H{
			"duplicate": true,
			"message":   fmt.Sprintf("与「%s」内容相同，无需重复上传", name),
			"save":      existing,
		})
		return
	}

	// 计算新版本号
	var maxVersion struct{ Version int }
	h.db.Model(&model.UserSave{}).
		Where("user_id = ? AND game_id = ? AND type = ?", userID, gameID, saveType).
		Select("COALESCE(MAX(version), 0) as version").
		Scan(&maxVersion)
	newVersion := maxVersion.Version + 1

	// OSS 路径: saves/{userID}/{gameID}/{type}/v{version}_{timestamp}.zip
	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".zip"
	}
	ossPath := fmt.Sprintf("saves/%d/%d/%s/v%d_%d%s",
		userID, gameID, saveType, newVersion, time.Now().Unix(), ext)

	// TODO: 上传到阿里云 OSS
	// 开发阶段模拟成功
	_ = fileBytes // 实际应传给 OSS client

	save := model.UserSave{
		UserID:   userID,
		GameID:   uint(gameID),
		Type:     saveType,
		Version:  newVersion,
		FileName: header.Filename,
		FileSize: header.Size,
		FileHash: fileHash,
		OSSPath:  ossPath,
		Note:     note,
	}
	if err := h.db.Create(&save).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存记录失败"})
		return
	}

	// 超出版本限制时删除最旧的版本
	h.pruneOldVersions(userID, uint(gameID), saveType)

	c.JSON(http.StatusOK, gin.H{
		"message": "上传成功",
		"save":    save,
	})
}

// GetDownloadURL GET /api/saves/:id/download
// 获取存档下载链接（临时签名 URL）
func (h *SaveHandler) GetDownloadURL(c *gin.Context) {
	userID := c.GetUint("user_id")
	saveID := c.Param("id")

	var save model.UserSave
	if err := h.db.Where("id = ? AND user_id = ?", saveID, userID).First(&save).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "存档不存在"})
		return
	}

	// TODO: 生成 OSS 临时签名 URL（有效期 10 分钟）
	// 开发阶段返回 oss_path 作为占位
	baseURL := viper.GetString("oss.base_url")
	downloadURL := fmt.Sprintf("%s/%s", baseURL, save.OSSPath)

	c.JSON(http.StatusOK, gin.H{
		"url":        downloadURL,
		"expires_in": 600,
		"save":       save,
	})
}

// RenameSave PATCH /api/saves/:id
func (h *SaveHandler) RenameSave(c *gin.Context) {
	userID := c.GetUint("user_id")
	saveID := c.Param("id")

	var req struct {
		Note string `json:"note" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "名称不能为空"})
		return
	}

	var save model.UserSave
	if err := h.db.Where("id = ? AND user_id = ?", saveID, userID).First(&save).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "存档不存在"})
		return
	}

	h.db.Model(&save).Update("note", req.Note)
	c.JSON(http.StatusOK, gin.H{"message": "重命名成功"})
}

// DeleteSave DELETE /api/saves/:id
func (h *SaveHandler) DeleteSave(c *gin.Context) {
	userID := c.GetUint("user_id")
	saveID := c.Param("id")

	var save model.UserSave
	if err := h.db.Where("id = ? AND user_id = ?", saveID, userID).First(&save).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "存档不存在"})
		return
	}

	// TODO: 删除 OSS 上的文件

	h.db.Delete(&save)
	c.JSON(http.StatusOK, gin.H{"message": "删除成功"})
}

func (h *SaveHandler) pruneOldVersions(userID, gameID uint, saveType string) {
	maxVersions := viper.GetInt("upload.max_versions")

	var saves []model.UserSave
	h.db.Where("user_id = ? AND game_id = ? AND type = ?", userID, gameID, saveType).
		Order("version desc").
		Find(&saves)

	if len(saves) > maxVersions {
		toDelete := saves[maxVersions:]
		for _, s := range toDelete {
			// TODO: 删除 OSS 文件
			h.db.Delete(&s)
		}
	}
}
