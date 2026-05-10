# PROTOTYPE — 列表展示设计

Question: 项目中涉及到的列表展示（歌曲、歌单、媒体库、播放队列）应该采用什么信息层级和布局方向？

Run: `npm run dev`, open `/?prototype=lists&variant=A`.

Variants:

- A — 密集控制台：歌曲主表 + 右侧状态列表，适合桌面批量操作。
- B — 唱片货架：卡片与横向轨道，适合浏览、发现和更有音乐感的首页/曲库。
- C — 分组看板：按任务和状态分组，适合 v0.6 成熟产品方向里的主动整理体验。

Verdict placeholder: choose a direction, then delete the losing variant code and this note, or fold the chosen design into production components.

Update: A 方案继续推进为“精修密集控制台”。调整重点：

- 歌曲主列变成两行：标题 + 压缩路径，避免长路径撑开表格。
- 艺术家/专辑放进固定宽度信息胶囊，字段过长统一截断。
- 空艺术家/空专辑不再显示突兀空白，改为“未识别艺术家 / 未识别专辑”的虚线弱状态。
- 时长和格式改为右对齐 pill，短字段不会显得飘。
- 右侧媒体库列表路径压缩为末两级目录。
