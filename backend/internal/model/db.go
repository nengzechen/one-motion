package model

import (
	"fmt"
	"log"

	"github.com/spf13/viper"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func InitDB() {
	dsn := fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s TimeZone=Asia/Shanghai",
		viper.GetString("database.host"),
		viper.GetInt("database.port"),
		viper.GetString("database.user"),
		viper.GetString("database.password"),
		viper.GetString("database.dbname"),
		viper.GetString("database.sslmode"),
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	// 自动建表
	if err := db.AutoMigrate(&User{}, &Game{}, &UserSave{}, &SmsCode{}); err != nil {
		log.Fatalf("failed to migrate database: %v", err)
	}

	DB = db
	log.Println("database connected")

	seedGames(db)
}

// seedGames 初始化内置游戏列表
func seedGames(db *gorm.DB) {
	var count int64
	db.Model(&Game{}).Count(&count)
	if count > 0 {
		return
	}

	games := []Game{
		{
			Name:       "黑神话：悟空",
			NameEn:     "Black Myth: Wukong",
			SteamAppID: "2358720",
			SavePaths:  `["{LOCALAPPDATA}\\b1\\Saved\\SaveGames"]`,
			ConfigPaths: `["{LOCALAPPDATA}\\b1\\Saved\\Config\\Windows"]`,
		},
		{
			Name:       "艾尔登法环",
			NameEn:     "Elden Ring",
			SteamAppID: "1245620",
			SavePaths:  `["{APPDATA}\\EldenRing"]`,
			ConfigPaths: `[]`,
		},
		{
			Name:       "赛博朋克 2077",
			NameEn:     "Cyberpunk 2077",
			SteamAppID: "1091500",
			SavePaths:  `["{USERPROFILE}\\Saved Games\\CD Projekt Red\\Cyberpunk 2077"]`,
			ConfigPaths: `["{USERPROFILE}\\AppData\\Local\\CD Projekt Red\\Cyberpunk 2077"]`,
		},
		{
			Name:       "CS2",
			NameEn:     "Counter-Strike 2",
			SteamAppID: "730",
			SavePaths:  `[]`,
			ConfigPaths: `["{STEAM_USERDATA}\\730\\local\\cfg"]`,
		},
		{
			Name:       "怪物猎人：世界",
			NameEn:     "Monster Hunter: World",
			SteamAppID: "582010",
			SavePaths:  `["{STEAM_USERDATA}\\582010\\remote"]`,
			ConfigPaths: `[]`,
		},
		{
			Name:       "黑暗之魂 3",
			NameEn:     "Dark Souls III",
			SteamAppID: "374320",
			SavePaths:  `["{APPDATA}\\DarkSoulsIII"]`,
			ConfigPaths: `[]`,
		},
		{
			Name:       "GTA5",
			NameEn:     "Grand Theft Auto V",
			SteamAppID: "271590",
			SavePaths:  `["{USERPROFILE}\\Documents\\Rockstar Games\\GTA V\\Profiles"]`,
			ConfigPaths: `["{USERPROFILE}\\Documents\\Rockstar Games\\GTA V"]`,
		},
		{
			Name:       "荒野大镖客：救赎 2",
			NameEn:     "Red Dead Redemption 2",
			SteamAppID: "1174180",
			SavePaths:  `["{USERPROFILE}\\Documents\\Rockstar Games\\Red Dead Redemption 2\\Profiles"]`,
			ConfigPaths: `[]`,
		},
	}

	db.Create(&games)
	log.Printf("seeded %d games", len(games))
}
