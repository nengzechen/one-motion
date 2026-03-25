import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import fs from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import AdmZip from 'adm-zip'

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 900,
    minHeight: 600,
    frame: false,        // 自定义标题栏
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ──────────────────────────────────────────────
// IPC：窗口控制
// ──────────────────────────────────────────────
ipcMain.on('window:minimize', () => BrowserWindow.getFocusedWindow()?.minimize())
ipcMain.on('window:maximize', () => {
  const win = BrowserWindow.getFocusedWindow()
  win?.isMaximized() ? win.unmaximize() : win?.maximize()
})
ipcMain.on('window:close', () => BrowserWindow.getFocusedWindow()?.close())

// ──────────────────────────────────────────────
// IPC：文件系统操作
// ──────────────────────────────────────────────

/**
 * 扫描存档路径，返回路径列表和文件总大小
 * paths: 路径数组（已替换变量）
 */
ipcMain.handle('fs:scanPaths', async (_event, paths: string[]) => {
  const results: Array<{ path: string; exists: boolean; size: number }> = []

  for (const p of paths) {
    if (fs.existsSync(p)) {
      const size = await getDirSize(p)
      results.push({ path: p, exists: true, size })
    } else {
      results.push({ path: p, exists: false, size: 0 })
    }
  }

  return results
})

/**
 * 压缩指定路径列表为 zip，返回 base64 编码的 zip 内容
 */
ipcMain.handle('fs:compress', async (_event, sourcePaths: string[]) => {
  const zip = new AdmZip()

  for (const p of sourcePaths) {
    if (!fs.existsSync(p)) continue
    const stat = fs.statSync(p)
    if (stat.isDirectory()) {
      zip.addLocalFolder(p, path.basename(p))
    } else {
      zip.addLocalFile(p)
    }
  }

  const tmpPath = path.join(app.getPath('temp'), `onemotion_${Date.now()}.zip`)
  zip.writeZip(tmpPath)
  const data = fs.readFileSync(tmpPath)
  fs.unlinkSync(tmpPath)
  return data.toString('base64')
})

/**
 * 解压 zip 到目标目录
 */
ipcMain.handle('fs:extract', async (_event, zipPath: string, destDir: string) => {
  const zip = new AdmZip(zipPath)
  zip.extractAllTo(destDir, true)
  return true
})

/**
 * 解析路径模板变量
 */
ipcMain.handle('fs:resolvePaths', async (_event, templates: string[], steamUserdataPath?: string) => {
  const vars: Record<string, string> = {
    USERPROFILE: process.env.USERPROFILE || '',
    APPDATA: process.env.APPDATA || '',
    LOCALAPPDATA: process.env.LOCALAPPDATA || '',
    DOCUMENTS: join(process.env.USERPROFILE || '', 'Documents'),
    STEAM_USERDATA: steamUserdataPath || '',
  }

  return templates.map(t =>
    t.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`)
  )
})

/**
 * 打开文件夹（资源管理器）
 */
ipcMain.on('shell:openFolder', (_event, folderPath: string) => {
  shell.openPath(folderPath)
})

// ──────────────────────────────────────────────
// IPC：Steam 扫描
// ──────────────────────────────────────────────

/**
 * 查找 Steam 安装路径
 */
ipcMain.handle('steam:findInstall', async () => {
  const candidates: string[] = []

  if (process.platform === 'win32') {
    const drives = ['C', 'D', 'E', 'F']
    for (const d of drives) {
      candidates.push(`${d}:\\Program Files (x86)\\Steam`)
      candidates.push(`${d}:\\Program Files\\Steam`)
      candidates.push(`${d}:\\Steam`)
    }
  } else if (process.platform === 'darwin') {
    candidates.push(join(process.env.HOME || '', 'Library/Application Support/Steam'))
  } else {
    candidates.push(join(process.env.HOME || '', '.steam/steam'))
    candidates.push(join(process.env.HOME || '', '.local/share/Steam'))
  }

  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  return null
})

/**
 * 扫描 Steam 已安装游戏
 * 返回 { appId, name, installDir }[]
 */
ipcMain.handle('steam:scanGames', async (_event, steamPath: string) => {
  const results: Array<{ appId: string; name: string; installDir: string }> = []

  // 读取所有库目录
  const libraryPaths = [path.join(steamPath, 'steamapps')]
  const vdfPath = path.join(steamPath, 'steamapps', 'libraryfolders.vdf')

  if (fs.existsSync(vdfPath)) {
    const content = fs.readFileSync(vdfPath, 'utf-8')
    // 简单解析 vdf：找 "path" 字段
    const matches = content.matchAll(/"path"\s+"([^"]+)"/g)
    for (const m of matches) {
      const libPath = path.join(m[1].replace(/\\\\/g, '\\'), 'steamapps')
      if (fs.existsSync(libPath) && !libraryPaths.includes(libPath)) {
        libraryPaths.push(libPath)
      }
    }
  }

  // 扫描每个库目录下的 appmanifest_*.acf
  for (const libPath of libraryPaths) {
    if (!fs.existsSync(libPath)) continue
    const files = fs.readdirSync(libPath).filter(f => f.startsWith('appmanifest_') && f.endsWith('.acf'))

    for (const file of files) {
      const content = fs.readFileSync(path.join(libPath, file), 'utf-8')
      const appIdMatch = content.match(/"appid"\s+"(\d+)"/)
      const nameMatch = content.match(/"name"\s+"([^"]+)"/)
      const installDirMatch = content.match(/"installdir"\s+"([^"]+)"/)

      if (appIdMatch && nameMatch) {
        results.push({
          appId: appIdMatch[1],
          name: nameMatch[1],
          installDir: installDirMatch ? path.join(libPath, 'common', installDirMatch[1]) : '',
        })
      }
    }
  }

  // 按 appId 去重
  const seen = new Set<string>()
  return results.filter(r => {
    if (seen.has(r.appId)) return false
    seen.add(r.appId)
    return true
  })
})

/**
 * 获取 Steam userdata 目录（包含所有登录账号的本地存档）
 */
ipcMain.handle('steam:getUserdataPath', async (_event, steamPath: string) => {
  const userdataPath = path.join(steamPath, 'userdata')
  if (!fs.existsSync(userdataPath)) return null

  // 找到最近修改的账号目录（通常是当前登录的账号）
  const accounts = fs.readdirSync(userdataPath)
    .filter(d => /^\d+$/.test(d))
    .map(d => ({
      id: d,
      mtime: fs.statSync(path.join(userdataPath, d)).mtime.getTime(),
    }))
    .sort((a, b) => b.mtime - a.mtime)

  return accounts.length > 0 ? path.join(userdataPath, accounts[0].id) : null
})

/**
 * 从 URL 下载 zip 并解压到目标路径列表
 * destPaths: 已解析的完整路径数组（如 C:\Users\x\AppData\Roaming\EldenRing）
 * 解压策略：将 zip 中每个顶层条目解压到对应 destPath 的父目录
 */
ipcMain.handle('fs:downloadAndExtract', async (_event, url: string, destPaths: string[]) => {
  const tmpFile = path.join(app.getPath('temp'), `onemotion_${Date.now()}.zip`)
  try {
    await downloadToFile(url, tmpFile)
    const zip = new AdmZip(tmpFile)

    for (const destPath of destPaths) {
      const parentDir = path.dirname(destPath)
      if (!fs.existsSync(parentDir)) fs.mkdirSync(parentDir, { recursive: true })
      zip.extractAllTo(parentDir, true)
    }
    return { success: true }
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile)
  }
})

function downloadToFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https://') ? https : http
    const file = fs.createWriteStream(dest)
    protocol.get(url, (res) => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', (err) => { fs.unlink(dest, () => {}); reject(err) })
    }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err) })
  })
}

/**
 * 自动扫描游戏存档/配置路径
 * 优先扫 Steam userdata，再扫常见 AppData 目录
 */
ipcMain.handle('steam:findSavePaths', async (_event, appId: string, gameName: string, steamPath: string) => {
  const savePaths: string[] = []
  const configPaths: string[] = []

  // 1. Steam userdata（适用于使用 Steam 云存档的游戏）
  const userdataBase = path.join(steamPath, 'userdata')
  if (fs.existsSync(userdataBase)) {
    const steamIds = fs.readdirSync(userdataBase).filter(d => /^\d+$/.test(d))
    for (const sid of steamIds) {
      const remote = path.join(userdataBase, sid, appId, 'remote')
      if (fs.existsSync(remote)) savePaths.push(remote)
      const cfg = path.join(userdataBase, sid, appId, 'local', 'cfg')
      if (fs.existsSync(cfg)) configPaths.push(cfg)
    }
  }

  // 2. 常见 AppData 位置（Windows only）
  if (process.platform === 'win32') {
    const appdata = process.env.APPDATA || ''
    const localdata = process.env.LOCALAPPDATA || ''
    const userprofile = process.env.USERPROFILE || ''
    const localLow = path.join(userprofile, 'AppData', 'LocalLow')

    const variants = nameVariants(gameName)
    const bases = [appdata, localdata, localLow,
      path.join(userprofile, 'Documents', 'My Games'),
      path.join(userprofile, 'Documents'),
      path.join(userprofile, 'Saved Games'),
    ]
    for (const base of bases) {
      if (!base || !fs.existsSync(base)) continue
      for (const v of variants) {
        const p = path.join(base, v)
        if (fs.existsSync(p)) {
          // 区分存档和配置
          const lower = base.toLowerCase()
          if (lower.includes('appdata') && !lower.includes('roaming') && !lower.includes('locallow')) {
            configPaths.push(p)
          } else {
            savePaths.push(p)
          }
        }
      }
    }
  }

  return {
    savePaths: [...new Set(savePaths)],
    configPaths: [...new Set(configPaths)],
  }
})

function nameVariants(name: string): string[] {
  const s = new Set<string>()
  s.add(name)
  s.add(name.replace(/[:\-]/g, '').trim())
  s.add(name.split(':')[0].trim())
  s.add(name.replace(/[^a-zA-Z0-9 ]/g, '').trim())
  s.add(name.replace(/\s+/g, ''))
  s.add(name.split(' ')[0])
  return [...s].filter(v => v.length >= 2)
}

// 辅助：计算目录大小
async function getDirSize(dirPath: string): Promise<number> {
  let total = 0
  const stat = fs.statSync(dirPath)
  if (!stat.isDirectory()) return stat.size

  for (const item of fs.readdirSync(dirPath)) {
    total += await getDirSize(path.join(dirPath, item))
  }
  return total
}
