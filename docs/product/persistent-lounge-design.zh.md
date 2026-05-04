# 持续房间 Lounge 产品设计

日期：2026-05-04
状态：Draft v0.1

## 1. 为什么需要它

当前 companion mode 是绑定当前网页的：用户在某个页面主动进入实时同伴状态，换页或关 tab 后就离开。这对 Lumen 是正确默认值，因为产品中心仍然是网页，以及网页上积累起来的 Lens 层。

但还有另一种社交需求，page companion 覆盖不了：

> 我想和这群人保持连接，然后一起在网上闲逛。

这和 page companion 不一样。它是一个持续房间，暂定名 **Lounge**。Lounge 让小群体可以跨页面保持连接，但 Lens 仍然绑定具体网页。

这里的产品风险很真实：如果 Lounge 太强，Lumen 会变成普通聊天软件，网页和 Lens 反而退居其次。所以设计目标必须是辅助，而不是抢中心。

## 2. 产品边界

Lumen 有三层社交结构，重要性从高到低：

1. **Lens 层**：持久、绑定网页、上下文明确、由用户创建的卡片。这是产品中心。
2. **Page companion**：临时、绑定网页、主动进入的实时同页陪伴。
3. **Lounge**：用户主动选择的持续小房间，可以跨页面存在，聊天临时或轻量保留。

Lounge 不应该替代 Lens 成为网页的长期记忆。如果一段聊天值得留下，用户应该主动把它变成 Lens。

## 3. 核心原则

### 3.1 Lens 仍然是主角

网页上的主表面仍然是 Lens 层。Lounge 不应该成为用户第一眼看到的东西，也不应该占据最大的屏幕空间，更不应该成为使用 Lumen 的默认模式。

### 3.2 明确进入

用户不会自动加入 Lounge。进入方式可以是输入房间码、接受邀请链接、选择最近用过的 Lounge。用户不能仅仅因为浏览网页就出现在持续房间里。

### 3.3 不自动广播浏览页面

Lounge 不能自动广播用户访问的每个页面。用户可以手动把当前页面分享到 Lounge，但产品不能让人感觉自己被监视。

### 3.4 默认轻量

第一版应该像一个安静的侧频道，而不是完整聊天客户端。短消息、在线状态、手动分享页面已经足够。

### 3.5 持久记忆必须是 Lens 形态

Lounge 聊天不应该成为网页的正式记忆。消息可以包含页面链接，未来也可以支持“转成 Lens”，但持久化应该来自明确动作。

## 4. 命名

推荐名：**Lounge**。

原因：

- 它像一个可以待着的小空间，而不是会议或工作区。
- 它和 page companion 有明显区分。
- 它不会让功能听起来像完整群聊产品。

不建议的名字：

- **Group chat**：太通用，也太抢中心。
- **Room**：容易和 page room / URL room 混淆。
- **Party**：太像同步活动。
- **Workspace**：会把产品拉向 Atlas / 生产力工具方向。

UI 文案可以是：

- Page companion：`People on this page`
- Lounge：`Stay with a small room across pages`

## 5. 和 Page Companion 的关系

### Page Companion

适用于用户想找“此刻也在同一页的人”。

特征：

- 绑定 canonical page room。
- 每个页面单独主动进入。
- 离开、换页、关 tab、socket 断开都会结束。
- emoji toss 和 tiny chat 都和当前页面有关。
- 最适合制造“这页此刻有人”的感觉。

### Lounge

适用于用户想和同一群人跨页面保持连接。

特征：

- 绑定 `loungeId`，不是 page room。
- 明确加入和离开。
- 在扩展/浏览器会话仍活跃时，可以跨页面导航存在。
- 可以手动分享当前页面。
- 最适合“我们在一起上网，但不一定看同一页”。

### 两者同时存在时

两者可以同时存在，但 UI 不能堆两个完整聊天面板。

推荐行为：

- Page companion 控制仍在 InfoPanel，因为它是页面局部功能。
- Lounge 主要放在 popup，或由 orb 打开的一个小型次级面板。
- 如果两者都活跃，orb 用两个安静状态标记：page live 和 Lounge live。
- Page companion chat 和 Lounge chat 分开，不自动互相转发。

## 6. UX 形态

### 6.1 入口

主入口应该在扩展 popup，而不是页面 InfoPanel。

原因：Lounge 不绑定当前网页。如果主要放在页面 panel 里，会让它看起来像当前网页的一部分，这是误导。

Popup 状态：

- 未登录：不显示 Lounge 入口。
- 已登录，未加入：显示 `Join Lounge` 输入/按钮。
- 已加入：显示 Lounge 名称/房间码、在线人数、`Open Lounge`、`Leave`。

页面里的可选入口：

- InfoPanel 可以在 Lounge 活跃时显示一行小状态：`Lounge: friends live`。
- 可以有 `Share this page`。
- 默认不显示完整 Lounge chat。

### 6.2 Orb 表现

Orb 仍然应该以当前页面为主。

可能状态：

- 默认：`N lens`
- Page companion 活跃：`N lens · Companion 2`
- Lounge 活跃：`N lens · Lounge`
- 两者都活跃：`N lens · Companion 2 · Lounge`

保持紧凑，不要在 orb 上显示 Lounge 消息预览。

### 6.3 Lounge 面板

Lounge 面板应该像一个小抽屉，而不是完整聊天应用。

建议区块：

- Header：Lounge 名称/房间码、在线人数、关闭。
- Recent messages：短列表，内部滚动。
- Composer：单行输入，280 字符。
- Current page action：`Share page`。
- Leave：安静的次级按钮。

MVP 不需要大成员列表，不需要头像，handle 足够。

### 6.4 分享当前页面到 Lounge

手动分享页面是 Lounge 回到 Lumen 中心的关键桥。

payload 应包含：

- 页面标题。
- canonical URL。
- room ID，如果可用。
- 可选短注释。

UI 渲染：

- Lounge chat 里显示紧凑链接卡片。
- 点击打开页面。
- 未来如果该页有 Lens，可以显示 `N Lens here`。

这让 Lounge 有存在理由，同时不会变成自动浏览记录。

## 7. 持久化策略

MVP 推荐：

- Lounge presence 只实时存在。
- Lounge chat 使用短暂内存历史，类似 page companion。
- 第一版不写入 SQLite。
- 手动分享页面也进入同一短历史。

理由：

- 保持轻量。
- 避免制造一个和 Lens 竞争的持久聊天档案。
- 降低 moderation 和隐私复杂度。
- 逼迫值得保留的东西回到 Lens 形态。

未来可能升级：

- 每个 Lounge 可选历史，但必须在真实使用证明需要之后再做。
- 显式 `Save as Lens` / `Make Lens from message`，而不是自动持久化。

## 8. 隐私规则

Lounge 比 page companion 隐私风险更高，因为它跨页面持续存在。

硬规则：

- 不自动广播当前 URL。
- 不显示 “Alice is reading X”，除非 Alice 主动分享 X。
- 不把浏览历史存成 Lounge 元数据。
- 发布前隐私政策必须说明 Lounge membership 和 messages。
- Anonymous Lens 和 Lounge 身份无关；Lounge 消息显示 handle。

## 9. MVP 范围

只做：

- 用房间码加入 Lounge。
- 离开 Lounge。
- 实时人数。
- 简短 Lounge chat。
- 短暂内存聊天历史。
- 手动 `Share page`。
- 紧凑 orb 状态。

先不做：

- 公开 Lounge 目录。
- 通知。
- 语音/视频。
- 持久房间历史。
- 丰富成员资料。
- 超出房间码的权限系统。
- 自动页面广播。
- Lounge 专属 Lens feed。
- 基于 Lounge 活动的推荐。

## 10. 技术草案

Client to server：

```ts
{ type: "lounge_join"; loungeId: string }
{ type: "lounge_leave" }
{ type: "lounge_chat"; body: string }
{ type: "lounge_share_page"; url: string; canonicalUrl: string; title: string; roomId?: string; note?: string }
```

Server to client：

```ts
{ type: "lounge_presence"; loungeId: string; users: string[] }
{ type: "lounge_joined"; loungeId: string; userId: string; users: string[] }
{ type: "lounge_left"; loungeId: string; userId: string; users: string[] }
{ type: "lounge_chat"; id: string; loungeId: string; userId: string; handle: string; body: string; at: number }
{ type: "lounge_page"; id: string; loungeId: string; userId: string; handle: string; url: string; canonicalUrl: string; title: string; roomId?: string; note?: string; at: number }
{ type: "lounge_history"; loungeId: string; messages: Array<LoungeHistoryItem> }
```

Service worker ownership：

- service worker 已经持有 WebSocket bridge。
- Lounge 应该也由 service worker 管理，而不是页面 content script。
- content script 可以通过 port/message 请求 Lounge 状态。
- popup 是 Lounge 的主要控制表面。

Storage：

- 如果用户选择保持加入，则把 active `loungeId` 存进 extension storage。
- 默认可以先 session-only，等 UX 被证明后再做持久加入。

## 11. 开放问题

1. Lounge 应该跨浏览器重启保持加入，还是只跨当前浏览器会话的页面导航？
2. Lounge 历史是否完全内存化？手动分享页面是否应该比普通聊天保留更久？
3. `Share page` 应该放 InfoPanel、popup，还是两边都有？
4. Quiet reading mode 是否影响 Lounge 可见性，还是只影响页面 Lens？
5. 第一版房间码模型是什么：用户输入、邀请链接，还是运营者配置一个 cohort Lounge？

## 12. 建议决策

只有在当前 page-bound Lumen MVP 足够稳定、能开始小规模 cohort 使用后，再做 Lounge。

如果做，保持它很小：

> Lounge 是一群朋友跨页面闲逛时的持续侧频道。Lens 仍然是每个网页的持久记忆。

这样可以保住 Lumen 的产品中心，同时给亲近的小群体一个真正“一起在线”的感觉。
