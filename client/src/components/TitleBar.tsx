const isElectron = !!window.electronAPI

export default function TitleBar() {
  if (!isElectron) return null

  return (
    <div
      className="h-8 flex items-center justify-between bg-gray-950 border-b border-gray-800/50 flex-shrink-0 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties & { WebkitAppRegion: string }}
    >
      <div className="flex items-center gap-2 px-4">
        <div className="w-4 h-4 rounded-sm bg-indigo-600 flex items-center justify-center">
          <span className="text-white text-[8px] font-bold leading-none">O</span>
        </div>
        <span className="text-xs text-gray-500 font-medium tracking-wide">OneMotion</span>
      </div>

      <div
        className="flex h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties & { WebkitAppRegion: string }}
      >
        <button
          onClick={() => window.electronAPI!.minimize()}
          className="w-12 h-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          title="最小化"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1"/>
          </svg>
        </button>
        <button
          onClick={() => window.electronAPI!.maximize()}
          className="w-12 h-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-gray-800 transition-colors"
          title="最大化"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
            <rect x="0.5" y="0.5" width="9" height="9"/>
          </svg>
        </button>
        <button
          onClick={() => window.electronAPI!.close()}
          className="w-12 h-full flex items-center justify-center text-gray-500 hover:text-white hover:bg-red-600 transition-colors"
          title="关闭"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">
            <line x1="0" y1="0" x2="10" y2="10"/>
            <line x1="10" y1="0" x2="0" y2="10"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
