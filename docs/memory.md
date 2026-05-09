# 项目记忆说明

这份文档说明聆听项目如何管理“长期记忆”。这里的记忆不是运行时数据库，也不是模型内部记忆，而是给人类协作者和 GPT/agent 快速理解项目用的稳定上下文。

简单说：

- `AGENTS.md` 负责“怎么在这个项目里工作”。
- `docs/memory.md` 负责“这个项目的上下文怎么读”。

`AGENTS.md` 偏向简短的执行入口；`memory.md` 用来解释文档之间的关系。

## 记忆层级

### 1. 入口规则：`AGENTS.md`

`AGENTS.md` 是自动化协作者进入项目时最先读取的执行规则。

它包含稳定、简短、和执行环境直接相关的信息：

- 项目工作环境
- 产品当前名称
- 主要技术栈
- 关键目录
- 开发服务命令
- 当前阶段说明

长设计、长期计划、版本流水账和实现细节放在 `docs/` 下。

### 2. 文档索引：`docs/README.md`

`docs/README.md` 是项目文档入口。

它负责告诉读者：

- 当前阅读入口
- 每类文档的职责是什么
- 哪些文档是事实源
- 哪些文档只是历史参考

### 3. 工程事实：`docs/engineering.md`

`docs/engineering.md` 是代码导览。

它描述当前代码事实：

- 顶层目录结构
- 后端模块入口
- 前端模块入口
- 核心数据流
- 常用开发命令

产品愿景和版本计划放在设计或计划文档里。

### 4. 架构事实：`docs/design/architecture.md`

`docs/design/architecture.md` 是系统架构事实源。

它描述当前实现如何工作，包括：

- 后端架构
- 前端架构
- 数据库模型
- API 设计
- 扫描和播放链路

当代码行为发生结构性变化时，这里用于同步系统架构说明。

### 5. 设计事实：`docs/design/`

`docs/design/` 有必要保留，但职责要窄。

它保存产品、架构、界面和版本设计相关文档。工程导览、协作入口和历史记录分别放在 `engineering.md`、`AGENTS.md` 和 `history.md`。

其中：

- `README.md` 是设计文档索引。
- `architecture.md` 是当前系统架构事实源。
- `ui.md` 是早期界面基线，v0.6 重构后需要更新或替换。
- 带版本号的文档记录阶段设计和取舍。
- `v0.6-product-direction.md` 记录当前产品从 MVP 进入成熟产品阶段的方向。

### 6. 历史记录：`docs/history.md`

`docs/history.md` 保留早期版本的完成情况、历史待办和验收记录。当前计划可以放在更明确的文档里。

可选文件名示例：

- `docs/roadmap.md`
- `docs/plans/v0.6-page-rebuild.md`
- `docs/decisions/ADR-0001-*.md`

## 推荐给 GPT/agent 的阅读路径

处理一般代码任务时：

1. 读 `AGENTS.md`
2. 读 `docs/memory.md`
3. 读 `docs/engineering.md`
4. 按需读 `docs/design/architecture.md`

处理产品或界面任务时：

1. 读 `AGENTS.md`
2. 读 `docs/memory.md`
3. 读 `docs/design/README.md`
4. 读 `docs/design/v0.6-product-direction.md`
5. 按需读具体版本设计文档

处理历史追溯时：

1. 读 `docs/history.md`
2. 再读对应 `docs/design/v*.md`

## 当前阶段记忆

截至 v0.6 起点，项目状态是：

- 产品名：聆听
- v0.5：MVP 阶段正式结束
- v0.6：进入成熟产品方向
- 最近讨论方向：高级无右栏版主界面
- 后端：仍保留 Go + SQLite + 本地扫描 + 音频流基础
- 前端：仍是 Vite + React + TypeScript，但页面结构准备重构
