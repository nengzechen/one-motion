import { useEffect, useState } from 'react'
import { gameAPI, saveAPI } from '../api'
import { useAuthStore } from '../store/auth'
import type { Game, UserSave, CustomGame } from '../types'
import GameCard from '../components/GameCard'
import SavePanel from '../components/SavePanel'
import AddGameModal from '../components/AddGameModal'

// 自定义游戏存 localStorage（路径是本机相关的，不需要同步到云端）
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

// 将 CustomGame 转成 Game 格式供组件使用
function customToGame(c: CustomGame): Game {
  return {
    id: -1,                             // 负数标识自定义游戏
    name: c.name,
    name_en: '',
    steam_app_id: '',
    icon_url: '',
    save_paths: JSON.stringify(c.savePaths),
    config_paths: JSON.stringify(c.configPaths),
    is_active: true,
    _customId: c.id,                    // 保留原始 id
  } as Game & { _customId: string }
}

export default function Home() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const [builtinGames, setBuiltinGames] = useState<Game[]>([])
  const [customGames, setCustomGames] = useState<CustomGame[]>(loadCustomGames)
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)
  const [saves, setSaves] = useState<UserSave[]>([])
  const [activeTab, setActiveTab] = useState<'save' | 'config'>('save')
  const [loading, setLoading] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)

  // 合并展示的游戏列表
  const allGames = [...builtinGames, ...customGames.map(customToGame)]

  useEffect(() => {
    gameAPI.list().then((res) => setBuiltinGames(res.data.games))
  }, [])

  useEffect(() => {
    if (!selectedGame) return
    fetchSaves()
  }, [selectedGame, activeTab])

  const fetchSaves = async () => {
    if (!selectedGame) return
    setLoading(true)
    try {
      // 自定义游戏用游戏名作为标识，内置游戏用 id
      const gameId = selectedGame.id > 0 ? selectedGame.id : undefined
      if (!gameId) { setSaves([]); return }
      const res = await saveAPI.list(gameId, activeTab)
      setSaves(res.data.saves)
    } finally {
      setLoading(false)
    }
  }

  const handleAddGame = (game: CustomGame) => {
    const updated = [...customGames, game]
    setCustomGames(updated)
    saveCustomGames(updated)
    setShowAddModal(false)
    // 自动选中刚添加的游戏
    setSelectedGame(customToGame(game))
  }

  const handleRemoveCustomGame = (customId: string) => {
    const updated = customGames.filter((g) => g.id !== customId)
    setCustomGames(updated)
    saveCustomGames(updated)
    if ((selectedGame as any)?._customId === customId) {
      setSelectedGame(null)
    }
  }

  return (
    <div className="flex h-screen bg-gray-950 text-white">
      {/* 左侧：游戏列表 */}
      <aside className="w-64 bg-gray-900 flex flex-col border-r border-gray-800">
        {/* 用户信息 */}
        <div className="p-4 border-b border-gray-800">
          <p className="text-xs text-gray-500">欢迎回来</p>
          <p className="font-semibold mt-0.5">{user?.nickname}</p>
        </div>

        {/* 游戏列表 */}
        <div className="flex-1 overflow-y-auto p-2">
          {/* 内置游戏 */}
          <p className="text-xs text-gray-600 px-2 py-2 uppercase tracking-wider">内置支持</p>
          {builtinGames.map((game) => (
            <GameCard
              key={game.id}
              game={game}
              selected={selectedGame?.id === game.id}
              onClick={() => setSelectedGame(game)}
            />
          ))}

          {/* 自定义游戏 */}
          {customGames.length > 0 && (
            <>
              <p className="text-xs text-gray-600 px-2 pt-3 pb-2 uppercase tracking-wider">我的游戏</p>
              {customGames.map((cg) => {
                const g = customToGame(cg)
                return (
                  <div key={cg.id} className="group relative">
                    <GameCard
                      game={g}
                      selected={(selectedGame as any)?._customId === cg.id}
                      onClick={() => setSelectedGame(g)}
                    />
                    {/* 删除按钮 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemoveCustomGame(cg.id) }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg leading-none"
                      title="删除"
                    >
                      ×
                    </button>
                  </div>
                )
              })}
            </>
          )}

          {/* 添加游戏按钮 */}
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full mt-2 px-3 py-2 rounded-lg border border-dashed border-gray-700 text-gray-500 hover:border-indigo-500 hover:text-indigo-400 text-sm transition-colors flex items-center gap-2"
          >
            <span className="text-lg leading-none">+</span>
            添加游戏
          </button>
        </div>

        {/* 退出 */}
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
            onTabChange={(t) => { setActiveTab(t); setSaves([]) }}
            onRefresh={fetchSaves}
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

      {/* 添加游戏弹窗 */}
      {showAddModal && (
        <AddGameModal
          builtinGames={builtinGames}
          onAdd={handleAddGame}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  )
}
