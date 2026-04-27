# Lumen v2 MVP 计划

日期：2026-04-26
状态：替代 v1 计划。v1 已作为兄弟目录归档。

## 1. MVP 命题

v2 MVP 不是一份功能清单。它是**一个针对 ~10–15 个邀请用户的 4 周浸泡实验**，目的是搞清楚：异步累积的 Lens 卡片层到底能不能让一个页面感觉"有人"？opt-in 的同伴模式是不是"我现在想要陪伴"这件事的好形态？

**搭建期里每一行代码、每一份文档、每一个决定都要问**：这件事服务于让那 4 周浸泡有意义吗？不服务就推迟。

## 2. 北极星成功条件

```
设置：    ~10–15 个邀请用户；扩展装好；邀请码已兑换；
         Hetzner 上 Bun + Caddy + SQLite 跑起来；
         1–3 篇文章在 URL 白名单里，由创始人 + 1–2 个密合作者
         手工播种 30–50 张卡片（无 AI 起草）。
周期：    4 周自由使用。无定时活动。
观察：    用户主动创建 Lens（不只是 reaction）、回访、阅读模式
         使用、同伴模式使用、用户实际留下的卡片内容。

MVP 成功的判定，到第 4 周末：

  - 至少 3 个邀请用户仍在主动创建 Lens（不只是 reaction）
  - 至少一个白名单页面累积出多作者层、≥10 张卡片、
    至少一处 Lens 互引
  - 主流主观反馈是某种版本的"我想一直开着这个"
  - 加分项：至少一个用户的同伴模式使用超过表情互挥

MVP 失败的判定：第 1 周后创建归零、Lens 间引用从未出现、
反馈被"标记挡阅读"或"我不知道这里能干嘛"主导。
```

成功标准是**质性的、累积式的**。10 人量级的数值参与度指标没有意义；**几周下来的主观体验才有意义**。

## 3. 阶段（5 周倒计时到可浸泡）

假设一名搭建者全职工作。需要弹性调整。

### 第 1 周 —— 后端骨架 + 扩展手术

**后端**（apps/server）：

- Bun 项目初始化、TS 配置、Caddyfile、systemd unit、dev compose
- ARCHITECTURE.md §4.3 的 SQLite schema 跑起来
- HTTP 路由：
  - `POST /api/redeem` —— 邀请码 → bearer token
  - `GET /api/lenses?room=<hash>` —— 取一个房间的所有 Lens
  - `POST /api/lenses` —— 创建 Lens（需鉴权）
  - `POST /api/reactions` —— 添加 reaction
  - `GET /api/preferences` / `PATCH /api/preferences` —— 阅读模式等
- WebSocket 路由：订阅 `room=<hash>`，接收 `lens_created` / `presence_join` / `presence_leave` 事件
- 生成邀请码的 CLI
- 部署到 Hetzner CX22（Caddy + Litestream）

**扩展**（apps/extension）：

- 拆 v1：移除硬编码种子 Lens、移除 composer 里的 AI 按钮、移除渐变文字 marker、移除 web demo 的 skill-strip UI（web demo 大概率直接删掉）
- Service worker：partysocket WS 连接，tab URL 变化时切换房间
- Content script：开 port 接 SW，请求当前房间，接收广播事件
- 创建 UI：选中文本 → "Create Lens" → 选类型（第 1 周只做 Quick / Question）→ 发布
- Marker 渲染：dotted underline，无渐变

完成的标志：浏览器 A 创建一条 Lens，~1s 内浏览器 B 在同一 URL 看到。

### 第 2 周 —— Anchoring + Presence + 阅读模式

**Anchoring**：

- 建 `packages/anchoring` workspace
- 在 `packages/anchoring/src/` 实现 W3C TextPosition / TextQuote selector（~250 行自有代码）
- 引入 `approx-string-match` 依赖
- 薄壳层：`createAnchor(range)`、`restoreAnchor(selectorJson, root)` 返回 ranges 或 null
- 在扩展里用：创建 Lens 时序列化，页面载入时恢复
- 用 CSS Custom Highlight API 渲染（**不**用 `<mark>` wrap）
- Orphan 状态：三种 selector 全失败时，UI 显示"丢了锚点"

**Presence**：

- SW 聚合每个房间的 presence；join/leave 时广播 `presence_state`
- Content script 覆盖层：页面顶部小头像列表（"3 here"），**只在 ≥1 其他用户在场时显示**
- 服务端 45s 心跳超时清掉鬼影

**阅读模式**：

- 三档预设：安静（默认）/ 思考 / 火力全开
- 用户级设置存 `chrome.storage.local`，同步到 `user_preferences` 表
- **客户端在完整 Lens 列表上做过滤**；隐藏数量 badge（"被 Quiet 模式隐藏了 3 条"）
- 模式选择器在扩展 popup 或页面覆盖层角落

完成的标志：打开一个其他用户在的页面能看到对方头像；切换阅读模式即时改变哪些 Lens 渲染；同一页面 5 张种子 Lens，安静模式几乎不显示，火力全开全显示。

### 第 3 周 —— Tag + 引用 + 同伴模式

**Tag**：

- Lens 创建时 free-form tag 输入；从一份策展过的常用列表里给建议
- Tag 以 JSON 数组存在 Lens 上
- 阅读模式预设本质上是 tag/type 过滤器

**引用**：

- 从 Lens body Markdown 里解析 `[[lens:id]]` 和 `[[url:...]]`
- 行内渲染：`[[lens:id]]` 显示一张 hover 预览卡片；`[[url:...]]` 是带小 chip 的普通链接
- 写入时抽出 ref，存在 `lenses.refs` 里方便查询（"哪些 Lens 引用了这条"）

**同伴模式**：

- 页面覆盖层上的"搜寻同伴"按钮（**永远 opt-in，默认关**）
- 服务端把当前房间也开着按钮的其他用户配对；广播 `companion_session_start`
- 表情扔 UI：页面边缘的小浮动层；参与者点表情按钮发送
- 聊天层：可切换的小型临时面板；**消息不入库**
- tab 关闭或按钮关闭即结束
- 没匹配到时的状态："现在没别人在，但门留着"

完成的标志：两个浏览器在同一白名单页面能通过同伴模式找到对方、互发表情、切到聊天。

### 第 4 周 —— 浸泡前准备：内容 + 身份打磨 + 自用

**内容播种**：

- 选 1–3 篇文章作为初始白名单（推荐 Karpathy *A Recipe for Training Neural Networks* + PG *Do Things that Don't Scale* + 一篇科普/娱乐性文章 TBD）
- 创始人 + 1–2 个合作者**亲手在这些文章上写 30–50 条 Lens**，全部用真实 handle 署名。**打 tag**。**至少 3 处 Lens 互引**。**不用 AI 起草**。**这件事决定后续所有调性，值得多花时间**。
- 把 `created_at` 错开撒在过去几周，让这层感觉是累积出来的，不是一次性上传的

**身份**：

- 扩展首次启动时的 handle 选择 UI
- 撰写 UI 里的匿名 toggle
-（Stretch，P1）GitHub OAuth 流程做徽章——进度紧时推迟

**自用浸泡**：

- 创始人 + 1–2 个密合作者做 3 天浸泡
- 锤打 ARCHITECTURE.md §9 的失败模式
- 修打到的 bug

完成的标志：创始人在某篇种子文章上享受性阅读了 30 分钟，**觉得这段时间值**。

### 第 5 周 —— 浸泡开始：邀请群体

- 给 ~12–15 个候选发邀请码（预计 8–10 个会兑换；6–8 个会经常用）
- 扩展里一屏 onboarding，说清三件事：**卡片是主体**、**阅读模式是音量控制**、**同伴模式是 opt-in**
- 隐私政策从 onboarding 链出（这时候必须存在——见 §5 开放问题 5）
- 群体的群聊平台搭好（见 §5 开放问题 1）
- **创始人在前 2 周在那个群里随时可达**
- **创始人继续亲自留 Lens**——持续设定调性，不只是初始播种

**这不是定时活动**。是"门开着，随时来读"。**浸泡持续 4 周**。

### 第 5 周之后 —— 观察，不在浸泡中重新设计

- 读用户发的，**忍住不在浸泡中改产品**
- 注意：bug 修复 OK，产品改动不行
- 浸泡的第 4 周末：收反馈（DM 每个用户；小表单），按 §2 成功标准评估

## 4. 功能优先级

### P0（浸泡开始前必须有）

已完成：

- ✅ 邀请码 → handle → bearer token 流程
- ✅ 白名单 URL 注入（当前 allowlist 5 篇文章）
- ✅ 7 种 Lens 类型在 composer 里都有（Quick / Fun / Question / Poll / Knowledge / Challenge / Spoiler）
- ✅ 房间内 Lens 实时广播
- ✅ Presence（谁在这）—— 通过 `chrome.runtime.connect` port 生命周期判定
- ✅ Lens tag（free-form 输入）
- ✅ 阅读模式（安静默认 / 思考 / 火力全开）—— popup 设置，客户端过滤
- ✅ 引用（`[[lens:id]]` / `[[url:...]]` 解析并在卡片 body 里渲染成 chip/link）
- ✅ Anchoring 通过 `@lumen/anchoring`（TextPosition → TextQuote+context → fuzzy）
- ✅ CSS Custom Highlight API 渲染（不 wrap `<mark>`）
- ✅ 视觉识别（卡片打开时 12 个轮廓色块；新 lens 到达时 4 个 marker 色块；统一 popover 入场动画；尊重 `prefers-reduced-motion`）—— 见 ARCHITECTURE.md §13
- ✅ Orphan 追踪（锚定失败的 lens 在 InfoPanel 里显示；手动 UX 验证延后——测试 recipe 在 `apps/extension/src/content.tsx`）

浸泡前仍需：

- ⏳ Composer 里的匿名 toggle（schema 和服务端已经记录 `lens.anonymous`）
- ⏳ Hide Lens on page（per-tab 切换）
- ⏳ Hide Lens on site（持久设置）
- ⏳ LensCard 上的"copy ref"按钮（让用户能拿到 `[[lens:id]]` 语法粘贴）
- ⏳ 举报按钮（服务端 stub 即可，无需自动化）
- ⏳ 同伴模式（按钮 + 表情扔 + 聊天层 toggle）—— 剩余最大独立块
- ⏳ 隐私政策（1 页，白话）
- ⏳ Orphan 重新锚定流程（孤儿 lens 现在可见但还不能修复）

### P1（浸泡验证形态后才做）

- Poll Lens 类型
- Fun Lens 类型（更长、更打磨的形式）
- Reactions（lol / true / aha / nope）—— 在 P0 基础上扩
- 回复线程
- 撰写时的 AI 助手（"写得更好玩"、"转成问题"）—— **AI 永远不作为可见的评论者**
- GitHub OAuth 徽章
- 按站点 reading mode override
- 自定义 tag 过滤集
- "ping the group: 我在读这个"动作
- Lens 互引反向链接（"3 条 Lens 引用了这个"）

### P2（v2 假设被验证后才做）

- Knowledge Lens 晋升机制
- 跨页面用户主页
- friends-following 过滤
- Skill 信号显化
- 可选飘动弹幕层（**只在火力全开模式且用户显式开启**）
- 浏览器 app / 独立 shell
- 跨浏览器打包
- Mobile

## 5. 浸泡前要拍板的开放问题

1. **邀请群体的群聊平台**：Discord？Telegram？群 iMessage？这是群体沟通的地方。**选一个**。
2. **首批文章**：Karpathy + PG + 1 篇科普/娱乐性文章。owner 拍最终列表。
3. **创始人 = 持续调性设定者**：确认创始人浸泡第 1 周每天 ≥30 分钟在群里发帖、回应，设定调性。
4. **种子 Lens 评审**：30–50 条手写种子在浸泡开始前由谁审调性？至少 2 个人。
5. **隐私政策草稿**：短、白话，必须说明 (a) 扩展会把哪些 URL 报给服务端，(b) 匿名 Lens 对运营方不是零知识匿名。1 页以内。**邀请发出前必须存在**。

## 6. 度量

MVP 的度量是质性的（见 §2）。内部观测用：

**运维**：
- 每用户会话的 WS 重连率（>3/小时报警）
- Lens 创建延迟（发布 → 其他客户端收到）p50/p95
- Anchor 恢复成功率（anchored / orphan / failed）
- 每浏览器会话的 SW 重启频率

**浸泡期间的参与度信号**（观察，不是成功标准）：
- 每用户每周 Lens 创建数（特别是第 4 周 vs 第 1 周）
- Lens 互引数量
- 阅读模式分布（多少用户最终停在哪一档）
- 同伴模式会话数、平均时长、纯表情 vs 含聊天
- Reaction 率、回复深度
- 被阅读模式隐藏的 Lens 数（信号：模式是不是太激进了？）

**反度量**（**不**优化的指标）：
- Lens 总数
- DAU/MAU
- 页面停留时长（可能仅仅因为用户更仔细读，没语境就毫无意义）

## 7. 这 5 周里**明确不做**的

把这份清单写出来，让"加一点又怎样"的诱惑可见：

- AI 自动 marker
- AI 生成的可见 Lens
- 可见的飘动弹幕层（**推迟到 P2**；卡片才是主形态）
- 定时群体共读活动（opt-in 同伴模式覆盖了同步用例）
- 知识图谱 / canonical 知识节点系统
- Skill tree UI（或任何用户可见的 skill 展示）
- 浏览器 app shell
- Chrome 之外的浏览器支持
- Mobile UI
- 邮件通知
- 公开声誉 / karma / 榜单
- 公开 Lens（这个阶段一切都是邀请制）
- PDF / iframe / Shadow DOM anchoring
- 音视频房间
- 一屏说明之外的 onboarding 流程

**任何一项在浸泡结束前被做出来，无论交付了什么，都意味着我们没通过纪律测试。**

## 8. 浸泡之后 —— 分叉

两种结果，两种应对。

**假设被验证**（§2 成功标准达成）：

- 按用户自然提的顺序加 P1 功能
- 邀请圈扩到稍大（也许 30 人）
- 开始草拟知识涌现（UGC → Knowledge Lens 晋升）的具体形态——**但只在原始 UGC 真的稳定发生之后**
- 考虑第二轮白名单扩展（更多文章/站点）

**假设没被验证**：

- **不要在工程上加倍下注**。前提某处错了。
- 对所有参与者做结构化访谈
- 找出参与衰减的具体原因（marker？卡片？模式？人选？文章？同伴模式没人用？）
- **改那一件事**，再跑一次 2 周小型浸泡
- 连续两次失败 → 退一步看；可能要换冷启动机制本身，不是改实现

## 9. 北极星，再说一遍

> **MVP 的成功标志是 10 个人在 4 周里读同一类文章，至少 3 个人持续回来、留下相互建立联系的卡片。这份计划里所有东西的存在都是为了让这一段成立。**
