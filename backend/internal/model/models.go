package model

import (
	"time"

	"gorm.io/gorm"
)

// User 用户表
type User struct {
	ID           uint           `gorm:"primarykey" json:"id"`
	Username     string         `gorm:"uniqueIndex;size:50;not null" json:"username"`
	PasswordHash string         `gorm:"size:255;not null" json:"-"`
	Nickname     string         `gorm:"size:50" json:"nickname"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`

	Saves []UserSave `gorm:"foreignKey:UserID" json:"-"`
}

// Game 游戏定义表（平台维护）
type Game struct {
	ID          uint      `gorm:"primarykey" json:"id"`
	Name        string    `gorm:"size:100;not null" json:"name"`
	NameEn      string    `gorm:"size:100" json:"name_en"`
	SteamAppID  string    `gorm:"size:20;index" json:"steam_app_id"`
	IconURL     string    `gorm:"size:500" json:"icon_url"`
	// 存档路径模板，JSON 数组，支持变量: {USERPROFILE} {APPDATA} {LOCALAPPDATA} {DOCUMENTS} {STEAM_USERDATA}
	SavePaths   string    `gorm:"type:text" json:"save_paths"`
	// 配置文件路径模板
	ConfigPaths string    `gorm:"type:text" json:"config_paths"`
	IsActive    bool      `gorm:"default:true" json:"is_active"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// UserSave 用户存档/配置快照
type UserSave struct {
	ID         uint           `gorm:"primarykey" json:"id"`
	UserID     uint           `gorm:"index;not null" json:"user_id"`
	GameID     uint           `gorm:"index;not null" json:"game_id"`
	Type       string         `gorm:"size:20;not null" json:"type"` // save | config
	Version    int            `gorm:"not null;default:1" json:"version"`
	FileName   string         `gorm:"size:255;not null" json:"file_name"` // 压缩包文件名
	FileSize   int64          `json:"file_size"`                          // 字节
	FileHash   string         `gorm:"size:64" json:"file_hash"`           // SHA256，用于去重
	OSSPath    string         `gorm:"size:500;not null" json:"oss_path"`
	Note       string         `gorm:"size:255" json:"note"` // 用户备注，如"通关前"
	CreatedAt  time.Time      `json:"created_at"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`

	User User `gorm:"foreignKey:UserID" json:"-"`
	Game Game `gorm:"foreignKey:GameID" json:"game,omitempty"`
}

// SmsCode 短信验证码
type SmsCode struct {
	ID        uint      `gorm:"primarykey"`
	Phone     string    `gorm:"size:20;index;not null"`
	Code      string    `gorm:"size:10;not null"`
	Used      bool      `gorm:"default:false"`
	ExpiresAt time.Time `gorm:"not null"`
	CreatedAt time.Time
}
