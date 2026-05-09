# Lumen v2 项目概览

日期：2026-05-06
状态：稳定产品概览

这份文档解释 Lumen v2 是什么、为什么存在。它不是当前实现 checklist。当前状态看 `docs/project-status.md`。AI 助手入口和阅读路由看 `AGENTS.md`。

## 1. Lumen 是什么

Lumen 是一个浏览器扩展，让一个小群体可以在真实网页上留下上下文相关、带一点玩味的 Lens 卡片。Lens 锚定到页面或段落，由 handle 签名，并且随时间持久存在。当一个页面累积了 Lens 卡片，它会开始显得像有人来过。

当读者想要实时陪伴时，可以显式进入当前页面的 companion mode。Companion 是短暂的、opt-in 的；持久记忆应该回到 Lens 卡片。

最简单的描述：

> Lumen turns a webpage into a place that has been read, and occasionally a place where someone else is reading right now.

## 2. 核心赌注

Lumen 背后更大的想法是：知识可以在软件之外被开源。解释、路径、观察和小项目，都可以成为别人重新看世界的 lens。

v2 刻意把这个想法收窄成一个可验证的判断：

> 当一个网页感觉像有人来过，人们才会愿意参与。知识从参与中涌现，而不是作为起点。

如果这是真的，更大的生态以后才有意义。如果不是，先建知识图谱救不了这个产品。

v2 的链条是：

```text
entertainment substrate -> participation -> UGC -> emergent knowledge
```

反过来就是 v1 的陷阱：先建知识基础设施，再希望人们后来抵达，最后发现他们不会来。

## 3. 产品形态

Lumen v2 有三层：

- **异步 Lens 累积。** 卡片持久留在真实网页上，成为页面的 durable social memory。
- **阅读模式。** Quiet、Thinking、Full 让读者自己控制看到多少社交信号。
- **Page companion。** 读者可以 opt in 到同页 presence、emoji toss 和 tiny chat。

这三层都必须尊重原网页。Lumen 是安静的 overlay，不是替代阅读表面。

## 4. 范围边界

v2 不做：

- 可见的 AI-authored Lens，
- 默认浮动弹幕，
- 把定时共读作为核心循环，
- 可见知识图谱 UI，
- skill tree UI，
- 公开 reputation、karma、leaderboard，
- 把 durable Lounge chat 当作页面记忆，
- 把 Atlas UI 塞进 Lumen。

如果 Lens 参与循环跑通，这些想法未来可以回来。它们不是第一件要验证的事。

## 5. 身份模型

当前身份模型刻意很小：

- **Handle：** 必需的显示身份。
- **Bearer token：** 由扩展保存，用于 API/WS 调用。
- **Invite mode：** 可选 server 设置，用于更紧的小群体。
- **Anonymous Lens flag：** UI 隐藏作者，但 server 记录真实作者用于 moderation。

这不是 zero-knowledge anonymity system。

## 6. 和 Atlas 的关系

`docs/Chat.md` 中的原始设想描述了一个更大的生态：Lumen 是 perception layer，Atlas 是未来的 path-weaving / project layer。

Atlas 是真实方向，但不属于 Lumen v2 范围。Lumen 应保留足够上下文，让部分 Lens 未来可以成为 node candidate；但不能把 v2 UI 变成知识管理工具。

当前生态规划看 `docs/product/ecosystem-roadmap.md`。

## 7. 成功形态

成功指标是定性和累积性的：

- 被邀请用户在新鲜感过去后仍继续创建 Lens，
- 至少一些页面累积出多作者 Lens layer，
- Lens 之间自然出现引用，
- 用户说他们想继续开着扩展，
- companion mode 偶尔产生轻量的实时陪伴，但不变成产品中心。

Lens 总量不是北极星指标。

## 8. 文档职责

- AI 助手入口和路由：`AGENTS.md`。
- 当前实现状态和近期计划：`docs/project-status.md`。
- 技术架构和取舍理由：`docs/ARCHITECTURE.md`。
- Lens 产品细节：`docs/product/lens-design.md`。
- 原始中文设想：`docs/Chat.md`。

旧计划文档可能包含过期 checklist。当前快照以 `docs/project-status.md` 为准。

## 9. 北极星

> Lumen exists to make a webpage feel inhabited through cards that persist, not chrome that interrupts. Knowledge, skill growth, and a wider ecosystem are downstream effects of solving that one problem first.
