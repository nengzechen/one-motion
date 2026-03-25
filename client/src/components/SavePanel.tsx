import { useState } from 'react'
import { saveAPI } from '../api'
import type { Game, UserSave, PathScanResult } from '../types'

interface Props {
  game: Game
  saves: UserSave[]
  activeTab: 'save' | 'config'
  loading: boolean
  onTabChange: (tab: 'save' | 'config') => void
  onRefresh: () => void
  onUpdatePaths?: (savePaths: string[], configPaths: string[]) => void
  steamPath?: string | null
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const isElectron = !!window.electronAPI

export default function SavePanel({ game, saves, activeTab, loading, onTabChange, onRefresh, onUpdatePaths, steamPath }: Props) {
  // 上传区
  const [saveName, setSaveName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [scanResults, setScanResults] = useState<PathScanResult[]>([])
  const [scanDone, setScanDone] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ text: string; type: 'info' | 'warn' | 'ok' | 'err' } | null>(null)

  // 下载区
  const [downloading, setDownloading] = useState<number | null>(null)
  const [restoreMsg, setRestoreMsg] = useState('')

  // 路径编辑
  const [editingPaths, setEditingPaths] = useState(false)
  const [editSavePath, setEditSavePath] = useState(
    () => JSON.parse(game.save_paths || '[]').join('\n')
  )
  const [editConfigPath, setEditConfigPath] = useState(
    () => JSON.parse(game.config_paths || '[]').join('\n')
  )

  // 重命名
  const [renamingId, setRenamingId] = useState<number | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const pathTemplates: string[] = activeTab === 'save'
    ? JSON.parse(game.save_paths || '[]')
    : JSON.parse(game.config_paths || '[]')

  const resetUpload = () => {
    setScanDone(false)
    setScanResults([])
    setUploadMsg(null)
  }

  // ── 扫描本地路径 ──────────────────────────────
  const scanLocalPaths = async () => {
    const resolved = await window.electronAPI!.resolvePaths(pathTemplates)
    const results = await window.electronAPI!.scanPaths(resolved)
    setScanResults(results)
    setScanDone(true)
    const total = results.reduce((s, r) => s + r.size, 0)
    setUploadMsg(
      results.some((r) => r.exists)
        ? { text: `找到 ${results.filter((r) => r.exists).length} 个路径，共 ${formatBytes(total)}`, type: 'info' }
        : { text: '未找到本地存档路径，请确认游戏已运行过', type: 'warn' }
    )
  }

  // ── 上传 ──────────────────────────────────────
  const handleUpload = async () => {
    if (!saveName.trim()) {
      setUploadMsg({ text: '请先填写存档名称', type: 'warn' })
      return
    }
    const existingPaths = scanResults.filter((r) => r.exists).map((r) => r.path)
    if (existingPaths.length === 0) return

    setUploading(true)
    setUploadProgress(0)
    setUploadMsg(null)
    try {
      const base64 = await window.electronAPI!.compress(existingPaths)
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const blob = new Blob([bytes], { type: 'application/zip' })
      const file = new File([blob], `${game.name_en || game.name}_${activeTab}_${Date.now()}.zip`)

      const customId = (game as any)._customId as string
      const res = await saveAPI.upload(customId, game.name, activeTab, file, saveName.trim(), (p) => setUploadProgress(p))

      if (res.data.duplicate) {
        setUploadMsg({ text: res.data.message, type: 'warn' })
      } else {
        setUploadMsg({ text: '上传成功', type: 'ok' })
        setSaveName('')
        resetUpload()
        onRefresh()
      }
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || '上传失败，请重试'
      setUploadMsg({ text: msg, type: 'err' })
    } finally {
      setUploading(false)
    }
  }

  // ── 下载还原 ──────────────────────────────────
  const handleRestore = async (save: UserSave) => {
    if (!isElectron) return
    setDownloading(save.id)
    setRestoreMsg('')
    try {
      const res = await saveAPI.getDownloadURL(save.id)
      const resolved = await window.electronAPI!.resolvePaths(pathTemplates)
      await window.electronAPI!.downloadAndExtract(res.data.url, resolved)
      setRestoreMsg(`已还原「${save.note || `v${save.version}`}」`)
    } catch {
      setRestoreMsg('还原失败，请重试')
    } finally {
      setDownloading(null)
    }
  }

  // ── 重命名 ────────────────────────────────────
  const startRename = (save: UserSave) => {
    setRenamingId(save.id)
    setRenameValue(save.note || '')
  }

  const submitRename = async (save: UserSave) => {
    if (!renameValue.trim()) return
    try {
      await saveAPI.rename(save.id, renameValue.trim())
      onRefresh()
    } finally {
      setRenamingId(null)
    }
  }

  // ── 删除 ──────────────────────────────────────
  const handleDelete = async (save: UserSave) => {
    if (!window.confirm(`确定删除「${save.note || `v${save.version}`}」？`)) return
    try {
      await saveAPI.delete(save.id)
    } finally {
      onRefresh()
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* 头部 */}
      <div className="px-6 py-4 border-b border-gray-800 flex items-end justify-between">
        <div>
          <h2 className="text-xl font-semibold">{game.name}</h2>
          {game.name_en && <p className="text-gray-500 text-sm">{game.name_en}</p>}
        </div>
        {restoreMsg && (
          <p className="text-sm text-gray-400 pb-1">{restoreMsg}</p>
        )}
      </div>

      {/* Tab */}
      <div className="flex px-6 pt-4 gap-4 border-b border-gray-800">
        {(['save', 'config'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { onTabChange(tab); resetUpload() }}
            className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-indigo-500 text-white'
                : 'border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'save' ? '游戏存档' : '游戏配置'}
          </button>
        ))}
      </div>

      <div className="flex-1 flex gap-6 p-6 overflow-hidden">
        {/* 左：上传区 */}
        <div className="w-72 flex-shrink-0">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="font-medium mb-3 text-sm text-gray-300">上传到云端</h3>

            {!isElectron ? (
              <div className="text-center py-4">
                <p className="text-gray-500 text-sm">上传功能需要桌面应用</p>
                <p className="text-gray-600 text-xs mt-1">当前为浏览器预览模式</p>
              </div>
            ) : pathTemplates.length === 0 && !editingPaths ? (
              <div className="space-y-2">
                <p className="text-gray-500 text-sm">未找到存档路径</p>
                {steamPath && (
                  <button
                    onClick={async () => {
                      const appId = (game as any)._customId?.replace('steam-', '') || ''
                      const result = await window.electronAPI!.steamFindSavePaths(appId, game.name, steamPath)
                      if (result.savePaths.length > 0 || result.configPaths.length > 0) {
                        onUpdatePaths?.(result.savePaths, result.configPaths)
                      } else {
                        setEditingPaths(true)
                      }
                    }}
                    className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"
                  >
                    重新扫描路径
                  </button>
                )}
                <button
                  onClick={() => setEditingPaths(true)}
                  className="w-full py-1.5 rounded-lg text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  手动填写路径
                </button>
              </div>
            ) : editingPaths ? (
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">存档路径（每行一个）</label>
                  <textarea
                    autoFocus
                    value={editSavePath}
                    onChange={(e) => setEditSavePath(e.target.value)}
                    rows={3}
                    className="w-full bg-gray-800 text-white text-xs px-3 py-2 rounded-lg border border-gray-700 focus:border-indigo-500 outline-none resize-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">配置路径（可选）</label>
                  <textarea
                    value={editConfigPath}
                    onChange={(e) => setEditConfigPath(e.target.value)}
                    rows={2}
                    className="w-full bg-gray-800 text-white text-xs px-3 py-2 rounded-lg border border-gray-700 focus:border-indigo-500 outline-none resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const sp = editSavePath.split('\n').map(s => s.trim()).filter(Boolean)
                      const cp = editConfigPath.split('\n').map(s => s.trim()).filter(Boolean)
                      onUpdatePaths?.(sp, cp)
                      setEditingPaths(false)
                    }}
                    className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm transition-colors"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditingPaths(false)}
                    className="px-3 py-1.5 rounded-lg text-gray-500 hover:text-white text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* 存档名称（必填） */}
                <input
                  type="text"
                  placeholder="存档名称，如：通关前、满级存档"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  className="w-full bg-gray-800 text-white text-sm px-3 py-2 rounded-lg border border-gray-700 focus:border-indigo-500 outline-none placeholder-gray-600 mb-3"
                />

                {/* 路径状态 */}
                <div className="space-y-1 mb-3">
                  {pathTemplates.map((p, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        !scanDone ? 'bg-gray-600'
                        : scanResults[i]?.exists ? 'bg-green-500' : 'bg-red-500'
                      }`} />
                      <span className="text-xs text-gray-600 truncate" title={p}>{p}</span>
                    </div>
                  ))}
                </div>

                {!scanDone ? (
                  <button
                    onClick={scanLocalPaths}
                    className="w-full py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-300 transition-colors"
                  >
                    扫描本地路径
                  </button>
                ) : (
                  <button
                    onClick={handleUpload}
                    disabled={uploading || !scanResults.some((r) => r.exists)}
                    className="w-full py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    {uploading ? `上传中 ${uploadProgress}%` : '上传'}
                  </button>
                )}

                {uploadMsg && (
                  <p className={`text-xs mt-2 ${
                    uploadMsg.type === 'ok' ? 'text-green-400'
                    : uploadMsg.type === 'warn' ? 'text-yellow-400'
                    : uploadMsg.type === 'err' ? 'text-red-400'
                    : 'text-gray-400'
                  }`}>
                    {uploadMsg.text}
                  </p>
                )}

                {scanDone && (
                  <button onClick={resetUpload} className="text-xs text-gray-600 hover:text-gray-400 mt-2 block">
                    重新扫描
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* 右：存档列表 */}
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm text-gray-400">
              云端存档 ({saves.length})
            </h3>
            <button
              onClick={onRefresh}
              disabled={loading}
              className="text-xs text-gray-600 hover:text-gray-300 transition-colors flex items-center gap-1 disabled:opacity-40"
              title="刷新列表"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className={loading ? 'animate-spin' : ''}>
                <path d="M10 6A4 4 0 1 1 6 2" strokeLinecap="round"/>
                <path d="M6 2l1.5-1.5L9 2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              刷新
            </button>
          </div>

          {loading ? (
            <p className="text-gray-600 text-sm">加载中...</p>
          ) : saves.length === 0 ? (
            <p className="text-gray-600 text-sm">暂无存档，上传第一个吧</p>
          ) : (
            <div className="space-y-2">
              {saves.map((save) => (
                <div
                  key={save.id}
                  className="flex items-center gap-3 bg-gray-900 rounded-xl px-4 py-3 border border-gray-800 group"
                >
                  <div className="flex-1 min-w-0">
                    {/* 名称 / 重命名输入框 */}
                    {renamingId === save.id ? (
                      <div className="flex gap-2">
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') submitRename(save)
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          className="flex-1 bg-gray-800 text-white text-sm px-2 py-1 rounded border border-indigo-500 outline-none"
                        />
                        <button onClick={() => submitRename(save)} className="text-xs text-indigo-400 hover:text-indigo-300">保存</button>
                        <button onClick={() => setRenamingId(null)} className="text-xs text-gray-500 hover:text-gray-400">取消</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {save.note || `版本 v${save.version}`}
                        </span>
                        <button
                          onClick={() => startRename(save)}
                          className="text-gray-600 hover:text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          title="重命名"
                        >
                          ✎
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-gray-600 mt-0.5">
                      {formatDate(save.created_at)} · {formatBytes(save.file_size)}
                    </p>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleRestore(save)}
                      disabled={!isElectron || downloading === save.id}
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-sm disabled:opacity-40 transition-colors"
                      title={!isElectron ? '需要桌面应用' : '覆盖本地文件'}
                    >
                      {downloading === save.id ? '还原中...' : activeTab === 'config' ? '覆盖本地配置' : '还原到本地'}
                    </button>
                    <button
                      onClick={() => handleDelete(save)}
                      className="px-2 py-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-gray-800 text-sm opacity-0 group-hover:opacity-100 transition-all"
                      title="删除"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

