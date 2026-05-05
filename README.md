# 阿言

本地音乐播放器 MVP。

## 代码结构

- 后端：`cmd/`、`internal/`
- 前端：`web/`
- 启停脚本：`scripts/`
- 说明文档：`docs/`

更多说明：

- [代码结构](./docs/code.md)
- [版本待办](./docs/todo.md)
- [设计文档](./docs/design/README.md)

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
