import { useEffect, useState } from 'react'
import type { CustomGame } from '../types'

interface Props {
  existingIds: Set<string>
  onAdd: (game: CustomGame) => void
  onClose: () => void
}

interface SteamGame {
  appId: string
  name: string
  installDir: string
}

const isElectron = !!window.electronAPI

export default function AddGameModal({ existingIds, onAdd, onClose }: Props) {
  const [scanning, setScanning] = useState(false)
  const [steamGames, setSteamGames] = useState<SteamGame[]>([])
  const [scanDone, setScanDone] = useState(false)
  const [steamPath, setSteamPath] = useState<string | null>(null)

  // 正在配置路径的游戏
  const [configuringId, setConfiguringId] = useState<string | null>(null)
  const [savePath, setSavePath] = useState('')
  const [configPath, setConfigPath] = useState('')
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
      const games = await window.electronAPI.steamScanGames(foundPath)
      setSteamGames(games)
    } finally {
      setScanning(false)
      setScanDone(true)
    }
  }

  const startConfigure = (sg: SteamGame) => {
    setConfiguringId(sg.appId)
    setSavePath('')
    setConfigPath('')
  }

  const confirmAdd = (sg: SteamGame) => {
    const savePaths = savePath.trim()
      ? savePath.split('\n').map(s => s.trim()).filter(Boolean)
      : []
    const configPaths = configPath.trim()
      ? configPath.split('\n').map(s => s.trim()).filter(Boolean)
      : []
    onAdd({ id: `steam-${sg.appId}`, name: sg.name, savePaths, configPaths })
    setAdded(prev => new Set(prev).add(sg.appId))
    setConfiguringId(null)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-2xl w-[580px] max-h-[78vh] flex flex-col border border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">扫描 Steam 游戏</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!isElectron && (
            <div className="text-center py-10 text-gray-500">
              <p>扫描功能需要在桌面应用中运行</p>
            </div>
          )}

          {isElectron && scanning && (
            <div className="text-center py-10 text-gray-400">
              <div className="text-3xl mb-3 animate-pulse">🔍</div>
              <p>正在扫描 Steam 游戏库...</p>
            </div>
          )}

          {isElectron && scanDone && !steamPath && (
            <div className="text-center py-10 text-gray-500">
              <p>未找到 Steam 安装目录</p>
            </div>
          )}

          {isElectron && scanDone && steamPath && steamGames.length === 0 && (
            <div className="text-center py-10 text-gray-500">
              <p>Steam 库中没有已安装的游戏</p>
            </div>
          )}

          {isElectron && scanDone && steamGames.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-3">找到 {steamGames.length} 款已安装游戏</p>
              <div className="space-y-2">
                {steamGames.map((sg) => {
                  const isAdded = added.has(sg.appId) || added.has(`steam-${sg.appId}`)
                  const isConfiguring = configuringId === sg.appId

                  return (
                    <div key={sg.appId} className="bg-gray-800 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium">{sg.name}</span>
                          <p className="text-xs text-gray-600 mt-0.5">AppID: {sg.appId}</p>
                        </div>
                        {isAdded ? (
                          <span className="text-xs text-gray-500 flex-shrink-0">已添加</span>
                        ) : isConfiguring ? (
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() => confirmAdd(sg)}
                              className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors"
                            >
                              确认添加
                            </button>
                            <button
                              onClick={() => setConfiguringId(null)}
                              className="text-sm px-2 py-1.5 rounded-lg text-gray-500 hover:text-white"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startConfigure(sg)}
                            className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 flex-shrink-0 transition-colors"
                          >
                            添加
                          </button>
                        )}
                      </div>

                      {isConfiguring && (
                        <div className="mt-3 space-y-2">
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">
                              存档路径（每行一个，可用 {'{APPDATA}'} {'{USERPROFILE}'} 等变量）
                            </label>
                            <textarea
                              autoFocus
                              value={savePath}
                              onChange={(e) => setSavePath(e.target.value)}
                              placeholder={`例：{APPDATA}\\${sg.name}\\saves`}
                              rows={2}
                              className="w-full bg-gray-700 text-white text-xs px-3 py-2 rounded-lg border border-gray-600 focus:border-indigo-500 outline-none placeholder-gray-600 resize-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-400 mb-1 block">
                              配置路径（可选）
                            </label>
                            <textarea
                              value={configPath}
                              onChange={(e) => setConfigPath(e.target.value)}
                              placeholder="不填则跳过配置管理"
                              rows={2}
                              className="w-full bg-gray-700 text-white text-xs px-3 py-2 rounded-lg border border-gray-600 focus:border-indigo-500 outline-none placeholder-gray-600 resize-none"
                            />
                          </div>
                          <p className="text-xs text-gray-600">路径可以留空，后续在游戏面板中补充</p>
                        </div>
                      )}
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
