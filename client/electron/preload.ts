import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),

  // 文件系统
  scanPaths: (paths: string[]) =>
    ipcRenderer.invoke('fs:scanPaths', paths),
  compress: (sourcePaths: string[]) =>
    ipcRenderer.invoke('fs:compress', sourcePaths),
  extract: (zipPath: string, destDir: string) =>
    ipcRenderer.invoke('fs:extract', zipPath, destDir),
  resolvePaths: (templates: string[], steamUserdataPath?: string) =>
    ipcRenderer.invoke('fs:resolvePaths', templates, steamUserdataPath),
  openFolder: (folderPath: string) =>
    ipcRenderer.send('shell:openFolder', folderPath),

  // Steam 扫描
  steamFindInstall: () =>
    ipcRenderer.invoke('steam:findInstall'),
  steamScanGames: (steamPath: string) =>
    ipcRenderer.invoke('steam:scanGames', steamPath),
  steamGetUserdataPath: (steamPath: string) =>
    ipcRenderer.invoke('steam:getUserdataPath', steamPath),

  // 下载并解压存档
  downloadAndExtract: (url: string, destPaths: string[]) =>
    ipcRenderer.invoke('fs:downloadAndExtract', url, destPaths),

  // 自动扫描游戏存档路径
  steamFindSavePaths: (appId: string, gameName: string, steamPath: string, installDir?: string) =>
    ipcRenderer.invoke('steam:findSavePaths', appId, gameName, steamPath, installDir),
})
