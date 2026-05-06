# Lens 阅读设计

日期：2026-05-05
状态：P0 实施计划

这份文档定义 Lens 阅读体验的下一步方向。它不替代
`docs/product/lens-design.md`，只收窄一个问题：Lens 需要继续保持轻量的社交卡片形态，同时能够承载更长、可复用的知识内容。

## 1. 角色分层

Lens 有两种角色：

- **社交卡片**：快速评论、玩笑、问题、反应、小笔记。
- **节点候选**：解释、总结、例子、项目提示、引用，未来可能喂给 Atlas。

UI 必须同时服务这两者，但不能让每一条 Lens 都变得像文档编辑器。

原则：

> Lens 可以很长，但默认读起来必须很轻。

## 2. 阅读状态

### Preview

长 Lens 的默认状态。

- 展示元信息、引用文本和有限正文预览。
- 底部被裁切时使用淡出遮罩。
- 提供 `Read more`。
- 保持卡片栈可扫读。

### Expanded

原地展开状态。

- 在舒适的最大高度内展示完整渲染正文。
- 如果内容仍然很长，正文区域内部滚动。
- 提供 `Show less`。
- 让用户仍然停留在原网页锚点上下文附近。

### Reader

未来状态，不属于 P0。

- 给非常长、可复用的 Lens 一个更宽、更安静的阅读面板。
- 适合本质上已经接近小文章的 Knowledge Lens。
- 不应成为默认网页体验。

## 3. Markdown 方向

Lens body 应该优先采用 Markdown。

P0 渲染应支持：

- 段落，
- 软换行，
- 克制尺寸的标题，
- 无序和有序列表，
- 引用块，
- fenced code block，
- inline code，
- 普通链接，
- 现有的 `[[lens:id]]` 和 `[[url:...]]` 引用。

P1 可以增加：

- 表格，
- task list，
- 图片策略，
- composer 内 Markdown preview。

现在不要加入完整富文本编辑器。

## 4. 长内容规则

P0 卡片行为：

- 短 Lens 正常渲染。
- 长 Lens 在预览状态裁切正文。
- 展开后正文有内部滚动边界。
- 代码块横向滚动，绝不撑宽卡片。
- 文本在卡片内安全换行。
- reduced-motion 用户不应获得高度动画。

推荐初始数值：

- 预览正文最大高度：约 180px。
- 展开正文最大高度：约 `min(62vh, 560px)`。
- 卡片栈继续保持现有视口限制。

这些是调参旋钮，不是产品铁律。

## 5. 类型指引

Lens type 应影响预期长度：

- `quick`：默认很短；太长会显得不合形状。
- `fun`：短或中等。
- `question`：短问题，可附带较长背景。
- `knowledge`：可以较长，最应受益于 Markdown 渲染。
- `challenge` / future `project`：可以包含步骤、约束和结果。
- `spoiler`：未来应默认隐藏正文。

P0 不强制这些规则，只让长内容变得可读。

## 6. Atlas Hook

更丰富的 Lens 阅读体验不只是外观。它也在为 Lens 未来成为 Atlas 节点候选做准备。

未来元数据可能包括：

- summary，
- concept hints，
- prerequisite hints，
- project seed，
- reusable flag，
- source Lens / URL / anchor context。

暂时不要把这些做成沉重的可见元数据 UI。可见的 Lens composer 和卡片体验仍应保持人味和社交感。

## 7. P0 实施范围

现在构建：

- Lens 卡片中的轻量 Markdown 渲染，
- 保留现有 Lens 和 URL 引用 chip，
- 长 Lens 预览和 `Read more`，
- 原地展开正文并支持内部滚动，
- code block 和 inline code 样式，
- 对 reduced-motion 安全的过渡。

推迟：

- 完整 reader panel，
- composer Markdown preview，
- templates，
- 显式 Atlas metadata 编辑，
- 表格和图片，除非真实 Lens 使用要求它们。
