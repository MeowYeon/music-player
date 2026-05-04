# 阿言代码结构说明

这份文档帮助快速理解当前代码组织、主要入口和运行链路。

## 顶层结构

```text
.
├── cmd/server/          # Go 后端启动入口
├── internal/            # Go 后端内部模块
├── web/                 # React + Vite 前端
├── scripts/             # 开发服务启停脚本
├── design/              # 架构与 UI 设计资料
├── config.yaml          # 后端本地配置
├── todo.md              # 版本待办和验收记录
└── code.md              # 本说明文档
```

根目录只保留项目级配置和 Go 后端代码。前端工程完整放在 `web/` 下，避免前后端文件混在一起。

## 后端

后端语言是 Go，入口是：

```text
cmd/server/main.go
```

启动时做这些事：

1. 读取 `config.yaml`。
2. 打开 SQLite 数据库。
3. 初始化数据库表结构。
4. 创建扫描服务。
5. 注册 HTTP API。
6. 监听 `127.0.0.1:8080`。

核心模块：

- `internal/config`
  - 读取 `config.yaml`。

- `internal/storage`
  - SQLite 初始化。
  - 媒体库目录、歌曲、扫描任务的读写。
  - 删除某次扫描对应目录的数据。

- `internal/scanner`
  - 校验本地目录。
  - 递归扫描音频文件。
  - 忽略隐藏文件和隐藏目录。
  - 判断同目录重复扫描是否无变化。
  - 写入 tracks 和 scan_jobs。

- `internal/metadata`
  - 读取音频标签。
  - 估算 mp3 时长。

- `internal/httpapi`
  - 注册 REST API。
  - 提供音频 stream，支持 Range。

主要 API：

```text
GET    /api/health
GET    /api/library
POST   /api/scan
GET    /api/scans
DELETE /api/scans/{id}/data
GET    /api/tracks?q=
GET    /api/tracks/{id}/stream
```

## 前端

前端工程在：

```text
web/
```

入口文件：

```text
web/src/main.tsx
web/src/App.tsx
```

主要文件：

- `web/src/App.tsx`
  - 页面布局。
  - 扫描任务面板。
  - 歌曲列表。
  - 底部播放器。
  - 播放进度、切歌、错误状态。

- `web/src/api.ts`
  - 前端 API client。
  - 类型定义。
  - mock 开关。

- `web/src/App.css`
  - 页面样式。

开发期前端运行在：

```text
http://127.0.0.1:5173
```

Vite 会把 `/api` 代理到：

```text
http://127.0.0.1:8080
```

## 数据流

### 扫描

```text
前端输入目录
  -> POST /api/scan
  -> scanner 校验目录
  -> library_roots 创建或复用目录
  -> scan_jobs 创建任务
  -> 递归扫描音频文件
  -> metadata 解析标签和时长
  -> tracks 替换该目录下旧数据
  -> 前端轮询 /api/scans
  -> 扫描完成后刷新 /api/library 和 /api/tracks
```

如果同目录在上次扫描后没有文件数量或修改时间变化，扫描任务会直接完成，并返回：

```text
源数据目录没有变动
```

### 播放

```text
用户点击歌曲
  -> 前端设置 audio src
  -> GET /api/tracks/{id}/stream
  -> 后端查询 tracks.path
  -> http.ServeContent 返回音频流
  -> 浏览器 audio 播放
```

## 开发命令

从项目根目录运行：

```bash
npm run services:start
npm run services:status
npm run services:stop
```

构建前端：

```bash
npm run build
```

测试后端：

```bash
.tools/go-sdk/go/bin/go test ./...
```

如果系统 PATH 中有 Go，也可以直接：

```bash
go test ./...
```

## 运行数据

- SQLite 数据库默认在 `data/music.db`。
- 开发服务 pid 和日志在 `.run/`。
- `.tools/` 存放项目本地 Go SDK。

这些目录都不会提交到 git。
