# OneMotion

游戏存档云同步工具，支持多台设备之间自动同步游戏存档。

## 功能

- 扫描本地 Steam 游戏及存档路径
- 一键上传 / 下载存档到云端
- 自定义标题栏，深色游戏风格 UI
- 跨设备同步，随时切换机器继续游戏

## 项目结构

```
one-motion/
├── client/          # Electron + React 桌面客户端
│   ├── electron/    # Electron 主进程 (main.ts, preload.ts)
│   ├── src/         # React 渲染进程
│   │   ├── api/     # 后端接口封装
│   │   ├── components/
│   │   ├── pages/
│   │   ├── store/   # Zustand 状态管理
│   │   └── types/
│   └── assets/      # 应用图标
└── backend/         # Go 后端服务
    ├── cmd/         # 入口
    └── internal/
        ├── handler/
        ├── middleware/
        ├── model/
        ├── repository/
        └── service/
```

## 开发

### 前置要求

- Node.js 20+
- Go 1.21+

### 客户端

```bash
cd client
npm install
npm run dev
```

### 后端

```bash
cd backend
go run ./cmd/main.go
```

## 打包

Windows 安装包通过 GitHub Actions 自动构建，推送 tag 触发：

```bash
git tag v1.0.0
git push origin v1.0.0
```

构建完成后在 Actions → Artifacts 下载 `OneMotion-Windows.zip`。

## 技术栈

| 端 | 技术 |
|---|---|
| 客户端框架 | Electron 31 + React 18 |
| UI 样式 | Tailwind CSS |
| 状态管理 | Zustand |
| 路由 | React Router v6 |
| 后端语言 | Go |
| 打包工具 | electron-builder (NSIS) |
