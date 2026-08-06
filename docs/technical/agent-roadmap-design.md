# Agent Roadmap Design

Date: 2026-07-28
Status: Product and architecture design

This document reframes Roadmap Studio as a reusable project tool for a solo
developer working with coding agents. Lumen can be the first host project, but
the system should be separable and useful across other projects and domains.

## 1. User Goal

The primary user is a solo developer who delegates work to agents and wants to
see, edit, and preserve feature progress across contexts.

The system should support three goals:

1. Record all features and their live state.
2. Make every feature agent-friendly: a fresh-context agent can read the
   feature, understand the boundary, and update the roadmap while developing.
3. Stay reusable across projects, not hard-wired to Lumen.

The shortest product statement:

> Agent Roadmap is a real-time feature ledger for human-led, agent-assisted
> development.

It is not a full Jira replacement, a generic feedback portal, or a multi-agent
runtime. It is the project memory and coordination surface between the human and
many agent sessions.

## 2. Market Scan

The current landscape has useful pieces, but not exactly this product shape.

### Task Queues For Agents

[Mission Control](https://github.com/MeisnerDan/mission-control) is a close
signal: it is an open-source task management app built for delegating work to AI
agents. Its launch discussion highlights real pain points: tasks scattered
across tools, agents needing clear context, poor visibility into what agents are
doing, and failed tasks disappearing. It also emphasizes local-first JSON,
token-optimized payloads, concurrency locking, agent roles, and an inbox/decision
queue.

Borrow:

- local-first posture,
- task queue visibility,
- short agent payloads,
- decisions queue,
- concurrency-safe writes.

Do not copy wholesale:

- autonomous daemon-first workflow,
- heavy queue activation model,
- role templates as the core abstraction.

Agent Roadmap should remain feature-led rather than daemon-led.

### Shared Task Lists And Worktrees

Claude Code Agent Teams and similar workflows use a shared task list, status
flags, and git worktrees to reduce conflicts when multiple agents edit a
codebase. A concrete pattern is: one orchestrator breaks work into tasks,
subagents claim tasks, work in isolated worktrees, then merge results.

Borrow:

- claim/lock status,
- file or module ownership hints,
- dependency markers,
- worktree-aware run records,
- explicit status flags.

Limit:

- worktree isolation defers some conflicts until merge time,
- tasks can become too implementation-granular for roadmap readability.

### State-Oriented Multi-Agent Collaboration

[STORM](https://www.researchgate.net/publication/405090181_Multi-agent_Collaboration_with_State_Management)
argues that multi-agent code collaboration needs explicit state management, not
only separate workspaces. Its key lesson is that agents need consistent views of
the codebase and conflict detection before writes are accepted.

Borrow:

- explicit state snapshots,
- stale-context detection,
- conflict awareness,
- write-time consistency checks where practical.

Limit:

- Agent Roadmap should not mediate every file write in P0.
- It can begin by recording claimed areas, changed files, and verification
  state.

### Shared Memory Protocols

[Akashik Protocol](https://www.akashikprotocol.com/blog/shared-memory-for-multi-agent-ai)
frames shared memory as more than a database or message bus: it should keep the
reasoning behind writes and surface disagreement instead of overwriting it.

Borrow:

- every roadmap update should preserve "why",
- conflicting assertions should become visible,
- event history should remain inspectable,
- last-write-wins should be avoided for important decisions.

Limit:

- P0 does not need semantic ranking or protocol-level disagreement detection.
- A simple append-only event log and decision records are enough to start.

### MCP And Agent Tooling

[mcp-agent](https://github.com/lastmile-ai/mcp-agent) shows the value of simple,
composable agent patterns and full MCP support. Its README also notes that API
reference and `llms-full.txt` surfaces are designed for LLM ingestion.

Borrow:

- expose Agent Roadmap through MCP tools/resources later,
- design agent-readable outputs from the start,
- prefer simple composable patterns over a complex runtime.

Useful future MCP tools:

```text
list_projects
list_features
get_feature
claim_stage
append_event
update_stage
record_verification
handoff_run
release_claim
```

### Human-Agent Collaboration Research

Microsoft's human-agent collaboration framework argues for explicit,
manipulable representations of collaborative activity that can evolve over time,
instead of hidden internal plans. That maps closely to Agent Roadmap's purpose:
the process itself should be visible and editable by the human and agents.

Borrow:

- feature plans should be inspectable,
- process structure should be editable,
- roadmap should capture reframing and decisions, not only task completion.

## 3. Design Principles

### Real-Time Visibility First

The solo developer should immediately see:

- active agent runs,
- current feature and stage,
- latest event,
- changed files,
- verification state,
- blockers,
- next action,
- whether a run needs review.

### Feature-Led, Not Task-Queue-Led

Tasks and runs are subordinate to features.

```text
Project -> Feature -> Stage -> Agent Run -> Event
```

The feature remains the stable unit that survives context switches, branch
changes, and multiple agents.

### Agent-Friendly By Default

Every feature should be readable by a fresh-context agent. That means each
feature needs:

- goal,
- current status,
- current stage,
- scope,
- out of scope,
- accepted next actions,
- relevant docs,
- ownership or file-area hints,
- update protocol,
- verification expectations,
- recent decisions and blockers.

This should be available in Markdown and compact API form, not only HTML.

### Human-Led Boundaries

Agents may update status and append events, but they should not silently expand
scope. Scope expansion, reopening deferred features, or changing product center
requires explicit human instruction.

### Append History, Update Current State

Use two layers:

```text
current state
  feature.status, feature.current_stage, progress, active run

history
  events, decisions, verification records, handoffs
```

Current state is easy to scan. History preserves why it changed.

### Local-First And Portable

P0 should work for one developer on one machine:

- SQLite,
- static exports,
- no cloud dependency,
- optional local REST API,
- local stdio MCP.

## 4. Core Objects

### Project

```text
id
name
root_path
repo_url
created_at
updated_at
```

### Feature

```text
id
project_id
title
status
phase
progress
current_stage
summary
why
scope
out_of_scope
relevant_docs
allowed_areas
risk_level
sort_order
created_at
updated_at
```

Feature statuses:

```text
now
next
planned
exploring
deferred
shipped
archived
```

### Stage

```text
id
feature_id
title
status
sort_order
started_at
completed_at
updated_at
```

Stage statuses:

```text
planned
next
now
done
blocked
cut
```

### Agent Run

One execution context, task, thread, or worktree session.

```text
id
project_id
feature_id
stage_id
thread_id
branch
worktree_path
agent_name
title
status
summary
claimed_areas
started_at
updated_at
completed_at
```

Run statuses:

```text
active
needs-review
blocked
done
cancelled
stale
```

### Event

Append-only activity record.

```text
id
run_id
feature_id
kind
text
files
verification
created_at
```

Event kinds:

```text
started
progress
decision
files-changed
verification
blocked
handoff
completed
cancelled
```

### Decision

Important product or architecture choice.

```text
id
project_id
feature_id
run_id
title
decision
reason
alternatives
created_at
```

### Verification

```text
id
feature_id
run_id
command
status
summary
created_at
```

Verification statuses:

```text
passed
failed
skipped
blocked
```

## 5. Views

### Human HTML Dashboard

For the developer.

```text
Active Runs
  What is currently happening?

Feature Board
  What features exist and where are they?

Needs Review
  What requires human attention?

Blocked
  What is stuck and why?

Recent Events
  What changed in the last few minutes?
```

### Agent Markdown View

For fresh-context agents.

```text
docs/roadmap.md
```

This should be generated, not hand-written.

It should include:

- global agent rules,
- project source-of-truth links,
- active features,
- feature scope/out-of-scope,
- current stages,
- recent decisions,
- next actions,
- verification expectations,
- update protocol.

### Compact JSON/Local API View

For scripts and tools.

```text
docs/roadmap.json
docs/roadmap.md
local GET /api/roadmap
local GET /api/roadmap/agent
```

The agent view should omit decorative/human-only fields and prioritize what a
new agent needs. Local API routes are optional and must belong to a standalone
roadmap service, not to the product app being managed.

### MCP View

Reusable integration for Codex, Claude Desktop, Cursor, OpenHands, or other
agent clients.

Expose both resources and tools:

```text
resources:
  roadmap://projects
  roadmap://projects/{id}/features
  roadmap://features/{id}
  roadmap://features/{id}/agent-brief

tools:
  list_features
  get_feature
  append_update
  set_stage_status
  update_feature
  export_agent_markdown
```

## 6. API Shape

Standalone local P0:

```text
GET    /api/roadmap
GET    /api/roadmap/agent

GET    /api/roadmap/features
POST   /api/roadmap/features
GET    /api/roadmap/features/:id
PATCH  /api/roadmap/features/:id
DELETE /api/roadmap/features/:id

POST   /api/agent-runs
PATCH  /api/agent-runs/:id
POST   /api/agent-runs/:id/events
GET    /api/agent-runs?status=active
```

P1:

```text
POST   /api/features/:id/stages
PATCH  /api/features/:id/stages/:stageId
POST   /api/features/:id/decisions
POST   /api/features/:id/verifications
POST   /api/features/:id/handoffs
```

P2:

```text
GET /api/agent-events/stream
MCP server tools/resources
```

## 7. Real-Time Model

Use a standalone local process when realtime is needed:

```text
agent/script/local API writes event
  -> SQLite append
  -> local server broadcasts WebSocket event
  -> dashboard updates active runs and feature state
```

No external queue is required for P0.

For the first implementation, a local script can be enough:

```bash
bun scripts/agent-roadmap-event.ts \
  --feature theme-system \
  --stage tokens \
  --kind progress \
  --text "Converted card and orb styles to theme variables"
```

The script can call the local roadmap API when it is running or write files
directly in trusted local mode. It must not require the managed product's cloud
server.

## 8. Agent Update Protocol

Agents should update Agent Roadmap when:

- starting a feature or stage,
- claiming a file/module area,
- making a meaningful decision,
- finishing a stage,
- becoming blocked,
- running verification,
- handing off to another context,
- completing work.

Agents should not update it for every small edit.

Feature updates must preserve scope boundaries:

- no deferred feature is moved forward without explicit user instruction,
- no product center is changed silently,
- no agent expands allowed areas just because it is convenient.

## 9. Reuse Outside Lumen

Keep the core schema generic:

```text
project
feature
stage
run
event
decision
verification
handoff
artifact
```

Keep Lumen-specific product rules in project configuration:

```text
project_config
  source_of_truth_docs
  guardrails
  default_verification
  feature_status_order
  stage_status_order
```

For another project, Agent Roadmap should only need a new config and seed
features.

## 10. What To Borrow

From Mission Control:

- local-first data,
- token-optimized agent payloads,
- task visibility,
- decisions queue,
- concurrency-safe writes.

From shared task list/worktree systems:

- status flags,
- work claims,
- dependency markers,
- worktree/run records.

From STORM:

- explicit state views,
- stale-context awareness,
- conflict detection as a design goal.

From Akashik/shared memory:

- preserve why a state changed,
- surface disagreement instead of overwriting it.

From MCP/mcp-agent:

- expose simple resources and tools,
- generate agent-readable docs,
- keep workflow patterns composable.

From human-agent collaboration research:

- make the process itself visible and editable.

## 11. P0 Build Plan

1. Keep Lumen as the first project using the local/static roadmap files.
2. Add generated `docs/roadmap.md`.
3. Add feature notes under `docs/features/`.
4. Add a local-only roadmap preview server.
5. Add `scripts/agent-roadmap-event.ts` or a similar local writer.
6. Add conflict/claim conventions.
7. Add local stdio MCP resources and tools.
8. Add optional standalone local API and live dashboard.
9. Extract the generic schema into a reusable package or small service.

## 12. Non-Goals

P0 should not build:

- autonomous task spawning daemon,
- enterprise permissions,
- external feedback voting,
- full project-management replacement,
- complex Gantt/timeline tooling,
- agent-to-agent chat,
- semantic memory ranking,
- automatic merge conflict mediation.

These can be considered only after the solo-developer visibility loop works.

## 13. Summary

Agent Roadmap should be the durable, real-time coordination layer between a
human solo developer and many short-lived agent contexts.

It should make features visible to humans, readable to agents, editable through
API/script/UI, and portable to other projects.
