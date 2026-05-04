# 阿言可用初版 TODO

目标：启动 Go 后端和 Vite 前端后，在界面右侧输入 `/mnt/c/Users/guohp/Music/test`，点击扫描，后端扫描测试目录中的音乐文件并写入 SQLite，前端显示歌曲列表，点击歌曲后通过 `/api/tracks/{id}/stream` 播放。

## 1. 工具和依赖

- [x] 在 Debian WSL 中安装 Go 1.23+。
- [x] 确认 `node` 可用。
- [x] 确认 `npm` 可用。
- [x] 执行 `npm ci` 安装前端依赖。
- [x] 添加 Go 依赖：
  - [x] `github.com/go-chi/chi/v5`
  - [x] `modernc.org/sqlite`
  - [x] `github.com/dhowden/tag`

## 2. 后端可用链路

- [x] `cmd/server/main.go` 读取 `config.yaml`。
- [x] 创建 `data/` 目录。
- [x] 打开 SQLite 数据库。
- [x] 执行 `internal/storage/schema.sql` 初始化表。
- [x] 初始化 storage、scanner、httpapi。
- [x] 使用 `chi` 注册 API。
- [x] 监听 `127.0.0.1:8080`。

## 3. Storage

- [x] 实现 `Store` 类型，封装 `*sql.DB`。
- [x] 实现 library root 创建或复用。
- [x] 实现 scan job 创建、运行中、进度、完成、失败状态更新。
- [x] 实现按 `root_id` 删除 tracks。
- [x] 实现写入 track。
- [x] 实现歌曲列表查询和基础搜索。
- [x] 实现媒体库摘要查询。
- [x] 实现按 track id 查询播放路径。

## 4. Scanner

- [x] `POST /api/scan` 校验目录存在且可读。
- [x] 创建或复用 `library_roots`。
- [x] 创建 `scan_jobs` 后后台执行扫描。
- [x] 递归扫描目录。
- [x] 默认忽略隐藏文件和隐藏目录。
- [x] 支持 `.mp3`、`.flac`、`.m4a`、`.aac`、`.ogg`、`.wav`。
- [x] 使用 `github.com/dhowden/tag` 解析标题、艺术家、专辑。
- [x] 元数据缺失或解析失败时，用文件名作为标题。
- [x] `duration_ms` 第一版 best-effort，无法解析时保存 `0`。
- [x] 单个文件解析失败不让整个任务失败。
- [x] 目录不可读或数据库写入失败时标记任务失败。

## 5. HTTP API

- [x] `GET /api/health`
- [x] `GET /api/library`
- [x] `POST /api/scan`
- [x] `GET /api/scans`
- [x] `GET /api/tracks?q=`
- [x] `GET /api/tracks/{id}/stream`
- [x] stream 接口使用 `http.ServeContent` 支持 Range。

## 6. 前端接入

- [x] 默认扫描路径改为 `/mnt/c/Users/guohp/Music/test`。
- [x] 默认关闭 mock，开发期通过 Vite proxy 请求真实后端。
- [x] 保留 mock 能力，但只在显式设置 `VITE_USE_MOCKS=true` 时启用。
- [x] 扫描中轮询扫描状态。
- [x] 扫描完成后刷新 library 和 tracks。
- [x] 播放继续使用 `getTrackStreamUrl(track.id)`。

## 7. 验证

- [x] `go version`
- [x] `npm ci`
- [x] `npm run build`
- [x] `go test ./...`
- [x] 启动 `go run ./cmd/server`。
- [x] `GET /api/health` 返回 ok。
- [x] `POST /api/scan` with `{ "path": "/mnt/c/Users/guohp/Music/test" }` 返回 scan job。
- [x] 轮询 `GET /api/scans` 直到 completed。
- [x] `GET /api/library` 返回至少 `1` 个目录、`3` 首歌曲。
- [x] `GET /api/tracks` 返回测试目录中的 3 个 mp3。
- [x] `GET /api/tracks/{id}/stream` 返回音频内容，Range 请求返回 `206`。
- [ ] 打开 `http://127.0.0.1:5173` 后可扫描并播放。

## Assumptions

- 第一版只要求本机开发可用，不做生产打包和静态文件嵌入。
- 第一版允许 duration 显示为 `0:00`，播放可用优先。
- 第一版不做封面、歌词、歌单、实时监听、目录删除和数据库迁移。
- 当前 `config.yaml` 保持：
  - `listen_addr: "127.0.0.1:8080"`
  - `database_path: "./data/music.db"`
