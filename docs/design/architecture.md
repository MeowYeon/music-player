# 聆听当前架构

这份文档描述当前代码实现，而不是早期 MVP 设计草案。历史设计记录保留在 `docs/design/` 下，当前实现以本文件和代码为准。

## 项目目标

聆听是一个本地音乐播放器。当前实现已经打通这样的基础闭环：

1. 用户在浏览器前端添加本地音乐目录，形成媒体库。
2. Go 后端校验目录并记录到 SQLite。
3. 用户触发媒体库扫描，后端递归遍历目录，默认忽略隐藏文件和隐藏目录。
4. 后端解析音频元数据，将全局音乐条目写入 `music`，并用 `library_music` 记录媒体库与音乐的关系。
5. 前端展示多媒体库合并后的歌曲库、媒体库状态、普通歌单、我喜欢和最近播放。
6. 用户点击歌曲后，前端通过 HTML5 Audio 播放 Go 后端提供的音频流。

v0.5 已结束 MVP 阶段。v0.6 开始，产品方向转向成熟、长期可用的本地音乐产品。当前后端仍以本机单用户为基础；后续迁移 Electron 或 Wails 时，优先复用同一套 HTTP API、扫描逻辑、SQLite 数据模型和前端页面。

## 技术栈

- 后端：Go
- 路由：`github.com/go-chi/chi/v5`
- 数据库：SQLite
- SQLite 驱动：`modernc.org/sqlite`
- 数据访问：`database/sql` 手写 SQL
- 元数据解析：`github.com/dhowden/tag`
- 配置：只读 `config.yaml`
- 日志：`log/slog`
- 前端：Vite + React + TypeScript
- API 状态：TanStack Query
- 图标：`lucide-react`
- 播放状态：React 本地状态
- 样式：普通 CSS
- 播放：HTML5 `<audio>`

## 整体架构

```text
浏览器前端
  -> 调用 Go HTTP API
  -> 查询 SQLite 媒体库、歌曲、歌单状态
  -> 播放 /api/tracks/{id}/stream

Go 后端
  -> 读取 config.yaml
  -> 初始化 SQLite schema 和系统歌单
  -> 管理 libraries、scan_tasks、music、library_music
  -> 管理 playlists、playlist_music
  -> 扫描本地目录并解析元数据
  -> 提供 JSON API 和音频流
```

开发期后端监听 `127.0.0.1:8080`，前端 Vite dev server 监听 `127.0.0.1:5173`，并代理 `/api` 到 Go 后端。生产打包和静态文件嵌入暂未实现。

## 后端模块

- `cmd/server`
  - 应用启动入口。
  - 读取 `config.yaml`。
  - 初始化日志、SQLite、扫描服务和 HTTP 路由。
  - 监听配置中的本机地址，并处理 SIGINT/SIGTERM 优雅退出。

- `internal/config`
  - 读取 YAML 配置。
  - 当前配置只包含监听地址和数据库路径。

- `internal/storage`
  - 打开 SQLite，并执行内嵌 schema。
  - 初始化系统歌单 `我喜欢` 和 `最近播放`。
  - 管理媒体库、扫描任务、音乐、媒体库音乐关系、普通歌单和系统歌单。
  - 删除媒体库时，只删除索引关系和不再被任何媒体库引用的 music，不删除本地音频文件。

- `internal/scanner`
  - 根据媒体库 ID 启动后台扫描。
  - 校验目录存在、可读且是目录。
  - 递归扫描支持的音频格式。
  - 默认忽略隐藏文件和隐藏目录。
  - 根据文件数量、最新修改时间和未知时长数量判断是否可跳过重扫。
  - 扫描完成后替换该媒体库的音乐关系。

- `internal/metadata`
  - 解析 title、artist、album 和 duration。
  - 元数据缺失或解析失败时，以文件名作为标题 fallback。

- `internal/httpapi`
  - 提供 REST API。
  - 返回 JSON 响应。
  - 通过 `http.ServeContent` 提供音频流，并支持 Range。

## 前端模块

前端工程集中在 `web/`：

- `web/src/main.tsx`
  - React 入口。

- `web/src/App.tsx`
  - 主界面、导航、媒体库页、歌曲页、歌单页、我喜欢、最近播放和底部播放器。
  - 维护播放状态、播放队列、播放顺序、音量、当前歌曲和临时 UI 状态。
  - 使用 `localStorage` 记住音量、播放模式、队列和当前歌曲，但不自动续播。
  - 使用 TanStack Query 轮询媒体库、歌曲、歌单和活跃扫描状态。

- `web/src/api.ts`
  - 前端 API client 和类型定义。
  - 支持 `VITE_USE_MOCKS=true` 时使用 mock 数据。
  - 默认请求真实后端。

- `web/src/App.css`
  - 当前页面样式。

## 数据库设计

当前 schema 位于 `internal/storage/schema.sql`。服务启动时会执行 `CREATE TABLE IF NOT EXISTS`。项目目前还没有数据库迁移工具。

### `libraries`

保存用户添加的音乐目录。

```text
id
path
created_at
updated_at
```

`path` 唯一。重复添加同一路径会复用媒体库并更新 `updated_at`。

### `scan_tasks`

保存每个媒体库的一条扫描状态。

```text
id
library_id
status
total_files
scanned_files
message
completed_at
```

`library_id` 唯一。`status` 可为 `idle`、`waiting`、`running`、`completed`、`failed`。

### `music`

保存全局唯一的音乐文件。

```text
id
path
title
artist
album
duration_ms
format
size_bytes
mtime_unix
created_at
updated_at
```

`path` 是全局唯一键。同一个文件如果被多个媒体库引用，只保留一个 music 记录。

### `library_music`

保存媒体库和音乐的多对多关系。

```text
library_id
music_id
created_at
```

重扫某个媒体库时，只替换该媒体库下的关系，不直接影响其他媒体库。删除媒体库后，会清理不再被任何媒体库引用的 music。

### `playlists`

保存普通歌单和系统歌单。

```text
id
name
type
created_at
updated_at
```

`type` 可为 `normal`、`liked`、`recent`。系统歌单 `liked` 和 `recent` 各自全局唯一，由服务启动时确保存在。普通歌单可创建、重命名和删除，系统歌单不可通过普通歌单接口修改。

### `playlist_music`

保存歌单和音乐的关系。

```text
playlist_id
music_id
added_at
last_played_at
```

普通歌单使用 `added_at` 排序。`最近播放` 使用 `last_played_at` 排序，记录播放时更新。

## API 设计

### 健康检查和摘要

- `GET /api/health`
  - 返回服务健康状态。

- `GET /api/library`
  - 返回媒体库数量、歌曲数量和最近扫描状态。

### 媒体库和扫描

- `GET /api/libraries`
  - 返回媒体库列表，每项包含音乐数量和扫描状态。

- `POST /api/libraries`
  - 请求体：`{ "path": "/home/ghp/Music" }`
  - 校验目录，创建或复用媒体库。
  - 只创建媒体库，不隐式扫描；前端当前会在创建成功后主动调用扫描接口。

- `DELETE /api/libraries/{id}`
  - 删除媒体库索引、扫描状态和不再被其他媒体库引用的 music。
  - 不删除本地音乐文件。

- `POST /api/libraries/{id}/scan`
  - 为指定媒体库启动后台扫描。
  - 若该媒体库已有扫描在运行，返回冲突错误。

- `GET /api/scan-tasks/active`
  - 返回 `waiting` 和 `running` 状态的扫描任务，用于前端高频轮询。

### 歌曲和播放

- `GET /api/tracks?q=`
  - 返回全局歌曲列表，支持按标题、艺术家、专辑基础搜索。
  - 每首歌曲包含 `liked` 字段。

- `GET /api/tracks/{id}/stream`
  - 根据 music id 查询本地文件路径。
  - 返回音频流，支持 HTTP Range。

### 歌单和系统列表

- `GET /api/playlists`
  - 返回普通歌单，不返回系统歌单。

- `POST /api/playlists`
  - 创建普通歌单。

- `PATCH /api/playlists/{id}`
  - 重命名普通歌单。

- `DELETE /api/playlists/{id}`
  - 删除普通歌单。

- `GET /api/playlists/{id}/tracks`
  - 返回普通歌单歌曲。

- `POST /api/playlists/{id}/tracks`
  - 请求体：`{ "trackId": 1 }`
  - 将歌曲加入普通歌单。

- `DELETE /api/playlists/{id}/tracks/{trackId}`
  - 将歌曲从普通歌单移除。

- `GET /api/playlists/liked/tracks`
  - 返回系统歌单 `我喜欢` 的歌曲。

- `POST /api/tracks/{id}/like`
  - 将歌曲加入 `我喜欢`。

- `DELETE /api/tracks/{id}/like`
  - 将歌曲移出 `我喜欢`。

- `GET /api/playlists/recent/tracks`
  - 返回系统歌单 `最近播放` 的歌曲。

- `POST /api/tracks/{id}/recent-play`
  - 记录一次最近播放。

- `DELETE /api/playlists/recent/tracks`
  - 清空系统歌单 `最近播放`。
  - 只删除最近播放关系，不删除本地音乐文件，不影响普通歌单和 `我喜欢`。

## 主要流程

### 添加并扫描媒体库

```text
用户输入目录
  -> POST /api/libraries
  -> 后端校验目录存在且可读
  -> 创建或复用 libraries
  -> 确保该媒体库有 scan_tasks 记录
  -> 前端主动 POST /api/libraries/{id}/scan
  -> scan_tasks 进入 waiting
  -> 后台扫描收集音频文件
  -> scan_tasks 进入 running 并更新进度
  -> metadata 解析音频标签
  -> music 按 path upsert
  -> library_music 替换该媒体库关系
  -> scan_tasks 进入 completed 或 failed
  -> 前端刷新媒体库摘要、媒体库列表和歌曲列表
```

如果同一媒体库上次已成功扫描，且文件数量、最新修改时间和未知时长数据都未变化，扫描会直接完成并返回：

```text
媒体库已是最新，无需重新导入
```

### 多媒体库关系

```text
扫描 /home/ghp/Music
  -> 写入 library A
  -> upsert music
  -> 写入 library_music(A, music)

扫描 /mnt/d/Audio
  -> 写入 library B
  -> upsert music
  -> 写入 library_music(B, music)

歌曲页
  -> 直接从 music 合并展示全局歌曲
```

### 播放歌曲

```text
用户点击歌曲
  -> 前端设置当前歌曲和 audio src
  -> GET /api/tracks/{id}/stream
  -> 后端根据 id 查询 music.path
  -> 打开本地文件
  -> http.ServeContent 返回音频流
  -> 浏览器 audio 播放
  -> 前端在播放时 POST /api/tracks/{id}/recent-play
```

前端不直接访问本地文件路径，播放时只使用 track id。

### 歌单和系统歌单

```text
普通歌单
  -> playlists(type = normal)
  -> playlist_music 按 added_at 关联歌曲

我喜欢
  -> playlists(type = liked)
  -> POST/DELETE /api/tracks/{id}/like 维护关系

最近播放
  -> playlists(type = recent)
  -> POST /api/tracks/{id}/recent-play 更新 last_played_at
```

## 配置文件

`config.yaml`：

```yaml
listen_addr: "127.0.0.1:8080"
database_path: "./data/music.db"
```

配置文件不存在时，服务启动失败并提示创建。当前未提供环境变量覆盖。

## 支持格式

当前扫描支持这些扩展名：

- `mp3`
- `flac`
- `m4a`
- `aac`
- `ogg`
- `wav`

## 测试建议

后端：

- `go test ./...`
- 媒体库创建、删除和重复创建。
- 扫描目录路径校验。
- 忽略隐藏文件和隐藏目录。
- 多媒体库扫描累加。
- 重扫单个媒体库只替换该媒体库关系。
- 删除媒体库后清理 orphan music。
- 普通歌单增删改查。
- 我喜欢和最近播放系统歌单。
- 音频流 Range。

前端：

- `npm run build`
- 后端不可用状态。
- 添加媒体库后自动触发扫描。
- 扫描中高频刷新进度，完成后刷新歌曲。
- 歌曲搜索、播放、暂停、切歌和音量。
- 普通歌单创建、重命名、删除、添加歌曲。
- 我喜欢和最近播放页面。
