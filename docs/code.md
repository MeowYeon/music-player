# 阿言代码结构说明

这份文档帮助快速理解当前代码组织、主要入口和运行链路。系统设计层面的完整说明见 [当前架构](./design/architecture.md)。

## 顶层结构

```text
.
├── cmd/server/          # Go 后端启动入口
├── internal/            # Go 后端内部模块
├── web/                 # React + Vite 前端
├── scripts/             # 开发服务启停脚本
├── docs/                # 项目说明、设计资料、版本待办
├── config.yaml          # 后端本地配置
└── README.md            # 项目入口说明
```

根目录保留项目级配置、Go 后端代码和开发脚本。前端工程完整放在 `web/` 下，避免前后端文件混在一起。

## 后端

后端语言是 Go，入口是：

```text
cmd/server/main.go
```

启动时做这些事：

1. 读取 `config.yaml`。
2. 打开 SQLite 数据库。
3. 执行内嵌 schema 初始化表结构。
4. 确保系统歌单 `我喜欢` 和 `最近播放` 存在。
5. 创建扫描服务。
6. 注册 HTTP API。
7. 监听 `127.0.0.1:8080`。

核心模块：

- `internal/config`
  - 读取 `config.yaml`。

- `internal/storage`
  - SQLite 初始化。
  - 媒体库、扫描任务、音乐、媒体库音乐关系、普通歌单和系统歌单的读写。
  - 删除媒体库时清理索引关系和 orphan music，不删除本地文件。
  - 使用 `database/sql` 手写 SQL；`queries.sql` 是 SQL 参考，不是 sqlc 输入。

- `internal/scanner`
  - 校验本地目录。
  - 递归扫描音频文件。
  - 忽略隐藏文件和隐藏目录。
  - 支持重复扫描的无变化判断。
  - 解析元数据并替换指定媒体库的音乐关系。

- `internal/metadata`
  - 读取音频标签。
  - 估算 mp3 时长。
  - 解析失败时保留文件名 fallback。

- `internal/httpapi`
  - 注册 REST API。
  - 提供音频 stream，支持 Range。
  - 将 storage 和 scanner 暴露为 JSON API。

主要 API：

```text
GET    /api/health
GET    /api/library
GET    /api/libraries
POST   /api/libraries
DELETE /api/libraries/{id}
POST   /api/libraries/{id}/scan
GET    /api/scan-tasks/active
GET    /api/tracks?q=
GET    /api/tracks/{id}/stream
GET    /api/playlists
POST   /api/playlists
PATCH  /api/playlists/{id}
DELETE /api/playlists/{id}
GET    /api/playlists/{id}/tracks
POST   /api/playlists/{id}/tracks
DELETE /api/playlists/{id}/tracks/{trackId}
GET    /api/playlists/liked/tracks
POST   /api/tracks/{id}/like
DELETE /api/tracks/{id}/like
GET    /api/playlists/recent/tracks
POST   /api/tracks/{id}/recent-play
```

`DELETE /api/libraries/{id}` 会删除媒体库索引、扫描状态和不再被其他媒体库引用的 music；它不会删除本地音乐文件。

## 数据模型

当前核心表：

- `libraries`
  - 用户添加的音乐目录。

- `scan_tasks`
  - 每个媒体库一条扫描状态。

- `music`
  - 全局唯一的音乐文件，以 `path` 去重。

- `library_music`
  - 媒体库和音乐的关系。

- `playlists`
  - 普通歌单和系统歌单。

- `playlist_music`
  - 歌单和音乐的关系，同时保存最近播放时间。

schema 定义在：

```text
internal/storage/schema.sql
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
  - 页面布局和导航。
  - 媒体库页、歌曲页、普通歌单、我喜欢、最近播放。
  - 底部播放器。
  - 播放队列、播放顺序、播放进度、切歌、音量和错误状态。

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

### 添加并扫描媒体库

```text
前端输入目录
  -> POST /api/libraries
  -> httpapi 校验目录
  -> storage 创建或复用 libraries
  -> storage 确保 scan_tasks 记录存在
  -> 前端 POST /api/libraries/{id}/scan
  -> scanner 将任务置为 waiting/running
  -> scanner 递归收集音频文件
  -> metadata 解析标签和时长
  -> storage upsert music
  -> storage 替换该媒体库的 library_music 关系
  -> 前端轮询 /api/scan-tasks/active
  -> 扫描完成后刷新 /api/library、/api/libraries 和 /api/tracks
```

如果同目录在上次成功扫描后没有文件数量或修改时间变化，并且不存在未知时长歌曲，扫描任务会直接完成，并返回：

```text
媒体库已是最新，无需重新导入
```

### 播放

```text
用户点击歌曲
  -> 前端设置 audio src
  -> GET /api/tracks/{id}/stream
  -> 后端查询 music.path
  -> http.ServeContent 返回音频流
  -> 浏览器 audio 播放
  -> 前端记录最近播放
```

### 歌单

```text
普通歌单
  -> /api/playlists
  -> playlists(type = normal)
  -> playlist_music 维护关系

我喜欢
  -> /api/tracks/{id}/like
  -> playlists(type = liked)
  -> playlist_music 维护关系

最近播放
  -> /api/tracks/{id}/recent-play
  -> playlists(type = recent)
  -> playlist_music.last_played_at 排序
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
go test ./...
```

如果系统 PATH 中没有 Go，也可以使用项目本地 Go SDK：

```bash
.tools/go-sdk/go/bin/go test ./...
```

## 运行数据

- SQLite 数据库默认在 `data/music.db`。
- 开发服务 pid 和日志在 `.run/`。
- `.tools/` 存放项目本地 Go SDK。

这些目录都不会提交到 git。
