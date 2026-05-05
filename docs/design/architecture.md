# 阿言音乐播放器 MVP 架构设计

## 项目目标

阿言第一版要完成一个最小可用的本地音乐播放器闭环：

1. 用户在浏览器前端输入本地音乐目录。
2. Go 后端递归扫描目录，默认忽略隐藏文件。
3. 后端解析音乐元数据并写入 SQLite。
4. 前端展示多目录合并后的歌曲库。
5. 用户点击歌曲后，通过 HTML5 Audio 播放 Go 后端提供的音频流。

MVP 面向本机单用户，不做账号、权限、多设备访问和桌面壳。后续迁移 Electron 或 Wails 时，优先复用同一套 HTTP API、扫描逻辑和前端页面。

## MVP 技术栈

- 后端：Go
- 路由：`chi`
- 数据库：SQLite
- SQLite 驱动：`modernc.org/sqlite`
- 数据访问：`database/sql` 手写 SQL
- 元数据解析：`github.com/dhowden/tag`
- 配置：只读 `config.yaml`
- 日志：`log/slog`
- 前端：Vite + React + TypeScript
- API 状态：TanStack Query
- 播放状态：React 本地状态
- 样式：普通 CSS
- 播放：HTML5 `<audio>`

## 整体架构

```text
浏览器前端
  -> 调用 Go HTTP API
  -> 查询 SQLite 媒体库
  -> 播放 /api/tracks/{id}/stream

Go 后端
  -> 管理音乐目录 library_roots
  -> 管理扫描任务 scan_jobs
  -> 扫描本地目录
  -> 解析音频元数据
  -> 写入 tracks
  -> 提供音频流
```

后端只监听本机地址，例如 `127.0.0.1:8080`。前端开发期使用 Vite dev server，并代理 API 到 Go 后端；生产期可以由 Go 后端直接服务前端静态文件。

## 后端模块

- `cmd/server`
  - 应用启动入口。
  - 读取 `config.yaml`。
  - 初始化日志、SQLite、HTTP 路由和扫描服务。

- `internal/config`
  - 只负责读取配置文件。
  - MVP 不做环境变量覆盖和复杂默认配置。

- `internal/storage`
  - 初始化 SQLite 表。
  - 保存和查询目录、歌曲、扫描任务。
  - 提供播放接口需要的 track path 查询。

- `internal/scanner`
  - 根据扫描任务递归遍历目录。
  - 默认忽略隐藏文件和隐藏目录。
  - 过滤支持的音频格式。
  - 扫描某个目录时，只替换该目录对应 root 下的 tracks。

- `internal/metadata`
  - 解析 title、artist、album、duration 等基础元数据。
  - 元数据缺失或解析失败时，以文件名作为标题 fallback。

- `internal/httpapi`
  - 提供 REST API。
  - 返回 JSON 响应。
  - 提供音频流接口，并使用 `http.ServeContent` 支持 Range。

## 前端模块

MVP 前端保持轻量结构：

- `web/src/main.tsx`
  - React 入口。

- `web/src/App.tsx`
  - 主界面布局。
  - 歌曲列表、扫描任务面板、底部播放器。

- `web/src/api.ts`
  - 封装后端 API 请求。
  - 提供 TanStack Query 使用的请求函数。

- `web/src/App.css`
  - MVP 页面样式。

## 数据库设计

MVP 使用三张核心表。

### `library_roots`

保存已扫描或可重扫的音乐目录。

```text
id
path
created_at
last_scanned_at
```

### `tracks`

保存扫描入库的歌曲。

```text
id
root_id
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

`root_id` 关联 `library_roots.id`。重新扫描某个目录时，只删除并重建该 `root_id` 下的 tracks，不影响其他目录。

### `scan_jobs`

保存扫描任务历史和当前进度。

```text
id
root_id
path
status
total_files
scanned_files
error_message
started_at
finished_at
```

`status` MVP 可使用 `waiting`、`running`、`completed`、`failed`。

## API 设计

- `GET /api/health`
  - 返回服务健康状态。

- `GET /api/library`
  - 返回媒体库摘要，例如目录数量、歌曲数量、最近扫描状态。

- `POST /api/scan`
  - 请求体：`{ "path": "/home/ghp/Music" }`
  - 校验目录，创建或复用 `library_roots`，创建扫描任务并后台执行。

- `GET /api/scans`
  - 返回当前扫描任务和最近扫描任务列表。

- `GET /api/tracks`
  - 返回歌曲列表。
  - MVP 支持基础搜索参数 `q`。

- `GET /api/tracks/{id}/stream`
  - 根据 track id 查询本地文件路径。
  - 返回音频流，支持 HTTP Range。

## 主要流程

### 扫描目录

```text
用户输入目录
  -> 点击开始扫描
  -> POST /api/scan
  -> 后端校验目录存在且可读
  -> 若目录不存在则写入 library_roots
  -> 创建 scan_jobs
  -> 后台递归扫描，忽略隐藏文件
  -> 解析支持格式
  -> 替换该 root_id 下 tracks
  -> 更新扫描进度
  -> 前端轮询扫描状态
  -> 完成后刷新歌曲列表和媒体库摘要
```

MVP 支持格式：

- `mp3`
- `flac`
- `m4a`
- `aac`
- `ogg`
- `wav`

### 多目录媒体库

```text
扫描 /home/ghp/Music
  -> 写入 root A 的 tracks

扫描 /mnt/d/Audio
  -> 写入 root B 的 tracks

前端歌曲列表
  -> 合并展示 root A + root B 的 tracks
```

最近任务表示不同目录、不同时间点的扫描记录。

### 播放歌曲

```text
用户点击歌曲
  -> 前端设置当前歌曲
  -> audio.src = /api/tracks/{id}/stream
  -> 后端根据 id 查询 tracks.path
  -> 打开本地文件
  -> http.ServeContent 返回音频流
  -> 浏览器播放
```

前端不直接访问本地文件路径，播放时只使用 track id。

## 配置文件

`config.yaml`：

```yaml
listen_addr: "127.0.0.1:8080"
database_path: "./data/music.db"
```

配置文件不存在时，服务启动失败并提示创建。MVP 不做环境变量覆盖。

## 测试计划

后端测试：

- 读取配置。
- 初始化 SQLite 表。
- 扫描目录路径校验。
- 递归扫描。
- 忽略隐藏文件和隐藏目录。
- 过滤支持音频格式。
- 多目录扫描累加。
- 重扫单个目录只替换该目录 tracks。
- 查询歌曲列表。
- 音频流支持 Range。

前端测试：

- 首屏布局。
- 输入目录并开始扫描。
- 当前扫描进度展示。
- 最近任务列表展示。
- 歌曲表格展示。
- 搜索歌曲。
- 点击歌曲后底部播放器更新。

## MVP 暂不包含的能力

- goose 数据库迁移。
- sqlc 查询生成。
- 封面。
- 歌词。
- 歌单。
- 专辑页。
- 艺术家页。
- 实时文件监听。
- 桌面目录选择器。
- 音频转码。
- 账号系统和局域网访问。

## v0.3 架构补充

v0.3 将媒体库管理、扫描状态和音乐详情拆得更清楚。旧的 `library_roots`、`tracks`、`scan_jobs` 模型会演进为 `libraries`、`scan_tasks`、`music`、`library_music`。

### 数据模型方向

```text
libraries
  -> scan_tasks
  -> library_music
       -> music
```

核心规则：

- 媒体库和扫描任务分表，但一对一。
- 扫描任务只保存最近一次扫描状态，不再作为历史任务列表。
- 音乐详情使用 `music` 全局保存，并以 `path` 作为唯一判断。
- 媒体库包含哪些音乐由 `library_music` 表达。
- 删除媒体库时删除关系、清理 orphan music、删除扫描任务和媒体库，但不删除本地文件。

详细表结构见 [v0.3 数据库设计](./v0.3-database.md)。

### 创建与扫描

创建媒体库和触发扫描解耦：

```text
POST /api/libraries
  -> 只创建或复用媒体库

POST /api/libraries/{id}/scan
  -> 对指定媒体库触发扫描
```

前端创建媒体库成功后，可以主动触发第一次扫描。后端创建媒体库接口本身不隐式扫描。

### 读取与刷新

常规读取可以组合返回媒体库和最近扫描摘要，便于媒体库 item 展示：

```text
GET /api/libraries
```

活跃扫描进度使用轻量接口高频刷新，避免媒体库很多时反复刷新完整列表：

```text
GET /api/scan-tasks/active
```

音乐列表低频刷新，扫描完成后立即刷新：

```text
GET /api/tracks
```

### UI 方向

v0.3 不再复用右侧扫描面板。侧边栏只有 `歌曲` 和 `媒体库` 两个一级入口。媒体库页负责添加媒体库、扫描或再次扫描、删除媒体库；歌曲页负责搜索、展示和播放全部歌曲。

详细界面说明见 [v0.3 UI 设计](./v0.3-ui.md)。
