package handler

import (
	"bytes"
	"crypto/sha256"
	"fmt"
	"io"
	"net/http"
	"path/filepath"
	"time"

	"github.com/aliyun/aliyun-oss-go-sdk/oss"
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

func ossClient() (*oss.Bucket, error) {
	endpoint := viper.GetString("oss.endpoint")
	keyID := viper.GetString("oss.access_key_id")
	keySecret := viper.GetString("oss.access_key_secret")
	bucket := viper.GetString("oss.bucket")

	client, err := oss.New("https://"+endpoint, keyID, keySecret)
	if err != nil {
		return nil, err
	}
	return client.Bucket(bucket)
}

// findOrCreateGame 按 custom_id 查找或新建游戏记录
func (h *SaveHandler) findOrCreateGame(customID, gameName string) (uint, error) {
	var game model.Game
	err := h.db.Where("steam_app_id = ?", customID).First(&game).Error
	if err == nil {
		return game.ID, nil
	}
	if err != gorm.ErrRecordNotFound {
		return 0, err
	}
	game = model.Game{
		Name:       gameName,
		SteamAppID: customID,
		SavePaths:  "[]",
		ConfigPaths: "[]",
		IsActive:   true,
	}
	if err := h.db.Create(&game).Error; err != nil {
		return 0, err
	}
	return game.ID, nil
}

// ListSaves GET /api/saves?custom_id=steam-730&type=save
func (h *SaveHandler) ListSaves(c *gin.Context) {
	userID := c.GetUint("user_id")
	customID := c.Query("custom_id")
	saveType := c.DefaultQuery("type", "save")

	query := h.db.Where("user_id = ? AND type = ?", userID, saveType).
		Order("created_at desc")

	if customID != "" {
		var game model.Game
		if err := h.db.Where("steam_app_id = ?", customID).First(&game).Error; err == nil {
			query = query.Where("game_id = ?", game.ID)
		} else {
			c.JSON(http.StatusOK, gin.H{"saves": []any{}})
			return
		}
	}

	var saves []model.UserSave
	if err := query.Find(&saves).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"saves": saves})
}

// Upload POST /api/saves/upload
func (h *SaveHandler) Upload(c *gin.Context) {
	userID := c.GetUint("user_id")
	username := c.GetString("username")

	customID := c.PostForm("custom_id")
	gameName := c.DefaultPostForm("game_name", customID)
	saveType := c.DefaultPostForm("type", "save")
	note := c.PostForm("note")

	if customID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "custom_id 不能为空"})
		return
	}

	gameID, err := h.findOrCreateGame(customID, gameName)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "游戏记录创建失败"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "文件不能为空"})
		return
	}
	defer file.Close()

	maxSize := int64(viper.GetInt("upload.max_size_mb")) * 1024 * 1024
	if header.Size > maxSize {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("文件超过 %dMB 限制", viper.GetInt("upload.max_size_mb"))})
		return
	}

	hasher := sha256.New()
	fileBytes, err := io.ReadAll(io.TeeReader(file, hasher))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return
	}
	fileHash := fmt.Sprintf("%x", hasher.Sum(nil))

	// 去重检查
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

	// 版本号
	var maxVersion struct{ Version int }
	h.db.Model(&model.UserSave{}).
		Where("user_id = ? AND game_id = ? AND type = ?", userID, gameID, saveType).
		Select("COALESCE(MAX(version), 0) as version").
		Scan(&maxVersion)
	newVersion := maxVersion.Version + 1

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".zip"
	}
	ossPath := fmt.Sprintf("saves/%s/%s/%s/%d%s",
		username, customID, saveType, time.Now().Unix(), ext)

	// 上传到 OSS
	bucket, err := ossClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "OSS 连接失败: " + err.Error()})
		return
	}
	if err := bucket.PutObject(ossPath, bytes.NewReader(fileBytes)); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "OSS 上传失败: " + err.Error()})
		return
	}

	save := model.UserSave{
		UserID:   userID,
		GameID:   gameID,
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

	h.pruneOldVersions(userID, gameID, saveType)

	c.JSON(http.StatusOK, gin.H{"message": "上传成功", "save": save})
}

// GetDownloadURL GET /api/saves/:id/download
func (h *SaveHandler) GetDownloadURL(c *gin.Context) {
	userID := c.GetUint("user_id")
	saveID := c.Param("id")

	var save model.UserSave
	if err := h.db.Where("id = ? AND user_id = ?", saveID, userID).First(&save).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "存档不存在"})
		return
	}

	bucket, err := ossClient()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "OSS 连接失败"})
		return
	}

	signedURL, err := bucket.SignURL(save.OSSPath, oss.HTTPGet, 600)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "生成下载链接失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"url":        signedURL,
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

	// 删除 OSS 文件
	if bucket, err := ossClient(); err == nil {
		_ = bucket.DeleteObject(save.OSSPath)
	}

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
		for _, s := range saves[maxVersions:] {
			if bucket, err := ossClient(); err == nil {
				_ = bucket.DeleteObject(s.OSSPath)
			}
			h.db.Delete(&s)
		}
	}
}
