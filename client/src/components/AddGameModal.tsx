import { useEffect, useState } from 'react'
import type { Game, SteamGame, CustomGame } from '../types'

interface Props {
  builtinGames: Game[]
  onAdd: (game: CustomGame) => void
  onClose: () => void
}

const isElectron = !!window.electronAPI

export default function AddGameModal({ builtinGames, onAdd, onClose }: Props) {
  const [scanning, setScanning] = useState(false)
  const [steamPath, setSteamPath] = useState<string | null>(null)
  const [steamGames, setSteamGames] = useState<SteamGame[]>([])
  const [scanDone, setScanDone] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set())

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

      const rawGames = await window.electronAPI.steamScanGames(foundPath)
      const matched = rawGames.map((g) => {
        const builtin = builtinGames.find((b) => b.steam_app_id === g.appId)
        return { ...g, supported: !!builtin, matchedGame: builtin } as SteamGame
      })
      matched.sort((a, b) => (b.supported ? 1 : 0) - (a.supported ? 1 : 0))
      setSteamGames(matched)
    } finally {
      setScanning(false)
      setScanDone(true)
    }
  }

  const handleAdd = (sg: SteamGame) => {
    const savePaths = sg.matchedGame
      ? (JSON.parse(sg.matchedGame.save_paths || '[]') as string[])
      : []
    const configPaths = sg.matchedGame
      ? (JSON.parse(sg.matchedGame.config_paths || '[]') as string[])
      : []
    onAdd({ id: `steam-${sg.appId}`, name: sg.matchedGame?.name ?? sg.name, savePaths, configPaths })
    setAdded((prev) => new Set(prev).add(sg.appId))
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-2xl w-[560px] max-h-[75vh] flex flex-col border border-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">扫描已安装游戏</h2>
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
              <p className="text-xs text-gray-500 mb-3">
                找到 {steamGames.length} 款游戏 ·{' '}
                <span className="text-green-400">{steamGames.filter((g) => g.supported).length} 款</span>
                已收录存档路径
              </p>
              <div className="space-y-2">
                {steamGames.map((sg) => (
                  <div key={sg.appId} className="flex items-center gap-3 bg-gray-800 rounded-xl px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium truncate">{sg.matchedGame?.name ?? sg.name}</span>
                        {sg.supported
                          ? <span className="text-xs bg-green-900/60 text-green-400 px-2 py-0.5 rounded flex-shrink-0">已收录</span>
                          : <span className="text-xs bg-gray-700 text-gray-500 px-2 py-0.5 rounded flex-shrink-0">未收录</span>
                        }
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">AppID: {sg.appId}</p>
                    </div>
                    <button
                      onClick={() => handleAdd(sg)}
                      disabled={added.has(sg.appId)}
                      className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 flex-shrink-0 transition-colors"
                    >
                      {added.has(sg.appId) ? '已添加' : '添加'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
