# AGENTS.zh.md - Lumen v2 AI 助手入口

你正在处理 **Lumen v2**：一个浏览器扩展和小型后端，用来在真实网页上留下上下文 Lens 卡片。先读这份文件。它是 AI 入口和阅读路由，不是当前实现快照。

## 权威来源

- 当前实现、发布状态、验证清单、近期计划：`docs/project-status.md`。
- 临时 session 交接：`CODEX_SESSION_HANDOFF.md`。它可以经常被覆盖；如果它和 `docs/project-status.md` 冲突，以 project status 为准。
- 稳定产品框架：`docs/PROJECT_OVERVIEW.md`。
- 稳定技术架构和取舍理由：`docs/ARCHITECTURE.md`。

不要把旧计划文档里的过期 checklist 当作当前状态。

## 产品中心

Lumen 通过持久、上下文相关的 Lens 卡片，让网页变得像有人来过。用户可以在真实网页上留下玩笑、问题、解释和引用。Companion 是同页用户的显式 opt-in 实时层。Lounge 和 Atlas 是未来生态层，但 v2 的中心仍然是绑定网页的 Lens 卡片。

北极星：

> Lumen exists to make a webpage feel inhabited through cards that persist, not chrome that interrupts.

## 不可违背的原则

1. **UGC first.** 知识可以从参与中涌现，但 UI 不能把 Lumen 包装成知识工具。
2. **娱乐性是底座。** 如果一个功能先像上课，再像“这里有人来过”，就应该重塑或推迟。
3. **卡片是主体。** 不要把浮动文字或默认弹幕做成主体验。
4. **默认单人阅读。** Companion 和 Lounge 都必须显式进入。
5. **阅读模式是用户控制。** 不要因为某条 Lens “重要”就绕过 Quiet / Thinking / Full。
6. **没有默认可见 AI 内容。** AI 未来可以是用户主动调用的草稿助手，但不能是默认公开评论者或解释者。
7. **v2 没有知识图谱 UI。** Atlas 是真实的长期方向，但除非某个功能也能独立服务页面 Lens 体验，否则不要提前塞进 Lumen v2。
8. **没有声望、karma、排行榜。** 保持小群体语气。
9. **默认安静 marker。** 原网页是 artifact；Lumen 是克制的 overlay。
10. **不要优化 Lens 总量。** 成功指标是定性和累积性的。

## 按任务阅读

- 当前状态或下一步：`docs/project-status.md`。
- 产品方向：`docs/PROJECT_OVERVIEW.md`，然后 `docs/product/lens-design.md`。
- 原始中文设想和生态愿景：`docs/Chat.md`。
- 架构或跨模块技术决策：`docs/ARCHITECTURE.md`。
- Lens 富内容和长文本阅读：`docs/product/lens-reading-design.md`。
- 生态、Atlas、学习路径、toy project：`docs/product/ecosystem-roadmap.md`。
- Companion mode：`docs/technical/companion-mode-mvp.md`。
- Persistent Lounge：`docs/product/persistent-lounge-design.md`。
- Anchoring：`docs/technical/lens-anchoring.md` 和 `packages/anchoring/README.md`。
- Server 扩展风险：`docs/technical/server-bottlenecks.md`。
- Extension 实现备注：`apps/extension/README.md`。
- Server API 和本地开发：`apps/server/README.md`。

部署草案目前应视为归档内容，不要把它纳入主项目计划，除非用户要求重新讨论部署。

## 当前技术栈快照

准确状态看 `docs/project-status.md`。高层上：

- Backend：Bun、SQLite、Bun WebSocket server。
- Extension：MV3、Vite、React、TypeScript。
- Anchoring：本地 `@lumen/anchoring` 包，使用 W3C-style selectors 和 fuzzy quote recovery。
- Rendering：CSS Custom Highlight API 渲染 marker，React overlay 渲染卡片和面板。

不要在未阅读架构理由、未获得用户同意的情况下替换核心技术栈。

## 仓库方向

```text
apps/extension/     MV3 浏览器扩展
apps/server/        Bun 后端
packages/schema/    共享类型
packages/anchoring/ anchoring 实现
docs/               产品、架构、技术和状态文档
scripts/            CLI 和共享工具脚本
```

旧 v1 prototype 只能作为废弃参考。不要从里面 import 代码。

## 工作约定

- 除非用户切换语言，否则用中文回复用户。
- 代码和仓库文档默认用英文，除非用户另有要求。
- 优先编辑已有文件，不要轻易创建新文档。
- 除非用户要求，不要创建新文档；文档越多，信号越容易被稀释。
- 如果修改了有中文镜像的英文文档，也同步更新中文镜像。
- 除非用户明确要求，不要 commit。
- Commit message 使用祈使句、现在时，不加 AI co-author tag，除非用户要求。
- 不要回退无关的用户改动。dirty worktree 是正常情况。
- 除非明确要求，代码、文档、commit message 不使用 emoji。

## Extension 工作流

用户常用扩展开发循环是：

```bash
bun run dev:extension
```

然后刷新测试页面。只有改 `manifest.json` 或 service worker 时才需要在 `chrome://extensions` 里重载扩展。不要把完整生产 build 当成默认开发循环推荐。

## 需要保留的历史上下文

- v1 在验证参与之前过早建设了知识基础设施；v2 是刻意收窄。
- 旧文档里可能把 scheduled co-reading 或浮动弹幕写成中心机制。这个框架已经被异步卡片累积、opt-in companion mode、reading modes 取代。
- Atlas 是长期愿景的一部分，但 v2 应先验证 Lens 参与。
- Lens body 是 Markdown。`[[lens:id]]` 和 `[[url:...]]` 引用是一等能力。
- Per-Lens anonymity 是 moderation-aware：UI 可以隐藏作者，但 server 记录真实作者。
- 视觉识别应延展现有的安静 marker、card、popover、几何 bloom 语言，而不是引入全新的动效词汇。
