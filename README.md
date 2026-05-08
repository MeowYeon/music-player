# 阿言

阿言 / Ayan 是一个本机单用户音乐播放器。当前版本通过浏览器前端连接本地 Go 后端，扫描用户指定的音乐目录，把音频元数据写入 SQLite，并在前端提供媒体库、歌曲列表、歌单、我喜欢、最近播放和底部播放器。

## 当前能力

- 管理一个或多个本地音乐目录。
- 手动扫描媒体库，递归导入支持的音频文件。
- 解析基础元数据：标题、艺术家、专辑、格式、大小、修改时间和部分时长。
- 合并展示多媒体库歌曲，并支持基础搜索。
- 通过 Go 后端音频流播放本地文件，支持浏览器 Range 请求。
- 管理普通歌单。
- 使用系统歌单维护 `我喜欢` 和 `最近播放`。
- 在前端维护临时播放队列和播放顺序。

MVP 仍然保持简单：不做账号、多设备同步、桌面壳、歌词、封面、实时文件监听、数据库迁移工具或 sqlc。

## 代码结构

- 后端：`cmd/`、`internal/`
- 前端：`web/`
- 开发服务脚本：`scripts/`
- 项目文档：`docs/`
- 本地配置：`config.yaml`

更多说明：

- [代码结构](./docs/code.md)
- [当前架构](./docs/design/architecture.md)
- [设计文档索引](./docs/design/README.md)
- [版本待办](./docs/todo.md)

## 开发服务

从 Debian WSL 的项目目录运行：

```bash
npm run services:start
```

启动后访问：

- 前端：http://127.0.0.1:5173
- 后端：http://127.0.0.1:8080

查看状态：

```bash
npm run services:status
```

停止服务：

```bash
npm run services:stop
```

服务 pid 和日志保存在 `.run/`，该目录不会提交到 git。

## 常用命令

```bash
npm run build
go test ./...
```

如果当前环境没有系统 Go，可以使用项目本地 Go SDK：

```bash
.tools/go-sdk/go/bin/go test ./...
```
