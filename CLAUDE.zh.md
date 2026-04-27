# CLAUDE.zh.md —— Lumen v2 给 AI 助手的入门

你正在 **Lumen v2** 上工作——一个为网页提供上下文社交评论的浏览器扩展（重新设计版）。这份文件让你 ~5 分钟跟上节奏。**动手前先读它。**

> 注：英文版 `CLAUDE.md` 是 Claude Code 自动加载的版本。这份是给中文阅读者的对照版本，内容等价。

## 这个项目是什么

Lumen 让一个被邀请的小群体在真实网页上留下好玩的、有上下文的"Lens"卡片。**卡片永久挂在 URL 上，由 handle 署名、有时间戳。几周下来一个页面会累积出一层 Lens**，让它感觉有人来过。当用户**当下**想要陪伴时，可以主动开启"同伴模式"，匹配同时也在读这个页面的其他人；默认交互是往屏幕边缘扔表情，必要时切到一个小聊天层。

**产品假设**：娱乐底座 + UGC 让长尾网页"感觉有人"，知识从这种参与中涌现，而不是反过来作为种子。

## 当前进度

最近一次端到端验证：两个 Chrome 用户在不同窗口同时打开 PG 的 *Do Things that Don't Scale*——实时 presence、Lens 创建、Lens 互引渲染成 chip、卡片打开时的几何轮廓 bloom 全部跑通。

**后端**（`apps/server/`）：骨架完整，邀请制 beta 可上。
- Bun + WS + SQLite 在 `localhost:3000`
- 路由：`POST /api/redeem`、`GET/POST /api/lenses`、`WS /ws`
- per-URL 房间 presence + Lens 广播已验证
- `/admin` 操作台在根路径，给开发/测试用

**扩展**（`apps/extension/`）：P0 大半完成。
- Anchoring 走 `@lumen/anchoring`（TextPosition → TextQuote+context → fuzzy → orphan）；CSS Custom Highlight API，**不**用 `<mark>` wrap
- 阅读模式（安静默认 / 思考 / 火力全开）—— popup 设置，客户端过滤
- 引用：`[[lens:id]]` 和 `[[url:...]]` 解析并在 body 里渲染成 chip / link
- 视觉识别（见下方"视觉识别"段和 `docs/ARCHITECTURE.md` §13）：卡片打开时 12 个轮廓色块；新 lens 到达时 4 个 marker 色块；统一 popover 入场动画 4px slide-up + fade；尊重 `prefers-reduced-motion`
- Orphan 追踪：锚定失败的 Lens 在 InfoPanel 里显示（手动 UX 验证延后——测试 recipe 在 `apps/extension/src/content.tsx`）

**仍未做（Task #6 还在 in_progress）**：
- Composer 里的匿名 toggle（schema 和服务端已经记录 `lens.anonymous`）
- Hide controls（per-tab / per-site）
- LensCard 上的"copy ref"按钮
- Orphan 重新锚定流程
- Composer 里的"插入引用"picker（目前用户手敲 `[[lens:id]]`）
- 同伴模式 —— 剩余最大独立块，规格在 `docs/ARCHITECTURE.md` §7.2
- 隐私政策
- 举报按钮（服务端 stub 即可）

### 从哪开始

最小的剩余 P0 项（每个约半小时，可以打成一个 commit）：

1. **Composer 匿名 toggle** —— checkbox 设置 `body.anonymous`。服务端在 flag 置位时已经把 author 显示为 "Anonymous"。
2. **Hide controls** —— InfoPanel 加 × 按钮隐藏当前 tab；popup 加 checkbox 隐藏当前站点。
3. **LensCard "copy ref" 按钮** —— 把 `[[lens:id]]` 复制到剪贴板，方便用户粘到自己的 Lens body 里。

清完上面这一组之后，开同伴模式作为单独的一大轮——它是剩下最大的功能，前后端都得动。

## 贡献前先按顺序读这些

1. `docs/Chat.md` —— 原始构想（中文），Lumen 所在的生态愿景
2. `docs/PROJECT_OVERVIEW.md`（或 `.zh.md`）—— v2 在收窄什么，为什么
3. `docs/ARCHITECTURE.md`（或 `.zh.md`）—— 每一项技术决定及理由
4. `docs/mvp/lumen-mvp-plan.md`（或 `.zh.md`）—— 5 周搭建 + 4 周浸泡、成功标准、**不做什么**
5. `docs/product/lens-design.md` —— Lens 内容类型和交互回路（沿用 v1；其中把 Lumen 框成"弹幕能量"的措辞已被超越——**Lumen 主形态是卡片，不是飘动文字**）

如果上面没回答你的问题，**先问，别开干**。

## 不可妥协的原则（不经用户允许不要偏离）

1. **UGC > 知识。** Knowledge Lens 是七种类型之一，不是默认。Quick Lens 是默认创建模式。**永远不要把 Lumen 在 UI 文案里框成"知识工具"**——它是社交评论层，知识有时候涌现出来。
2. **娱乐是底座。** 如果一个功能让 Lumen 感觉更像学校或知识图、更不像"有人来过"，**它就是错的形状**。要么改框架要么推迟。
3. **不要可见的 AI 作者内容。** AI 只允许作为用户主动调用的撰写助手（"写得更好玩"）。**永远不要 AI 作为默认可见评论者，永远不要 AI 解释段落，永远不要"AI 给你智能高亮"**。**这是硬线**。理由见 `docs/ARCHITECTURE.md` 里的"kills UGC motivation"。
4. **卡片是主形态，不是飘动 UI。** 飘动弹幕风格的文字滚过页面**打扰阅读**。它推迟到 MVP 后的 opt-in 功能，**永远不是默认**。**任何"会从屏幕上飘过去"的东西都要被严厉质疑**。
5. **阅读默认是单人的；同伴模式是 opt-in。** 不要自动配对用户、不要推送"谁在读这个"通知、不要在用户没点过按钮的情况下显示"X 在读这个"。**默认状态是私人阅读**；社交在场是用户**当下**想要时**按一下按钮**。
6. **阅读模式是用户的"音量"控制。** 安静（默认）几乎不显示；火力全开全显示；思考介于其间。**永远不要覆盖用户的模式**。**永远不要"因为我们觉得这条重要"就忽视模式显示所有 Lens**。
7. **不要知识图谱 UI。** Skill 信号可以悄悄记到 DB（如果有用）。但**用户可见层面零展示**。v1 web demo 的 skill-strip 就是反例——它已经被砍。
8. **不要声誉 / karma / 榜单。** 它们瞬间杀掉小群调性。**不加**。
9. **默认安静的 marker。** dotted underline + 一个小 dot。**永远不要渐变文字、不要重背景、不要大图标**。**原网页是主体**，Lumen 是安静的覆盖层。
10. **成功标准是质性 + 累积式的**，精确定义在 `docs/mvp/lumen-mvp-plan.md` §2。**Lens 总数是反度量**，不要为它优化。

## 视觉识别（已冻结）

产品面向年轻开发者，视觉目标是 **被注视时丰富，未被注视时隐形**。动画和几何点缀只在 Lumen 自己的元素上（卡片、marker、浮层）—— **绝不在文章正文上**。

- **调色**：深紫 `#4a1a7a`（chrome——边框、文字、虚线下划线 marker）· 紫 `#8b5cf6`（约 45% 的 bloom 色块）· 深紫变体 `#7c3aed`（约 20%）· 琥珀 `#f59e0b`（约 35%，live/active 重点色）。
- **形态**：卡片（主、持久）· marker（CSS Custom Highlight API 虚线下划线）· 浮层（orb、info panel、composer、lens card、create button）· bloom 色块。**正文上不许有飘动 UI**。
- **动画语言**：卡片打开时 bloom 色块从卡片轮廓发射（12 个）；WS 收到新 lens 时从 marker 顶边发射（4 个）。所有 popover 共用 4px 上滑 + 淡入入场（180ms）。Bloom 用 `cubic-bezier(0.16, 1, 0.3, 1)`；popover 入场用 `cubic-bezier(0.2, 0.8, 0.2, 1)`。
- **克制规则**：动画只能在 Lumen 元素上，不能在页面内容上。所有 keyframe 动画都被 `@media (prefers-reduced-motion: reduce)` 关闭。Bloom z-index 比 popover 低 1，让色块看起来"从卡片背面冒出来"。
- **可调旋钮**：`apps/extension/src/shapes.tsx`（`SPREAD`、`TOP_N`/`BOTTOM_N`/`SIDE_N`、stagger delay、`pickColor`/`pickOutlined` 概率），`apps/extension/src/styles.css`（`lumen-bloom` / `lumen-appear` 时长和缓动）。

完整理由 + 暂未实现的 B 方案（边框描绘）、C 方案（常态微动）、等宽数字字体——见 `docs/ARCHITECTURE.md` §13。

## 技术栈（v2 已冻结）

| 层 | 选择 |
|---|---|
| 服务端 runtime | Bun |
| WS 服务端 | Bun 内置 (`ws.subscribe` topics) |
| 数据库 | SQLite via `bun:sqlite` |
| 反代 | Caddy 2 |
| 主机 | Hetzner CX22 |
| 备份 | Litestream → R2 |
| 鉴权 | 邀请码 → Paseto v4 bearer token |
| 扩展 | Vite + MV3 + React + TypeScript |
| 扩展 WS 客户端 | partysocket |
| Anchoring | `@lumen/anchoring`（W3C selectors + `approx-string-match`） |
| 高亮渲染 | CSS Custom Highlight API（**不**用 `<mark>` wrap） |

每一项的理由在 `docs/ARCHITECTURE.md` §3 和 §4–§6。**不要换组件不读理由**。

## 仓库结构

```
SStree/                          （目前是 SStree-v2，等手动改名）
├── CLAUDE.md / CLAUDE.zh.md     你在这里
├── docs/                        先读这个目录
├── apps/
│   ├── extension/               MV3 扩展
│   └── server/                  Bun 后端
└── packages/
    ├── schema/                  共享类型（Lens、User、ReadingMode、CompanionEvent 等）
    ├── anchoring/               W3C selectors + `approx-string-match`
    └── lens-ui/                 (P1) 共享 React 组件
```

兄弟目录 `e:/src/SStree-v1/`（手动改名后）保留 v1 prototype。**视作过期的参考**。**不要从里面 import 代码**。v1 里的模式可能是为 v1 的框架选的，未必适用于 v2。

## 工作约定

- **优先编辑现有文件，不要新建。**
- **不要主动创建文档**，除非用户要。当前 doc 集是 canonical 的，扩张会稀释信号。
- **代码和文档里不要 emoji**，除非用户明确要。**emoji 在产品里是允许的**（同伴模式扔表情）；**源码、commit message、文档散文里不要**。
- **commit message**：祈使语气、现在时；不要 AI co-author 标签除非用户要。
- **不确定的时候问**。停下来确认的成本很低；做错形状的功能的成本是整个 MVP 的成败。
- **扩展开发工作流**：保持 `bun run dev:extension` 在跑（Vite + crxjs 自动重打）。每次保存只需 F5 测试 tab，content script 会重新挂载。**只有改 `manifest.json` 或 service worker 时才需要去 `chrome://extensions` 重载扩展本身**。CSS 通过 `?inline` 被打入 JS bundle，所以 CSS 改了也要重打（dev server 自动处理）。**不要把 `bun run build:extension` + 手动重载推荐成默认循环**——比必要的慢。

## 不在 docs 里但很关键的上下文

这些是孵化出 v2 的对话里来的判断 / 背景。它们落在这里是因为它们影响了很多小决定，**不应该被重新推一遍**：

- **v1 prototype 在同一个工作区里存在过 v2 之前**。v1 的失败模式是"在验证有没有人愿意参与之前，过度强调知识基础设施"（向量召唤、7-pillar canonical 节点、skill graph）。v2 是有意识的收窄。
- **v2 文档的早期版本曾从调研里过度外推**。第一版把"定时群体共读 + Niconico 风格的时移飘动弹幕"写成了核心冷启动机制。**用户纠正了这件事**：定时共读对阅读这件事产生尴尬动态，飘动文字打扰页面。**真实模型是异步卡片累积 + opt-in 同伴模式 + 阅读模式**。如果你在 docs 里发现旧模型的措辞，**flag 出来**。
- **用户原始构想（在 `docs/Chat.md`）把 Lumen 框成两个 app 生态的"透镜"那一半（App A = Lumen, App B = Atlas）**。Atlas 是真实的，留给 v3+，**v2 范围之外**。**不要提"为后面的 Atlas 做铺垫"的功能**，除非它在 v2 自己的逻辑里也站得住。
- **首批邀请群体是 ~10–15 个密友 + 项目宣发后过来的对开源感兴趣的年轻人**。群体的部落凝聚力是承重的——按"朋友会互相调侃但有分寸"来设计，不是按"陌生人需要清晰 UX"。
- **Lens body 是 Markdown**。Lens 互引语法是 `[[lens:id]]`；URL 引用是 `[[url:...]]`。原始 Chat.md 把"引用"作为一等公民提出来过（"用户查清楚了一个公式然后在卡片里总结解释"）—— **确保 ref 渲染成卡片预览或链接 chip，不是裸 markdown**。
- **匿名是 moderation-aware 的**。每条 Lens 的 `anonymous` flag 在 UI 上隐藏作者，但服务端记录真实作者。**隐私政策必须明说**。**不要把它推广为"匿名"而不带这个限制**。
- **用户日常用中文**，但**文档和代码用英文**。写文档时按这个匹配；用户切到中文之前，**用中文回他**。
- **中文镜像文档存在**于 `docs/*.zh.md` 和 `CLAUDE.zh.md`。它们是英文版的镜像；**改一份要同步改另一份**。
- **三处对原始架构的偏离，全部在代码 / README 里有记录**：
  - WebSocket 住在 **content script，不在 service worker**（`apps/extension/README.md`）。每个 tab 自己持一条 WS；presence 通过 WS connect/close 检测，**不是**走 ARCHITECTURE.md §5 原本提出的 `chrome.runtime.connect` port。原本 SW-hosted 的设计是长期正确的方向，这处偏离是 MVP 简化、文档里有记录可回溯。
  - Anchoring 是 **~250 行自有实现，不是 vendor 的 hypothesis**（`packages/anchoring/README.md`）。W3C selector 模型和 `approx-string-match`（真正的算法核心）保留了；hypothesis 自己的工具脚手架没要。
  - `Lens.body` 在 schema **顶层**（原本是 `Lens.content.body`）。`LensContent` 作为可选保留类型留着（给将来更复杂的内容用，比如 poll options），目前未用。服务端返回 body 在顶层，扩展也在顶层读，schema 和现实对齐。
- **视觉识别决策的具体出处是用户的一句话**："色块从卡片背景中冒出来"。12 个轮廓色块的设计就是这句话的直接落地。**未来要加更多动画时，优先沿这套语言扩展**（更多触发点、Full 模式下更细微的常态运动），不要引进新的运动语汇。
- **用户的迭代循环是 `bun run dev:extension` + tab F5**，不是整个扩展重载。**不要在没确认的情况下推荐慢工作流**。

## 缺东西时

- 想要一个示例工作流？`docs/mvp/lumen-mvp-plan.md` §3 是按周的 5 周计划。
- 想知道某个库选过没？`docs/ARCHITECTURE.md` §12 是附录。
- 想知道什么在不在范围里？`docs/ARCHITECTURE.md` §10 和 `docs/mvp/lumen-mvp-plan.md` §7 是显式"**不做**"清单。
- 架构对抗的失败模式：`docs/ARCHITECTURE.md` §9。

## 北极星，再说一遍

> **Lumen 存在的目的就是让一个网页感觉"有人"——通过持久存在的卡片，而不是打扰阅读的浮动 chrome**。知识、技能成长、更大的生态都是解决这一个问题之后的下游效应。

如果一个改动**不直接也不间接**服务于这一句话，**推迟**。
