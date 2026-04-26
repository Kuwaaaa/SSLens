# Lumen v2 架构

日期：2026-04-26
状态：v2 架构决策记录

## 1. 这份文档为什么存在

v1 prototype（已作为兄弟目录归档）证明了我们能把 marker 注入真实网页。它**没有**证明产品假设里任何一项：娱乐底座 + UGC 是否能让长尾网页"感觉有人"。

v2 是在小规模邀请制 beta 的前提下重新搭，专门为了验证那个假设。**这份文档记录所有动手前就要拍板的架构决定**，免得后来人（人类或 AI）重新推一遍。

## 2. North Star

v2 MVP 成功的定义——邀请群体经过 ~4 周自由使用之后：

- 第 4 周仍有至少 3 个邀请用户**主动创建** Lens（不只是 reaction）
- 至少有一篇白名单文章累积出多作者 Lens 层，且至少出现一处 Lens 之间互相引用
- 主流主观反馈是某种版本的"我想一直开着这个"

整套架构里所有东西都是为了**让这种累积发生**。不直接服务于这件事的，全部推迟。

## 3. 技术栈一览

| 层 | 选择 | 一句话理由 |
|---|---|---|
| 服务端 runtime | Bun | TS 跑得快，电池都自带，配置少 |
| WebSocket（服务端） | Bun 内置 (`ws.subscribe` topics) | per-URL pub/sub 内置 |
| 数据库 | SQLite via `bun:sqlite` | 一个文件，微秒级延迟，正合这个量级 |
| TLS / 反代 | Caddy 2 | 自动 Let's Encrypt，5 行配置 |
| 主机 | Hetzner CX22 | €4.5/月，2vCPU/4GB/40GB，20TB 流量 |
| 鉴权 | 邀请码 → Paseto v4 bearer token | 不要账号、不要密码 |
| 备份 | Litestream → R2 | SQLite 流式复制 |
| 扩展框架 | Vite + MV3 + React + TypeScript | 沿用 v1 |
| 扩展 WS 客户端 | partysocket | ~3KB 的重连 WS 库，MV3 兼容 |
| Anchoring | vendor `hypothesis/client` 的 anchoring 模块 + `approx-string-match` | 工业级文本锚定，不重写 |
| 高亮渲染 | CSS Custom Highlight API | 不动 DOM，不和 React 打架 |

100 用户预估月成本：**~$8**。

## 4. 后端

### 4.1 进程模型

单 Bun 进程同时服务 HTTP（Lens CRUD、历史拉取、邀请 token 签发）和 WebSocket（presence、Lens 广播、companion 会话事件）。Caddy 在 443 端口反代。systemd 保活。

### 4.2 per-URL 房间

每个连接的客户端任何时候只在一个房间里，房间 key = `room_id = SHA256(canonical_url)`。规范化要做的事：

- 去掉 `utm_*`、`fbclid`、`gclid`、`ref`、`mc_eid` 等已知追踪参数（用 `clear-urls` 的规则列表当 source of truth）
- 去掉 URL fragment（`#section-2`）
- 去掉尾斜杠
- host 转小写

哈希是为了**脱敏 + 定长**，不是为了防碰撞——64 字节 hex 给我们一个稳定的不透明 key，不暴露用户在读什么。

Bun 的 `ws.subscribe(roomId)` / `server.publish(roomId, payload)` 就是 pub/sub 原语。Companion 会话走子频道 `roomId:companion`。**不引入外部 broker。**

### 4.3 持久化

SQLite WAL 模式。初版 schema：

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,           -- ulid
  handle TEXT NOT NULL UNIQUE,
  github_login TEXT,             -- 可选，用作 badge
  invited_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE invite_codes (
  code TEXT PRIMARY KEY,
  issued_by TEXT REFERENCES users(id),
  consumed_by TEXT REFERENCES users(id),
  consumed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE lenses (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,         -- canonical URL 的 SHA256
  url TEXT NOT NULL,             -- canonical URL 本身，用于显示
  author_id TEXT NOT NULL REFERENCES users(id),
  anonymous INTEGER NOT NULL DEFAULT 0,
  type TEXT NOT NULL,            -- quick | fun | question | poll | knowledge | challenge | spoiler
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON 字符串数组
  body TEXT NOT NULL,            -- Markdown，支持 [[lens:id]] / [[url:...]]
  refs TEXT NOT NULL DEFAULT '[]',  -- JSON LensRef 数组（从 body 抽出）
  anchor TEXT NOT NULL,          -- selector 数组的 json 块
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_lenses_room ON lenses(room_id, created_at);
CREATE INDEX idx_lenses_author ON lenses(author_id, created_at);

CREATE TABLE reactions (
  lens_id TEXT NOT NULL REFERENCES lenses(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL,            -- lol | true | aha | nope | confused
  created_at INTEGER NOT NULL,
  PRIMARY KEY (lens_id, user_id, kind)
);

CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  reading_mode TEXT NOT NULL DEFAULT 'quiet',     -- quiet | thinking | full
  per_site_overrides TEXT NOT NULL DEFAULT '{}',  -- P1
  custom_tag_filters TEXT NOT NULL DEFAULT '[]',  -- P1
  updated_at INTEGER NOT NULL
);

-- 同伴模式：故意不跨服务器重启持久化
CREATE TABLE companion_sessions (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE TABLE companion_participants (
  session_id TEXT NOT NULL REFERENCES companion_sessions(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  joined_at INTEGER NOT NULL,
  left_at INTEGER,
  PRIMARY KEY (session_id, user_id)
);
-- 同伴事件（emoji + 聊天）不入库——只在 WebSocket 广播里活，会话结束就消失
```

Litestream 每 ~10s 把 DB 文件复制到 R2/B2。同伴事件流量**故意不在**复制的 DB 里——它们设计上就是短暂的。

### 4.4 鉴权

1. 创始人通过 CLI 生成邀请码：`bun cli/issue-invite.ts --by founder`
2. 用户在扩展里粘贴邀请码；扩展 POST `/api/redeem` 带 `{code, handle}`
3. 服务端创建 `users` 行、标记邀请已消费、返回 Paseto v4 bearer token（`sub=user_id`，`exp=+365d`，Ed25519 签名）
4. 扩展把 token 存进 `chrome.storage.local`
5. 后续所有 API 和 WS 连接都带 token，服务端验签后把 `user_id` 挂到上下文

可选 GitHub OAuth（P1）叠在上面：`users.github_login` 列通过标准 OAuth 流写入。它是**徽章**，不是登录。bearer token 仍是鉴权凭据。

每条 Lens 的 `anonymous: bool` 字段：服务端记录真实作者，前端在置位时显示为 "Anonymous"。**这不是零知识匿名**——moderation 需要知道谁说了什么。隐私政策必须明说。

### 4.5 部署

- Hetzner CX22 单机，Falkenstein/Helsinki 机房
- Caddyfile + systemd unit + Bun 二进制 + SQLite 文件
- Litestream 作为单独 systemd unit
- v2 不上 Docker（一个进程一个文件，Docker 是这个量级上的 overhead）
- 出量后的迁移路径：Fly.io

## 5. 扩展

### 5.1 拓扑

```
┌───────────────────────────────────────────────────┐
│  浏览器                                            │
│                                                   │
│   ┌─────────────────────────────────────────┐    │
│   │ Service Worker（单例）                  │    │
│   │  - 1× WS 连接（partysocket）            │    │
│   │  - 房间成员 + presence 聚合             │    │
│   │  - chrome.alarms 25s 心跳               │    │
│   └─────────────────────────────────────────┘    │
│        ▲ port (chrome.runtime.connect)            │
│        │                                          │
│   ┌────┴───────┬───────────────┬──────────────┐  │
│   │ Tab A      │ Tab B         │ Tab C        │  │
│   │ content.ts │ content.ts    │ content.ts   │  │
│   │ + overlay  │ + overlay     │ + overlay    │  │
│   └────────────┴───────────────┴──────────────┘  │
│                                                   │
└───────────────────────────────────────────────────┘
```

### 5.2 关键不变量

> **`chrome.runtime` port 的生死 = 用户在该页面房间的 presence 状态。**

content script 通过 `port = chrome.runtime.connect()` 接到 SW 的瞬间，SW 把这个用户加入对应 URL 的房间。tab 关闭（或导航走，或被 discard）的瞬间，port 的 `onDisconnect` 立即触发，SW 广播 `leave`。**不需要 `beforeunload` 轮询，不需要心跳超时去检测离开**。

### 5.3 Service Worker 生命周期对策

- WebSocket 活跃流量被 Chrome 116+ 视为 keep-alive 信号，空闲房间靠心跳就能压住 SW 不被挂起
- 25s `chrome.alarms` ping 防止对话间隙导致 SW 被回收
- SW 重启后：`chrome.storage.session` 保留房间成员和 last-seen Lens cursor；content script 通过 `chrome.runtime.onStartup` 在 ~100ms 内自动重连 port

### 5.4 为什么不是 Socket.io / Offscreen / Content Script 起 WS

- **Socket.io**：客户端用了 eval 风格代码、假设 `window` 存在；MV3 launch 起就废了，2026 仍然废
- **Offscreen document**：是给 SW 实在做不了的事用的（DOM 解析、音频、剪贴板）。纯 WebSocket 不属于此列；offscreen 多一跳 IPC 没收益
- **WS 在 content script**：每个 tab 一个连接，用户开 5 个同站 tab 就 5 条 WS。否决

## 6. Anchoring（文本锚定）

### 6.1 多 selector 模型

跟随 W3C Web Annotation Data Model。每个 anchor 存三种 selector，恢复时按顺序尝试：

1. `TextPositionSelector` —— DOM 不变时最快
2. `RangeSelector` —— 子树局部变化时还能用
3. `TextQuoteSelector`（带 prefix/suffix 上下文）—— 抗 DOM 改动最强

三个都失败时进入 `orphan`（孤儿）状态，UI 显示"丢了锚点"的可恢复提示。

### 6.2 实现

把 `hypothesis/client/src/annotator/anchoring/`（~1500 LOC，BSD-2-Clause）vendor 进 `packages/anchoring/vendor/hypothesis/`。在 `packages/anchoring/src/` 写一层薄壳暴露我们实际用的 API。引入 `approx-string-match` 做 fuzzy fallback（Bitap 算法，有界编辑距离）。

为什么 vendor 不 npm install：Hypothesis 的 anchoring 模块**没有单独发包**——它在客户端仓库内部。vendor 给我们 MV3 相关微调的修改权，代价是手动跟 upstream 修 bug。许可（BSD-2）和归属在 vendor 目录里保留。

### 6.3 高亮渲染

**不改 DOM**。用 CSS Custom Highlight API：

```ts
const highlight = new Highlight(...ranges);
CSS.highlights.set(`lumen-${lensId}`, highlight);
```

样式通过注入的 `::highlight(lumen-{id}) { background: ... }` 写。2026 浏览器支持：Chrome 105+、Safari 17.2+、Firefox 140+（Interop 2026 重点项）。

为什么这件事重要：把选中文字 wrap 在 `<mark>` 里会改 DOM，SPA 重 reconcile 会抹掉你的 wrap，自己存的 anchor offset 也会因为 wrap 改了文本而漂移。Custom Highlight API 完全跳过这一类——DOM 没动，高亮纯粹是渲染层的覆盖。

### 6.4 暂不做的 anchoring 特性

- PDF anchoring（要靠 PDF.js 的 text layer；v3 之前不做）
- 跨 iframe 选区
- Shadow DOM 内部
- Canvas/SVG 内容
- 视频时间戳
- 语义 / embedding 锚定（2026 没有可用的开源工业级方案）

## 7. 冷启动：异步累积 + 可选同伴模式 + 阅读模式

早期想到的"制造并发"（定时群体共读 + 时移飘动弹幕）对**阅读这件事是错的形状**。阅读是个人化的、节奏化的、可以中断的；强迫一群人在固定时间点同时打开同一篇文章会产生 Twitch 直播聊天间的动态，跟阅读冲突；满屏飘动的文字主动打扰用户来这里要做的事。

真实的冷启动模型是三层，**形态是卡片，不是飘动 UI**。

### 7.1 异步累积是底座

Lens 卡片是持久的、署名的、带时间戳的。它们永久挂在 URL 上。当一个用户打开一个过去一个月里被前面访客留下了 8 张卡片的页面时，这个页面**已经感觉有人来过**——不是因为现在有人在，而是因为以前有人来过，他们留下了有用或有趣的东西。

这更接近 StackOverflow 的累积模型，而不是 Twitch 的并发模型。**对长尾页面天然友好**：每周只有一个读者的页面，仍然会随时间长出一层。

第一条评论的问题（空页面是死页面）由 **founder + 早期用户在自己关心的页面上手工播种**解决。**没有 AI 播种**（理由见 §10）。

### 7.2 同伴模式（可选实时匹配）

用户在阅读时如果想要陪伴，**点击页面覆盖层上的"搜寻同伴"按钮**。服务端把他们和当前在同一房间（规范化 URL）且按钮也开着的其他用户配对。交互分两层：

- **扔表情**（默认、轻量）：参与者点表情按钮，单个 emoji 短暂飘到页面边缘。最低门槛，无需打字。
- **聊天层**（toggle）：可切换的小型临时聊天面板，输入文字。

**会话是 session 级的**：tab 关闭或按钮关闭即结束。**同伴交流和 Lens 层是独立的**——不会自动晋升为 Lens。如果一段交流值得变成 Lens，**用户自己显式创建**。

按钮永远是 opt-in。**默认状态是独自阅读**。从不点按钮的用户**永远不会出现在任何同伴匹配中**。

服务端：同伴事件走 `roomId:companion` 子频道。事件**不入库**（见 §4.3）。

### 7.3 阅读模式（用户控制的"音量"）

每个用户都有一个当前的"阅读模式"——对自己当下想要多少社交信号的声明。三档预设：

- **安静（默认）**：标记最少；只有 featured + saved + author=friend 的 Lens 会出现。**页面读起来几乎和原版一样**。新用户默认这个，避免第一印象被淹没。
- **思考**：显示 `{question, knowledge, challenge}` 类型；隐藏纯笑话/反应/投票。**深读时用**。
- **火力全开**：显示所有——包括热评、笑话、投票。

模式按用户存，落在 `chrome.storage.local`，同步到服务端 `user_preferences.reading_mode`。**按站点 override 和自定义 tag 过滤集都是 P1**。

**过滤是客户端在服务端返回的完整 Lens 列表上做的**。服务端返回房间所有 Lens；扩展隐藏当前模式排除掉的。这让服务端简单、用户切模式无需重新拉、也能轻易做"被 Quiet 模式隐藏了 3 条"的 badge。

Tag 是底层字段，模式是 tag + type 上的预设。常用 tag 类别在 `packages/schema/src/index.ts` 文档里。

### 7.4 飘动弹幕——推迟、低优先级

Niconico 风格的滚动飘进的 ghost 评论在调研里很有吸引力，但实践中**打扰阅读**。它推迟到 **MVP 后的 opt-in 扩展功能**，不是核心体验。**如果上线，必须放在用户显式开关后面**，且大概率只在"火力全开"模式里出现。**它永远不会成为社交层的默认形式**。

## 8. 身份与鉴权模型

| 层 | 必填？ | 存储 | 显示 |
|---|---|---|---|
| 邀请码 | 加入时必填 | 一次性，标记已消费 | 不显示 |
| Bearer token | 每次请求必带 | `chrome.storage.local` | 不显示 |
| Handle | 必填，半实名 | `users.handle` | 永远显示 |
| GitHub 关联 | 可选（P1） | `users.github_login` | 作为徽章显示 |
| 单条 Lens 的 `anonymous` flag | 可选 | `lenses.anonymous` | 置位时作者显示为 "Anonymous" |

匿名是 **moderation-aware**：服务端仍然知道每条 Lens 是谁写的。隐私政策必须写明这件事。**想要不可关联匿名的人不是 v2 的目标用户。**

## 9. 架构对抗的失败模式

| 失败 | 检测 | 应对 |
|---|---|---|
| 笔记本休眠 / 网络切换 | 应用层 5s 超时 ping、`navigator.onLine`、`chrome.idle.onStateChanged` | 强关 WS + 重连；按 cursor 补传遗漏 Lens |
| Service Worker 被挂起/重启 | `chrome.runtime.onStartup` + port `onDisconnect` | ~100ms 内重新握手；为活跃 tab 重新订阅房间 |
| 服务端 presence 鬼影（客户端静默死亡） | 服务端 45s 心跳超时 | 把用户从房间踢出，广播 leave |
| Anchor 完全找不回（DOM 大改） | 三种 selector 全失败 | Lens 标记为 `orphan`，提示用户重新锚定 |
| 同伴模式没人匹配 | 服务端返回 `match: empty` | UI 显示"现在没别人在，但门留着"，软取消；可选：之后 N 分钟内有人开门时自动通知 |
| 阅读模式隐藏了重要 Lens | 隐藏数量 badge | 提示"被 Quiet 模式隐藏了 N 条"，一键升级模式 |
| Lens 创建竞态 | 服务端是单写者（SQLite） | append-only 不需要冲突解决，last-write-wins 即可 |
| 邀请群里出现坏人 | token 撤销表 | `/admin/revoke <user>` 把对应所有 token 作废 |
| SQLite 文件丢失 | Litestream 流式复制 | RPO ~10s，从 R2 恢复 |

## 10. v2 明确**不**做

MVP 范围内：

- AI 自动 marker / AI 自动解释段落
- 可见的 AI 作者 Lens（AI 只能作为用户主动调用的 draft 助手）
- **可见的飘动弹幕层**（推迟到 MVP 后的 opt-in 扩展功能；卡片才是主形态）
- **定时群体共读活动**（opt-in 同伴模式覆盖了同步用例）
- 知识图谱 / canonical 知识节点系统
- Skill tree UI（可以悄悄记信号到 DB，**不要任何用户可见的界面**）
- 声誉系统 / karma / 公开榜单
- Atlas / 3D 展厅 / Toy Project 工坊
- 浏览器 app shell
- 跨浏览器打包（v2 只支持 Chrome）
- 公开声誉投票 / "merge PR 进 canonical 知识"
- 实时音视频房间
- Mobile

**这上面任何一项出现在这份清单里，就意味着"在 v2 假设被验证之前都不做"。** 4 周浸泡成功了或许给 v3 留出余地，失败了说明前提需要先改，那时候做这些也没意义。

## 11. 文件布局（计划）

```
SStree/                            （目前是 SStree-v2，等手动改名）
├── CLAUDE.md                      给 AI 助手的入门
├── README.md
├── package.json                   workspace 根
├── docs/
│   ├── ARCHITECTURE.md            本文档
│   ├── PROJECT_OVERVIEW.md
│   ├── Chat.md                    原始构想（保留）
│   ├── product/lens-design.md
│   ├── mvp/lumen-mvp-plan.md
│   ├── research/seed-webpages.md
│   └── technical/lens-anchoring.md
├── apps/
│   ├── extension/                 MV3 扩展（Vite + React + TS）
│   └── server/                    Bun 后端
├── packages/
│   ├── schema/                    共享类型（Lens、User 等）
│   ├── anchoring/                 vendor 的 Hypothesis + 薄壳
│   └── lens-ui/                   共享 React 组件（P1 后期）
├── scripts/
│   ├── issue-invite.ts            生成邀请码的 CLI
│   └── canonicalize-url.ts        URL 规范化（扩展也用同一份）
└── infra/
    ├── Caddyfile
    ├── lumen.service              systemd unit
    └── litestream.yml
```

## 12. 库引用附录

| 工具 | 仓库 / 文档 | 最近活跃确认 |
|---|---|---|
| Bun | https://bun.sh | 2026-Q1 |
| partysocket | https://github.com/partykit/partykit/tree/main/packages/partysocket | 2026-Q1 |
| hypothesis/client anchoring | https://github.com/hypothesis/client/tree/main/src/annotator/anchoring | 2026-02 |
| approx-string-match | https://www.npmjs.com/package/approx-string-match | stable |
| Caddy | https://caddyserver.com | 2026-Q1 |
| Litestream | https://litestream.io | 2026-Q1 |
| Paseto | https://paseto.io | spec 稳定 |
| CSS Custom Highlight API（MDN） | https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API | Interop 2026 |
| W3C Web Annotation Data Model | https://www.w3.org/TR/annotation-model/ | 2017 起为 REC |
| ClearURLs 规则（URL 规范化） | https://github.com/ClearURLs/Rules | 活跃 |
