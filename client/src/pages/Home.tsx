import { useState } from 'react'
import { saveAPI } from '../api'
import { useAuthStore } from '../store/auth'
import type { Game, UserSave, CustomGame } from '../types'
import GameCard from '../components/GameCard'
import SavePanel from '../components/SavePanel'
import AddGameModal from '../components/AddGameModal'

const CUSTOM_GAMES_KEY = 'onemotion:custom_games'

function loadCustomGames(): CustomGame[] {
  try {
    return JSON.parse(localStorage.getItem(CUSTOM_GAMES_KEY) || '[]')
  } catch {
    return []
  }
}

function saveCustomGames(games: CustomGame[]) {
  localStorage.setItem(CUSTOM_GAMES_KEY, JSON.stringify(games))
}

function customToGame(c: CustomGame): Game {
  return {
    id: -1,
    name: c.name,
    name_en: '',
    steam_app_id: '',
    icon_url: '',
    save_paths: JSON.stringify(c.savePaths),
    config_paths: JSON.stringify(c.configPaths),
    is_active: true,
    _customId: c.id,
  } as Game & { _customId: string }
}

export default function Home() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [customGames, setCustomGames] = useState<CustomGame[]>(loadCustomGames)
  const [steamPath, setSteamPath] = useState<string | null>(null)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [saves, setSaves] = useState<UserSave[]>([])
  const [activeTab, setActiveTab] = useState<'save' | 'config'>('save')
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  const fetchSaves = async (game: Game) => {
    setLoading(true)
    try {
      const customId = (game as any)._customId as string
      const res = await saveAPI.list(undefined, activeTab, customId)
      setSaves(res.data.saves)
    } finally {
      setLoading(false)
    }
  }

  const handleSelectGame = (game: Game) => {
    setSelectedGame(game)
    setSaves([])
    fetchSaves(game)
  }

  const handleTabChange = (tab: 'save' | 'config') => {
    setActiveTab(tab)
    setSaves([])
    if (selectedGame) {
      setLoading(true)
      saveAPI.list(undefined, tab, (selectedGame as any)._customId)
        .then(res => setSaves(res.data.saves))
        .finally(() => setLoading(false))
    }
  }

  const handleAddGame = (game: CustomGame, foundSteamPath?: string) => {
    if (foundSteamPath && !steamPath) setSteamPath(foundSteamPath)
    const updated = [...customGames, game]
    setCustomGames(updated)
    saveCustomGames(updated)
    setShowAddModal(false)
    handleSelectGame(customToGame(game))
  }

  const handleRemoveCustomGame = (customId: string) => {
    const updated = customGames.filter((g) => g.id !== customId)
    setCustomGames(updated)
    saveCustomGames(updated)
    if ((selectedGame as any)?._customId === customId) setSelectedGame(null)
  }

  const handleUpdatePaths = (customId: string, savePaths: string[], configPaths: string[]) => {
    const updated = customGames.map(g =>
      g.id === customId ? { ...g, savePaths, configPaths } : g
    )
    setCustomGames(updated)
    saveCustomGames(updated)
    const updatedGame = updated.find(g => g.id === customId)
    if (updatedGame) setSelectedGame(customToGame(updatedGame))
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* 左侧：游戏列表 */}
      <aside className="w-64 bg-gray-900 flex flex-col border-r border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <p className="text-xs text-gray-500">欢迎回来</p>
          <p className="font-semibold mt-0.5">{user?.nickname}</p>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {customGames.length === 0 ? (
            <p className="text-xs text-gray-600 px-2 py-4 text-center">暂无游戏，点击下方添加</p>
          ) : (
            customGames.map((cg) => {
              const g = customToGame(cg)
              return (
                <div key={cg.id} className="group relative">
                  <GameCard
                    game={g}
                    selected={(selectedGame as any)?._customId === cg.id}
                    onClick={() => handleSelectGame(g)}
                  />
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveCustomGame(cg.id) }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none"
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              )
            })
          )}

          <button
            onClick={() => setShowAddModal(true)}
            className="w-full mt-2 px-3 py-2 rounded-lg border border-dashed border-gray-700 text-gray-500 hover:border-indigo-500 hover:text-indigo-400 text-sm transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span>
            添加游戏
          </button>
        </div>

        <div className="p-3 border-t border-gray-800">
          <button
            onClick={logout}
            className="w-full text-xs text-gray-600 hover:text-red-400 py-1.5 transition-colors"
          >
            退出登录
          </button>
        </div>
      </aside>

      {/* 右侧：存档面板 */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {selectedGame ? (
          <SavePanel
            game={selectedGame}
            saves={saves}
            activeTab={activeTab}
            loading={loading}
            steamPath={steamPath}
            onTabChange={handleTabChange}
            onRefresh={() => fetchSaves(selectedGame)}
            onUpdatePaths={(savePaths, configPaths) =>
              handleUpdatePaths((selectedGame as any)._customId, savePaths, configPaths)
            }
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-gray-600">
              <div className="text-5xl mb-4">🎮</div>
              <p className="text-lg">从左侧选择一款游戏</p>
              <p className="text-sm mt-1">开始管理你的存档和配置</p>
            </div>
          </div>
        )}
      </main>

      {showAddModal && (
        <AddGameModal
          existingIds={new Set(customGames.map(g => g.id))}
          onAdd={handleAddGame}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
