# lumen Operator Console 与 Lens Insights 设计

日期：2026-08-06
状态：产品与技术规划

本文整理 lumen 数据库/运营面板、数据分析、Lens 语义聚类，以及未来
Atlas 预备层的设计讨论。它不是当前实现快照；当前实现状态仍以
`docs/project-status.md` 为准。

## 1. 定位

lumen 需要的不是通用数据库面板，而是 **Operator Console**。

数据库只是底层事实来源。面板真正要服务的是 lumen 的产品语义：

- Lens 是否被看见、被打开、被回应。
- 某个页面是否开始有真实参与。
- 哪些内容需要审核。
- 哪些锚点或页面体验有问题。
- 哪些自然话题正在从真实网页 UGC 中浮现。

Operator Console 应该是内部运营、审核、诊断和洞察面板，不是公开数据
大屏，也不是生产 SQL 编辑器。

核心边界：

- 所有写操作走 lumen 服务端 API，不从浏览器直接写 SQLite。
- 不编辑用户写过的 Lens 正文。
- 不做公开排行榜、声望、karma、用户排名。
- 不优化 Lens 总数作为核心目标。
- 不做默认 AI 审核、默认 AI 公开内容。
- 不提前暴露 Atlas 或知识图谱 UI。

## 2. 信息架构

第一版导航可以保持克制：

```text
Operator Console
├─ Reports
├─ Lenses
├─ Pages
├─ Users
├─ Status
├─ Analytics / Insights
└─ Semantic Groups / Clusters
```

默认首页建议是 Reports，而不是 dashboard。早期最重要的是确认有没有
内容需要处理，而不是追增长曲线。

## 3. Reports

Reports 是审核队列。

应展示：

- report id
- 举报原因
- 举报人
- 被举报 Lens
- Lens 作者
- Lens URL / roomId
- Lens 创建时间
- 举报时间
- 当前状态：open / reviewed / dismissed
- review note
- reviewed by / reviewed at

操作：

- mark reviewed
- dismiss report
- delete Lens
- revoke user token
- 留 review note
- 打开原页面上下文
- 跳转到 Lens、Page、User 详情

现有基础 API：

- `GET /api/admin/reports`
- `PATCH /api/admin/reports/:id`
- `DELETE /api/lenses/:id`
- `POST /api/admin/revoke-user`

## 4. Lenses

Lens 视图用于查看和诊断所有 Lens。

字段：

- Lens ID
- body
- type
- tags
- refs
- URL
- roomId
- author handle
- anonymous
- created_at
- reactions
- reports
- anchor JSON

筛选：

- body 搜索
- URL / domain / room
- author
- type / tags
- anonymous
- reported / deleted
- 时间范围

操作：

- 打开原页面
- 复制 Lens ID / URL / roomId
- 查看完整 JSON
- 删除 Lens
- 跳到 Page View
- 跳到 User View

重要边界：Operator 可以删除、诊断、重新锚定，但不应该编辑用户写过的
正文。

## 5. Pages / Rooms

lumen 是 page-bound 产品，因此页面视图非常关键。

输入 URL 或 roomId 后，应展示：

- canonical URL
- roomId
- 该页面所有 Lens
- 作者分布
- Lens 类型分布
- reactions / reports
- anchor health
- 页面活跃时间线

页面视图要回答：

- 这个页面是否真的“有人来过”？
- 这个页面是不是被刷屏？
- 哪些 Lens 是页面上的主要参与入口？
- 锚点是否经常失败？
- 这个页面是否适合继续 seed？

页面状态可以是内部标签：

- silent
- seeded
- active
- noisy
- problematic

这些标签只用于运营诊断，不做公开热榜。

## 6. Users

用户视图只用于 operator context，不做公开排名或用户价值评分。

可展示：

- user id
- handle
- github login
- created_at
- invited_by
- 最近 Lens
- 被举报 Lens
- 举报别人记录
- token revocation 状态
- manual note / watch 状态

可支持谨慎的 operator-only cohorts：

- new user
- active author
- quiet reader
- reporter
- reported author
- seed contributor
- watch
- revoked

不要做：

- top user
- best author
- influence score
- karma
- trust score
- contribution ranking

## 7. Status

Status 视图基于已有 `/api/status`。

应展示：

- uptime
- DB writable
- WebSocket 连接状态
- active rooms
- connection count
- largest room
- companion rooms
- recent errors
- 当前 operator 身份
- local / staging / prod 环境标识

## 8. Audit Log

一旦后台能执行删除、review、dismiss、revoke 等动作，就应该有 audit log。

记录：

- operator id
- action type
- target type
- target id
- note
- before / after 摘要
- created_at

动作类型示例：

- delete_lens
- review_report
- dismiss_report
- revoke_user
- update_anchor
- rename_cluster
- confirm_cluster
- promote_atlas_candidate

这比让后台直接改数据库重要。它让运营动作可追踪、可解释、可回滚设计。

## 9. Analytics / Insights

Analytics 应定位为 **产品洞察与运营诊断**，不是增长大屏。

它要回答：

- 哪些 Lens 被看见？
- 哪些 Lens 被打开？
- 哪些 Lens 真的进入阅读？
- 哪些页面开始活起来？
- 哪些内容容易被举报？
- 哪些锚点有问题？
- 哪些主题自然浮现？

建议采集事件：

- lens_created
- lens_marker_seen
- lens_card_opened
- lens_card_closed
- lens_body_expanded
- lens_ref_clicked
- lens_reacted
- lens_reported
- lens_anchor_failed
- lens_anchor_recovered

建议指标：

- 新增 Lens 数
- Lens type distribution
- anonymous ratio
- refs usage ratio
- long Lens ratio
- marker impressions
- open rate
- dwell time
- Read more expand rate
- ref click rate
- reaction rate
- report rate
- delete rate
- orphan / anchor fail rate
- anchor recovery success rate

不要只看 Lens 总数。lumen 不应该优化“评论越多越好”，而应该观察卡片
是否自然进入阅读、页面是否形成轻量参与、内容是否保持小组感。

## 10. Page Analytics

页面维度指标：

- Lens count
- unique authors
- open rate
- average dwell
- reactions
- reports
- anchor failures
- first Lens time
- follow-up Lens count
- active days
- domain / category
- room activity status

页面分析用于判断：

- 哪些页面被 lumen 轻轻点亮。
- 哪些页面只是被 seed 过但没有后续参与。
- 哪些页面产生多用户、多类型、多引用的真实讨论。
- 哪些页面的锚定或内容质量需要维护。

## 11. Lens 分类

Lens 分类可以分三层。

显式分类：

- type
- tags
- anonymous
- refs
- body length
- anchor type

规则内容分类：

- comment
- question
- explanation
- reference
- discussion seed
- low signal

人工 operator 分类：

- good seed
- needs context
- low signal
- moderation watch
- harmful / spam

第一版不建议直接做 AI 自动分类。可以先使用规则分类和人工标签。AI 后续
可以作为 operator 辅助建议，但不应成为默认公开判断。

## 12. Semantic Groups / Clusters

这里是为未来 Atlas 准备的关键层。

可以把关系理解为：

```text
Lens -> Semantic Cluster -> Atlas Candidate
```

Semantic Groups 是内部实验能力：

- 不作为当前 beta 用户侧知识图谱。
- 不作为公开分类系统。
- 用来观察 Lens 的自然主题结构。
- 为未来 Atlas 留下可复用的数据资产。

### 12.1 聚类对象

单页内 Lens 聚类：

- 同一个 room 内聚出几个话题团。
- 最贴合 lumen 的 page-bound 中心。
- 适合回答“这篇页面下大家主要在讨论什么”。

跨页面 Lens 聚类：

- 找多个网页上重复出现的问题、概念、兴趣。
- 是 Atlas candidate 的重要来源。

页面聚类：

- 根据页面上的 Lens 分布，把页面分成相似类型。
- 可用于 seed page tracking 和页面健康诊断。

用户意图聚类：

- 最敏感，建议晚点做。
- 若做，也应只做内部或聚合层面，不落成公开个人画像。

### 12.2 聚类输入特征

Lens 聚类不应该只看 body。应组合：

- Lens body
- Lens type
- tags
- refs
- URL / domain
- page title
- anchor quote
- anchor prefix / suffix
- 页面上下文片段
- reaction kinds
- report status
- created_at

关键判断：短 Lens 必须结合 anchor quote 和 page context。比如“这句太
真实了”单看几乎没有语义，但加上它锚定的原文就能进入正确主题。

可构造 semantic text：

```text
Lens type: question
Lens body: 这是不是说明早期产品应该先服务小圈子？
Anchor quote: It is better to make a few people really happy...
Page title: Do Things that Don't Scale
URL domain: paulgraham.com
Tags: startup, product
```

### 12.3 技术路线

推荐从轻量 pipeline 开始：

```text
构造 semantic text
→ 生成 embedding
→ room-level 聚类
→ cross-room/global 聚类
→ 自动生成 proposed label
→ operator review
→ 稳定 cluster 生成 Atlas candidate
```

算法选择：

- 小数据早期：Agglomerative clustering + similarity threshold。
- 数据更多后：HDBSCAN。
- 可视化探索：UMAP + HDBSCAN。
- 不建议一开始用 K-means，因为需要预设 K。

### 12.4 Cluster Review UI

Operator Console 中可加入：

```text
Semantic Groups
├─ By Page
├─ By Domain
├─ Global Candidates
└─ Review Queue
```

每个 cluster 展示：

- proposed label
- scope
- confidence
- Lens count
- page count
- author count
- representative Lens
- top anchor quotes
- related refs
- suggested Atlas candidate type
- review status

操作：

- confirm
- rename
- merge
- split
- mark noise
- promote to Atlas candidate
- export evidence

promote to Atlas candidate 只是内部动作，不等于展示 Atlas UI。

### 12.5 Cluster 指标

Cluster 不只看文本相似，还应聚合行为表现：

- impressions
- opens
- open rate
- avg dwell
- reactions
- ref clicks
- reports
- expansion rate
- follow-up Lens count
- anchor failure rate

可计算内部指标：

- coherence：簇内相似度。
- coverage：覆盖多少 Lens / 页面。
- novelty：是否是新主题。
- persistence：是否跨天 / 跨页面持续出现。
- engagement：打开、停留、reaction、ref click。
- friction：report、delete、快速关闭、anchor fail。
- atlas-readiness：是否适合成为 Atlas candidate。

atlas-readiness 可以内部计算，但不应公开成用户可见分数。

## 13. Atlas Candidate

稳定 cluster 可以转为 Atlas candidate。

候选类型：

- topic
- concept
- question
- path
- debate
- source cluster

示例：

```text
Cluster:
  label: Early product validation
  lenses: 18
  pages: 5
  users: 4
  refs: 7
  stability: high

Atlas candidate:
  type: topic
  title: Early product validation
  evidence: representative Lens + pages
```

Atlas candidate 是未来结构化系统的种子，不是当前 beta 默认 UI。

## 14. 与推荐系统的关系

这个方向技术上接近推荐系统，但产品上不必做推荐流。

社交媒体和推荐系统常见层次：

- 内容理解：embedding、分类、topic modeling、关键词、实体、情绪、安全分类。
- 行为分析：impression、click、dwell、reaction、share、report、hide。
- 召回 retrieval：向量相似、协同过滤、图遍历、热度召回、规则召回。
- 排序 ranking：CTR、dwell、互动概率、负反馈、多样性、新鲜度。
- 图分析：user / post / topic / page / ref / interaction graph。
- 人工反馈闭环：审核、标注、合并、拆分、纠错。

lumen 可以借：

- embedding
- vector search
- clustering
- graph model
- representative selection
- behavior aggregation
- human review loop

暂时不建议借：

- 个性化 feed
- 强 CTR 优化
- 用户兴趣画像
- 黑箱内容质量分
- 作者权重 / 声望分
- 自动推送

lumen 更适合先做“语义组织系统”，再谨慎考虑用户可控推荐。

## 15. 推荐路线

```text
Phase 1: Operator Console 基础
Reports / Lenses / Pages / Users / Status

Phase 2: Analytics event model
记录 marker seen / open / dwell / ref click / reaction / report / anchor health

Phase 3: Lens semantic text
定义 Lens 用哪些上下文字段生成 embedding

Phase 4: Room-level clustering
先在单页内做聚类

Phase 5: Cluster review UI
人工确认、改名、合并、拆分、拒绝

Phase 6: Cross-page clustering
发现跨页面主题、问题、概念

Phase 7: Graph layer
Lens / Page / User / Ref / Cluster 关系持久化

Phase 8: Atlas candidates
从稳定 cluster 中生成 topic / question / concept / path 候选

Phase 9: Optional recommendation
只在用户明确请求时推荐相关 Lens / 页面 / path
```

## 16. 总结

这条路线可以概括为：

```text
Lens 是原子。
Analytics 告诉我们哪些原子被看见、被打开、被回应。
Clustering 把原子沉淀成语义团。
Human review 把语义团变成可信结构。
Atlas candidate 是未来图谱的种子。
Recommendation 是更晚、更谨慎的用户可控能力。
```

这样既不破坏 lumen 的 page-bound card 中心，又能让 Atlas 从真实网页
上的 UGC 自然长出来，而不是凭空设计一套知识图谱。
