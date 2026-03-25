import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authAPI } from '../api'
import { useAuthStore } from '../store/auth'

type Mode = 'login' | 'register'

export default function Login() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setError('')
    setLoading(true)
    try {
      const res = mode === 'login'
        ? await authAPI.login(username, password)
        : await authAPI.register(username, password, nickname)
      setAuth(res.data.user, res.data.token)
      navigate('/home', { replace: true })
    } catch (e: any) {
      setError(e.response?.data?.error || '操作失败')
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') submit()
  }

  return (
    <div className="h-full flex items-center justify-center relative overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 60% 40%, #1e1b4b 0%, #0f0f1a 50%, #0a0a0f 100%)' }}
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-900/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-violet-900/20 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-sm px-4 relative z-10">
        {/* Logo 区域 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 4C10.477 4 6 8.477 6 14c0 2.4.848 4.604 2.255 6.33L6 26h20l-2.255-5.67C25.152 18.604 26 16.4 26 14c0-5.523-4.477-10-10-10z" fill="white" fillOpacity="0.9"/>
              <circle cx="11" cy="14" r="1.5" fill="#6366f1"/>
              <circle cx="21" cy="14" r="1.5" fill="#6366f1"/>
              <rect x="13" y="12" width="6" height="1.5" rx="0.75" fill="#6366f1"/>
              <rect x="15.25" y="11" width="1.5" height="5" rx="0.75" fill="#6366f1"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">OneMotion</h1>
          <p className="text-gray-400 mt-1 text-sm">游戏存档云同步</p>
        </div>

        {/* 卡片 */}
        <div className="bg-gray-900/80 backdrop-blur-sm rounded-2xl p-6 border border-gray-800/60 shadow-2xl">
          {/* 模式切换 */}
          <div className="flex rounded-xl bg-gray-800/60 p-1 mb-5">
            {(['login', 'register'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError('') }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === m
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/50'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          <div className="space-y-3" onKeyDown={handleKey}>
            <input
              type="text"
              placeholder="账号"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-800/60 text-white px-4 py-3 rounded-xl border border-gray-700/50 focus:border-indigo-500 focus:bg-gray-800 outline-none placeholder-gray-600 transition-colors text-sm"
            />
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-800/60 text-white px-4 py-3 rounded-xl border border-gray-700/50 focus:border-indigo-500 focus:bg-gray-800 outline-none placeholder-gray-600 transition-colors text-sm"
            />
            {mode === 'register' && (
              <input
                type="text"
                placeholder="昵称（可选）"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="w-full bg-gray-800/60 text-white px-4 py-3 rounded-xl border border-gray-700/50 focus:border-indigo-500 focus:bg-gray-800 outline-none placeholder-gray-600 transition-colors text-sm"
              />
            )}

            {error && (
              <div className="bg-red-900/30 border border-red-800/50 rounded-lg px-3 py-2">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}

            <button
              onClick={submit}
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-medium transition-all disabled:opacity-50 text-sm"
              style={{ background: loading ? undefined : 'linear-gradient(135deg, #6366f1, #7c3aed)' }}
            >
              {loading ? '请稍候...' : mode === 'login' ? '登录' : '注册'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
