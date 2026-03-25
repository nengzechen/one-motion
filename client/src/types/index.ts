export interface User {
  id: number
  username: string
  nickname: string
}

export interface Game {
  id: number
  name: string
  name_en: string
  steam_app_id: string
  icon_url: string
  save_paths: string   // JSON string
  config_paths: string // JSON string
  is_active: boolean
}

export interface UserSave {
  id: number
  user_id: number
  game_id: number
  type: 'save' | 'config'
  version: number
  file_name: string
  file_size: number
  file_hash: string
  oss_path: string
  note: string
  created_at: string
  game?: Game
}

export interface PathScanResult {
  path: string
  exists: boolean
  size: number
}

export interface SteamGame {
  appId: string
  name: string
  installDir: string
  // 是否在我们的内置数据库中
  supported: boolean
  // 匹配到的内置游戏（如果有）
  matchedGame?: Game
}

// 用户自定义游戏（存本地）
export interface CustomGame {
  id: string  // 本地生成的 uuid
  name: string
  savePaths: string[]
  configPaths: string[]
}

// Electron API 类型声明
declare global {
  interface Window {
    electronAPI: {
      minimize: () => void
      maximize: () => void
      close: () => void
      scanPaths: (paths: string[]) => Promise<PathScanResult[]>
      compress: (sourcePaths: string[]) => Promise<string>
      extract: (zipPath: string, destDir: string) => Promise<boolean>
      resolvePaths: (templates: string[], steamUserdataPath?: string) => Promise<string[]>
      openFolder: (path: string) => void
      steamFindInstall: () => Promise<string | null>
      steamScanGames: (steamPath: string) => Promise<Array<{ appId: string; name: string; installDir: string }>>
      steamGetUserdataPath: (steamPath: string) => Promise<string | null>
      downloadAndExtract: (url: string, destPaths: string[]) => Promise<{ success: boolean }>
    }
  }
}
