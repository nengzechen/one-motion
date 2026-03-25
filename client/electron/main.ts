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

  // 先开 DevTools，再加载页面，确保所有报错都能捕获
  win.webContents.openDevTools()

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    const indexPath = join(__dirname, '../dist/index.html')
    console.log('[main] loading file:', indexPath)
    win.loadFile(indexPath)
  }

  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[main] did-fail-load:', code, desc, url)
  })
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
 * 压缩指定路径列表为 zip，返回 zip 文件路径
 */
ipcMain.handle('fs:compress', async (_event, sourcePaths: string[], destPath: string) => {
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

  zip.writeZip(destPath)
  return destPath
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

  return results
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
