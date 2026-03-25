import axios from 'axios'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api'

const http = axios.create({ baseURL: BASE_URL, timeout: 30000 })

// 自动附带 token
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── 认证 ──────────────────────────────────────
export const authAPI = {
  sendSms: (phone: string) =>
    http.post('/auth/sms', { phone }),

  register: (username: string, password: string, nickname?: string) =>
    http.post('/auth/register', { username, password, nickname }),

  login: (username: string, password: string) =>
    http.post<{ token: string; user: { id: number; username: string; nickname: string } }>(
      '/auth/login', { username, password }
    ),

  loginWithCode: (phone: string, code: string) =>
    http.post<{ token: string; user: { id: number; username: string; nickname: string } }>(
      '/auth/login-code', { phone, code }
    ),
}

// ── 游戏 ──────────────────────────────────────
export const gameAPI = {
  list: () =>
    http.get<{ games: import('../types').Game[] }>('/games'),
}

// ── 存档 ──────────────────────────────────────
export const saveAPI = {
  list: (gameId?: number, type: 'save' | 'config' = 'save') =>
    http.get<{ saves: import('../types').UserSave[] }>('/saves', {
      params: { game_id: gameId, type },
    }),

  upload: (
    gameId: number,
    type: 'save' | 'config',
    file: File,
    note?: string,
    onProgress?: (percent: number) => void
  ) => {
    const form = new FormData()
    form.append('game_id', String(gameId))
    form.append('type', type)
    form.append('file', file)
    if (note) form.append('note', note)

    return http.post<{ message: string; duplicate?: boolean; save: import('../types').UserSave }>(
      '/saves/upload', form, {
        onUploadProgress: (e) => {
          if (e.total && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100))
          }
        },
      }
    )
  },

  getDownloadURL: (saveId: number) =>
    http.get<{ url: string; expires_in: number; save: import('../types').UserSave }>(
      `/saves/${saveId}/download`
    ),

  rename: (saveId: number, note: string) =>
    http.patch(`/saves/${saveId}`, { note }),

  delete: (saveId: number) =>
    http.delete(`/saves/${saveId}`),
}
