import { useEffect, useState } from 'react'
import type { CustomGame } from '../types'

interface Props {
  existingIds: Set<string>
  onAdd: (game: CustomGame, steamPath: string) => void
  onClose: () => void
}

interface SteamGame {
  appId: string
  name: string
  installDir: string
}

interface ScannedGame extends SteamGame {
  scanning: boolean
  savePaths: string[]
  configPaths: string[]
  scanned: boolean
}

const isElectron = !!window.electronAPI

export default function AddGameModal({ existingIds, onAdd, onClose }: Props) {
  const [scanning, setScanning] = useState(false)
  const [games, setGames] = useState<ScannedGame[]>([])
  const [scanDone, setScanDone] = useState(false)
  const [steamPath, setSteamPath] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set(existingIds))

  useEffect(() => {
    if (isElectron) scanSteam()
  }, [])

  const scanSteam = async () => {
    if (!window.electronAPI) return
    setScanning(true)
    try {
      const foundPath = await window.electronAPI.steamFindInstall()
      setSteamPath(foundPath)
      if (!foundPath) return
      const raw = await window.electronAPI.steamScanGames(foundPath)
      setGames(raw.map(g => ({ ...g, scanning: false, savePaths: [], configPaths: [], scanned: false })))
    } finally {
      setScanning(false)
      setScanDone(true)
    }
  }

  const handleAdd = async (sg: ScannedGame) => {
    if (!steamPath) return

    // 自动扫描路径
    setGames(prev => prev.map(g => g.appId === sg.appId ? { ...g, scanning: true } : g))
    try {
      const result = await window.electronAPI!.steamFindSavePaths(sg.appId, sg.name, steamPath)
      const updatedGame: ScannedGame = { ...sg, ...result, scanning: false, scanned: true }
      setGames(prev => prev.map(g => g.appId === sg.appId ? updatedGame : g))

      onAdd({
        id: `steam-${sg.appId}`,
        name: sg.name,
        savePaths: result.savePaths,
        configPaths: result.configPaths,
      }, steamPath)
      setAdded(prev => new Set(prev).add(sg.appId))
    } catch {
      setGames(prev => prev.map(g => g.appId === sg.appId ? { ...g, scanning: false, scanned: true } : g))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-2xl w-[560px] max-h-[78vh] flex flex-col border border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">扫描 Steam 游戏</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!isElectron && (
            <div className="text-center py-10 text-gray-500">扫描功能需要在桌面应用中运行</div>
          )}

          {isElectron && scanning && (
            <div className="text-center py-10 text-gray-400">
              <div className="text-3xl mb-3 animate-pulse">🔍</div>
              <p>正在扫描 Steam 游戏库...</p>
            </div>
          )}

          {isElectron && scanDone && !steamPath && (
            <div className="text-center py-10 text-gray-500">未找到 Steam 安装目录</div>
          )}

          {isElectron && scanDone && steamPath && games.length === 0 && (
            <div className="text-center py-10 text-gray-500">Steam 库中没有已安装的游戏</div>
          )}

          {isElectron && scanDone && games.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-3">
                找到 {games.length} 款已安装游戏 · 点击添加后自动扫描存档路径
              </p>
              <div className="space-y-2">
                {games.map((sg) => {
                  const isAdded = added.has(sg.appId) || added.has(`steam-${sg.appId}`)
                  return (
                    <div key={sg.appId} className="bg-gray-800 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{sg.name}</span>
                          <p className="text-xs text-gray-600 mt-0.5">AppID: {sg.appId}</p>
                        </div>
                        {isAdded ? (
                          <div className="text-right flex-shrink-0">
                            <span className="text-xs text-green-400">已添加</span>
                            {sg.scanned && (
                              <p className="text-xs text-gray-600 mt-0.5">
                                {sg.savePaths.length > 0
                                  ? `找到 ${sg.savePaths.length} 个存档路径`
                                  : '未找到存档路径'}
                              </p>
                            )}
                          </div>
                        ) : sg.scanning ? (
                          <span className="text-xs text-gray-400 flex-shrink-0 animate-pulse">扫描中...</span>
                        ) : (
                          <button
                            onClick={() => handleAdd(sg)}
                            className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 flex-shrink-0 transition-colors"
                          >
                            添加
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
