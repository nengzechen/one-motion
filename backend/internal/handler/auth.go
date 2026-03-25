package handler

import (
	"math/rand"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"one-motion/backend/internal/middleware"
	"one-motion/backend/internal/model"
)

type AuthHandler struct {
	db *gorm.DB
}

func NewAuthHandler(db *gorm.DB) *AuthHandler {
	return &AuthHandler{db: db}
}

// SendSmsCode POST /api/auth/sms
func (h *AuthHandler) SendSmsCode(c *gin.Context) {
	var req struct {
		Phone string `json:"phone" binding:"required,len=11"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "手机号格式错误"})
		return
	}

	code := generateCode()
	h.db.Where("phone = ? AND used = false", req.Phone).Delete(&model.SmsCode{})
	h.db.Create(&model.SmsCode{
		Phone:     req.Phone,
		Code:      code,
		ExpiresAt: time.Now().Add(5 * time.Minute),
	})

	c.JSON(http.StatusOK, gin.H{
		"message":  "发送成功",
		"dev_code": code,
	})
}

// Register POST /api/auth/register
func (h *AuthHandler) Register(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required,min=3,max=50"`
		Password string `json:"password" binding:"required,min=6"`
		Nickname string `json:"nickname"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误，账号至少3位，密码至少6位"})
		return
	}

	var existing model.User
	if result := h.db.Where("username = ?", req.Username).First(&existing); result.Error == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "该账号已注册"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "服务器错误"})
		return
	}

	nickname := req.Nickname
	if nickname == "" {
		nickname = "玩家" + req.Username
	}

	user := model.User{
		Username:     req.Username,
		PasswordHash: string(hash),
		Nickname:     nickname,
	}
	if err := h.db.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "注册失败"})
		return
	}

	token, _ := middleware.GenerateToken(user.ID, user.Username)
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"nickname": user.Nickname,
		},
	})
}

// Login POST /api/auth/login
func (h *AuthHandler) Login(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	var user model.User
	if err := h.db.Where("username = ?", req.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "账号或密码错误"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "账号或密码错误"})
		return
	}

	token, _ := middleware.GenerateToken(user.ID, user.Username)
	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"nickname": user.Nickname,
		},
	})
}

// LoginWithCode POST /api/auth/login-code（验证码登录，保留兼容）
func (h *AuthHandler) LoginWithCode(c *gin.Context) {
	var req struct {
		Phone string `json:"phone" binding:"required,len=11"`
		Code  string `json:"code" binding:"required,len=6"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "参数错误"})
		return
	}

	if err := h.verifySmsCode(req.Phone, req.Code); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusUnauthorized, gin.H{"error": "该登录方式已停用，请使用账号密码登录"})
}

func (h *AuthHandler) verifySmsCode(phone, code string) error {
	var sms model.SmsCode
	result := h.db.Where("phone = ? AND code = ? AND used = false AND expires_at > ?",
		phone, code, time.Now()).First(&sms)
	if result.Error != nil {
		return errInvalidCode
	}
	h.db.Model(&sms).Update("used", true)
	return nil
}

var errInvalidCode = &appError{"验证码错误或已过期"}

type appError struct{ msg string }

func (e *appError) Error() string { return e.msg }

func generateCode() string {
	const digits = "0123456789"
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	b := make([]byte, 6)
	for i := range b {
		b[i] = digits[r.Intn(len(digits))]
	}
	return string(b)
}
