# Atlas Design Notes

Date: 2026-05-09
Status: Early concept exploration — not a build spec

This document records the design thinking behind Atlas from a session on
2026-05-09, extended in 2026-06 with a deep, speculative node-ontology
exploration (Section 9). It is a working document, not a final decision record.
For the current build boundary, read `docs/project-status.md` and
`docs/product/ecosystem-roadmap.md`.

## 1. Core Philosophy

Atlas is not a utilitarian product. Its primary purpose is to help users freely
explore the world and acquire more agency — not to check off learning objectives
or build a resume.

The central metaphor comes from `docs/Chat.md`: a person's perception of reality
is filtered through a lens made of their senses, experiences, and knowledge. When
they acquire a new knowledge node, the image they can extract from the same
reality gains a new channel — the way an image goes from RG to RGB. Atlas exists
to give people more channels, so the same reality yields more interesting things
to notice and make.

This is why toy projects matter. A toy ray tracer, a handmade plush toy, a
running finish line — the point is not that the artifact is impressive. The point
is that the person holds something they made, and that experience recalibrates
what they believe they are capable of building next.

Atlas should never feel like school before it feels like possibility.

## 2. System Position

```
lumen (perception layer — page-bound Lens cards)
  |
  | Lens as node candidate
  v
Atlas (path-weaving and project layer)
```

A Lens is contextual, personal, and often playful. It does not automatically
become a canonical knowledge node. Atlas can later promote, group, cite, or remix
Lens into reusable path material. The bridge is intentional and slow: lumen
validates participation first; Atlas becomes worth building only if people create
Lens that others want to return to.

## 3. Path Types

Two distinct path shapes emerged from the discussion:

### Vertical paths

A route through a single domain from the user's current state toward a toy
project. Example: from no sewing experience to completing a stuffed toy.

### Horizontal (cross-domain) paths

A route that extracts a small, targeted slice of domain B to illuminate domain
A — not to make the user an expert in B, but to plant a few key seeds that make
A more transparent. Example: a 3D modeler learning the five graph-theory and
rendering concepts that explain why their tools behave the way they do.

Horizontal paths may be Atlas's most distinctive value. No existing learning
platform produces "the graphics knowledge a modeler actually needs" because it
does not fit a course format. But for a real learner, it is often the most useful
thing.

## 4. Node Model

### Nodes describe restorable states, not knowledge labels

A node is not "understands UV unwrapping." It is "can UV unwrap an inorganic
object and bake a clean normal map." The difference: any observer — including the
learner — can verify whether the state has been reached. Self-declared knowledge
claims cannot be verified.

Two valid forms of restorable state:
- **Artifact**: can produce a physical or digital object that meets a concrete
  description
- **Transmission**: can explain a concept clearly enough that another person
  understands it

Both are externally observable. "I read about it" is neither.

### Three dependency types between nodes

Most assumed hard dependencies are actually soft or parallel:

| Type | Meaning | Consequence |
|---|---|---|
| Hard | A is a logical prerequisite for B; reversed order is incoherent | Rare; enforced in the path model |
| Soft | A makes B significantly easier, but B is reachable without A | Common; fork-safe |
| Parallel | A and B are independent; ordering is the author's narrative choice | Very common; both orderings are valid |

The scarcity of hard dependencies means fork freedom is high. Most nodes can be
reordered, substituted, or skipped without breaking the path's logical integrity.
A path author's ordering choice is itself meaningful: two paths that traverse the
same nodes in different orders produce subtly different understanding.

## 5. Path Emergence

A path is primarily a byproduct of the author's own learning process, not a
product designed for an audience.

The natural sequence:
```
read pages → leave Lens as reading annotations
           → Lens accumulate across many pages
           → author looks back and sees a traversal
           → author weaves Lens and external resources into a structured path
           → path is shared, forked, and remixed by others
```

This means the transition from "consumer" to "creator" is not a deliberate role
switch. A person following an existing path will naturally leave Lens at nodes
where the path's coverage is thin. Those Lens become the raw material for a fork.

The first path in Atlas must be real — not a demonstration. It should record an
actual traversal by the author, including where they were confused, what they
skipped, and what they wish they had read first.

## 6. Background Matching

### Matching is by starting point, not difficulty level

Traditional platforms sort by beginner / intermediate / advanced. Atlas sorts by
"where you're coming from." Two paths to the same toy project are not ranked by
quality — they are adapted to different incoming knowledge states.

The path author's background is metadata, not decoration. A path written by a
graphic designer who learned sewing is most useful to other graphic designers
learning sewing, not because it is better, but because its blind spots and
emphases align with theirs.

### User profile

A user's profile is their current set of reached nodes. Profile-building should
be lightweight and progressive:

- On entry: quick scan of concrete node descriptions ("can you do X?") rather
  than abstract domain declarations
- During use: completing a path node automatically adds it to the profile
- Ongoing: Lens activity and browsing behavior provide implicit signal

## 7. Discovery Mechanism

The discovery interface should show users "you are this close":

```
User reached nodes: {A, B, C}
Toy project X requires: {A, B, C, D, E}
Atlas displays: "you are two nodes from X"
```

This directly serves the core philosophy: make distant things look reachable.
Distance alone is not sufficient — the toy project must also match the user's
interests. The recommendation logic is therefore:

1. Filter by projects the user is likely to find compelling (interests, Lens
   activity, declared curiosity)
2. Within that set, surface the ones with the smallest node gap
3. Show the gap explicitly, not just the destination

Early Atlas should rely on manual discovery, search, and social sharing. Matching
algorithms come later, if at all.

## 8. First Prototype Path

**Title:** Graphics fundamentals for 3D modelers

**Type:** Horizontal (cross-domain) path — extracts a targeted slice of computer
graphics to illuminate 3D modeling practice, without requiring the user to become
a graphics engineer.

---

### 8.1 Audience and Starting Point

This path is written for someone with real modeling practice — they have shipped
assets, spent hours wrestling with UV layouts, gotten confused by shading
artifacts, felt uneasy about why a normal map is a particular shade of blue —
but they come from an art or design background, not a technical one. They may
have followed tutorials for years without a conceptual foundation underneath.

Two archetypal users:

**User A — the self-taught game asset artist.** She has made dozens of props,
knows Blender's UV editor well enough to get clean unwraps, and can bake normal
maps reliably by following a checklist. But she cannot explain *why* the checklist
works. When something goes wrong, she tries options until one works. She suspects
there is a layer of understanding she is missing, but "graphics programming"
sounds like a different career.

**User B — the 3D printing hobbyist turned character modeler.** He started
modeling for printing, where topology and textures did not matter. Now he wants
to make textured characters for games. He keeps reading that "topology matters
for games" but every explanation goes directly to edge loops and poles without
explaining what the machine is actually doing with his mesh. He does not know
what question to ask.

Both users share the same gap: they operate the tools but do not have a mental
model of the system those tools are building for. The path's goal is not to close
that gap entirely — it is to plant five key seeds that make the system
transparent enough to reason about.

---

### 8.2 Toy Project

This path does not end with a software artifact. The output is a shift in
perception: the user can now look at a modeling problem and trace it back to
the underlying system behavior.

Concrete markers that the path has been completed:

- Can explain to another modeler why tris count matters and why the limit differs
  between realtime and baked workflows
- Can diagnose a shading artifact (dark band, pinching, odd highlight) and name
  the pipeline stage responsible
- Can read a normal map's color channels and say what the data means
- Can explain seam placement decisions by reference to what UV unwrapping is
  actually solving, not by habit or tutorial instruction

This is a "transmission" toy project: the test is whether the user can convey
the understanding to someone else. That test is harder to fake than "I read
about it."

---

### 8.3 Path Structure

```
[1] Why triangles
      |
      +--[parallel]--+
      |               |
[2] What UV          [3] What a normal vector is
    unwrapping           and why lighting uses it
    solves                      |
                          [hard dep]
                                |
                          [4] What a normal map
                              actually contains
                                |
                          [soft dep (or entry frame)]
                                |
                    [5] The rendering pipeline
                        as a frame for all of the above
```

Node 5 is the one node with positional flexibility. A path author who wants to
give the user a map before the details can place it first. A path author who
wants understanding to accumulate before the frame snaps into place puts it
last. Both orderings are valid. This is an example of how path author narrative
choice is itself meaningful content.

---

### 8.4 Nodes

**Node 1 — Why triangles**

Restorable state: can explain why GPU hardware operates on triangles, why quads
are a modeling convenience that gets triangulated before the GPU sees them, and
why a triangle is the only polygon guaranteed to be planar.

What this unlocks:

- Topology rules (edge loops, poles, n-gons) stop being arbitrary art-department
  preferences and become engineering constraints. The modeler now knows *what*
  they are optimizing for.
- "Tris count" and "poly count" become unambiguous: they are measuring different
  things at different stages of the pipeline.
- The difference between game meshes and sculpts becomes obvious: game meshes
  are budgeted in the GPU's unit; sculpts are not.

Dependencies: none. Entry node. No prior graphics knowledge required.

Example Lens this node needs: a modeler describing the moment they realized
topology rules are not aesthetic preferences — they are constraints imposed by
what happens downstream. Textbooks will say "GPUs use triangles" but rarely
describe the cognitive shift this produces in a working artist.

---

**Node 2 — What UV unwrapping solves**

Restorable state: can explain that UV unwrapping is the problem of mapping a
curved 3D surface onto a flat 2D plane, that this mapping always introduces
distortion or seams (never neither), and that seam placement and stretch
distribution are the modeler's tool for choosing *which* compromise to make.

What this unlocks:

- Seam placement becomes a principled decision, not a guess. The modeler now
  knows seams are not failures — they are the inevitable cut lines of unfolding
  a surface.
- Stretch is legible: some areas of a UV map will always be compressed or
  expanded relative to the 3D surface, and the modeler can now see why and
  choose where to accept it.
- Texture resolution decisions become spatial: parts of the UV island that are
  stretched will appear lower-resolution in the final render because they cover
  more 3D surface per pixel.

Dependencies: parallel to node 3. Both depend on node 1 (without the concept
of a mesh made of triangles, neither UV nor normals have a concrete surface to
attach to), but they do not depend on each other.

Example Lens: "I spent a year placing seams 'where they won't be seen' before
I realized that was optimizing for hiding the problem, not for texture quality.
Once I understood what unwrapping was actually doing, I started placing seams
where the distortion trade-off made the most sense for how the texture would
be read."

---

**Node 3 — What a normal vector is and why lighting uses it**

Restorable state: can explain that a surface normal is a vector perpendicular
to the surface at a given point, and that the rendering pipeline uses this
vector to compute how much light that point receives from a given light source.

What this unlocks:

- Shading artifacts caused by bad normals (dark bands on hard-surface models,
  odd highlights on organic shapes) become diagnosable. The modeler can now
  ask "what is the normal direction at this point, and why?"
- The relationship between face normals and vertex normals becomes legible:
  smooth shading is a technique that interpolates vertex normals to simulate
  surface curvature across flat geometry.
- Node 4 becomes accessible. Normal maps cannot be understood without first
  understanding what a normal is.

Dependencies: parallel to node 2.

Example Lens: "The first time I understood that shading is computed per-vertex
(or per-fragment) using a direction vector, I immediately understood why my
hard-surface model had that weird gradient across the flat face. The normals
on the edge vertices were being averaged with adjacent face normals. Suddenly
I knew exactly what to do: mark the edge as sharp."

---

**Node 4 — What a normal map actually contains**

Restorable state: can explain that a normal map stores surface normal direction
vectors encoded as RGB color values — it is data, not a picture for human eyes —
and can read the primary color bands (solid blue = normals pointing straight
out; red/green shift = surface tilt direction).

What this unlocks:

- "Why is the normal map blue?" has a real answer, not a mystery.
- Baking becomes legible: the bake process is computing normal direction at
  each texel of the low-poly mesh and writing those directions as color data.
- Mirroring artifacts become diagnosable: mirroring a mesh without adjusting
  the normal map means the stored direction data points the wrong way on the
  mirrored side.
- Tangent space vs. object space normal maps become distinguishable concepts.

Dependencies: hard dependency on node 3. The concept of "encoded normal
directions" is incoherent without first knowing what a normal direction is.

Example Lens: a modeler describing the moment they realized a normal map is
a data buffer, not a decorative texture — and what changed in how they
diagnosed baking problems after that.

---

**Node 5 — The rendering pipeline as a frame for modeling decisions**

Restorable state: can trace the rough sequence from mesh data in the modeling
tool to pixels on screen and name which stage of the pipeline each modeling
concern belongs to (geometry → vertex transform → rasterization → fragment
shading → output).

What this unlocks:

- "Expensive" and "free" effects become legible: alpha transparency is expensive
  because it breaks rasterization order assumptions; vertex color is free because
  it is already on the GPU at geometry stage.
- Material parameters in a PBR shader map to specific fragment-stage operations.
  The modeler no longer treats material sliders as magic.
- The earlier nodes snap into a unified frame: triangulation happens at geometry
  stage, UV data is carried per-vertex to the fragment stage, normals are used
  at fragment shading.

Dependencies: soft dependency on nodes 1–4. Placing this node last gives it
the function of synthesis — the earlier nodes become connected rather than
isolated facts. Placing it first gives it the function of orientation — the user
has a map before the details. Both are valid; the choice is the path author's
narrative preference.

---

### 8.5 Lens Role in This Path

The Lens that matter most on this path are not concept summaries — those exist
in textbooks, tutorials, and Wikipedia. The Lens that are irreplaceable are the
ones only producible by someone who has made the crossing from practice-without-
understanding to practice-with-understanding:

- "I modeled for three years and never noticed this was why X kept happening.
  Once I understood node 3, I looked at my old work and immediately saw it."
- "The standard explanation for this is technically correct but the intuition
  it builds is wrong. Here is the framing that actually helped me."
- "This article explains node 2 well but has a subtle error in the section on
  tangent space. Here is what it should say."
- "I had a specific artifact — [description] — and I now know it was a node 4
  problem. If you are seeing this, here is the diagnosis."

A Lens authored by someone who went from confused modeler to understanding is
worth more than a technically superior explanation written by a graphics engineer
who never experienced the confusion. Both have a place; only one is irreplaceable.

---

### 8.6 Path Analysis

**Why this path is horizontal, not vertical:**
The user does not need to become a graphics programmer. They need five concepts
that make their existing tools transparent. A vertical path through "intro to
graphics" would include linear algebra, rasterization algorithms, shader
languages, and dozens of other nodes the modeler does not need. The horizontal
path is a surgical extraction: take exactly the pieces of domain B that illuminate
domain A, and stop.

**Why the audience is narrower than it first appears:**
"3D modelers" is a broad category. This path is calibrated for modelers who work
with real-time assets (games, VR, interactive) rather than pure VFX or 3D
printing. A VFX modeler's mental model of "what the renderer does" is different;
a 3D printing hobbyist does not care about normals or UVs at all. The path's
value is in its precision, not its breadth.

**What this path tests about Atlas:**
- Node description format: do these five nodes read as clear, verifiable states?
- Dependency notation: is the parallel/soft/hard distinction legible without a
  legend?
- Toy project definition: does a "transmission" output (explain it to someone
  else) feel as concrete as an artifact output?
- Lens framing: do path authors understand what kind of Lens to solicit or create?

These are the questions the first prototype path is designed to expose. The
content is secondary; the structural test is primary.

## 9. Node Ontology — A Deeper Exploration

Status note: This section records a long, speculative conversation (2026-06)
about what a node could *ultimately* be. It is long-horizon backend theory, not a
current beta build target. Per `docs/project-status.md`, matching algorithms are deferred
("later, if at all") and there is a hard non-negotiable against AI-authored
knowledge nodes. The near-term node remains what Section 4 describes: a
hand-authored restorable-state description with attached Lens/instances. Read
this section as "the attractor we are pointing at," not "the thing to build."

### 9.1 From fixed items to a continuous footprint field

The recurring instinct was to make nodes fuzzy rather than discrete, because real
knowledge has no crisp atomic boundaries. In measure-theoretic terms this becomes
precise: in a non-atomic measure space, single points carry zero measure — only
regions have substance. So an "absolute knowledge point" is a measure-zero ideal
(a regulative ideal, like "true value" in measurement theory): it may not exist,
but positing it and approximating it from many directions organizes everything. A
node is then a *region* in a shared capability field, and mastery is a *measure*
over that field, not a boolean.

### 9.2 The Atlas is literally an atlas

If the knowledge field is a curved manifold, no single global coordinate system
(no canonical universal curriculum) can cover it faithfully — just as no single
flat map covers a sphere. You need an *atlas* of local *charts* with *transition
maps* on overlaps:

- a learner's path/background = a local chart
- cross-background translation (fork, remix, matching) = a transition map
- multiple paths to the same goal = a topological necessity, not redundancy

This is the strongest argument for "many paths, no universal path," and it
re-derives from geometry what Section 6 says about matching-by-starting-point.

### 9.3 Knowledge is non-additive

Ordinary measures are additive on disjoint sets; knowledge has synergy (A and B
together unlock more than the sum). The right object is therefore a *capacity* (a
monotone, non-additive set function), not a plain measure. Consequence: mastery
can never be scored by summing node-credits. The "seed" metaphor lives here — a
shallow cross-domain acquaintance is a small-but-positive-measure region that
synergy later amplifies.

### 9.4 Two levels: shared backend truth, lossy observer-relative frontend

The reconciling architecture that survived every angle:

- **Backend**: the continuous capacity field — shared, slow, convergent. (A
  "classical scaffold" / a frozen shared base representation.)
- **Frontend**: discrete, human-legible nodes rendered *for a specific viewer* —
  a lossy, observer-relative projection of the field.

The projection was likened to quantum measurement: which basis (which nodes to
slice the field into) depends on the viewer's own background, and the readout is
a collapsed sample, not the backend truth. Caveat kept explicit: this analogy is
load-bearing only if knowledge operations are genuinely *non-commutative* — if
learning A-then-B differs irreducibly from B-then-A. Path-order dependence is the
candidate evidence; without it, this is ordinary Bayesian uncertainty in a
quantum costume. (Disanalogies noted: knowledge is copyable — no no-cloning
theorem; rendering is not strongly destructive.)

### 9.5 The base-measure problem

There is no canonical, value-neutral measure on a bare capability space. A
composite was considered (population frequency + like-rate + AI judgment +
background-correlation weighting). The organizing principle that emerged:

- keep ONE least-value-loaded "extent" measure as the shared substrate (it
  defines the shared geometry and must stay stable),
- put value and relevance as *separate, explicit, auditable overlays* chosen at
  render time — never baked into the base geometry.

Per-signal warnings, since each encodes a value: frequency → majoritarian, buries
rare-but-deep; like-rate → rewards palatable over correct (the RLHF sycophancy
failure) and causes rich-get-richer; AI judgment → ossifies current consensus and
re-centralizes epistemic authority (conflicts with "no authority defines
knowledge"); background-correlation → most aligned with the philosophy but risks
homophily/echo-chambers that fragment global connectivity (the signal best suited
to "nearest background" is also the one most corrosive to "one global map").

### 9.6 How a node might be constructed (technique families)

Three philosophies, staged by data availability:

- **Node as its instances** (non-parametric / retrieval): no parameters; the node
  = its grounding instances + a similarity kernel, reconstructed on demand.
  Maximally malleable, cold-start-proof, but does not converge to a compact
  object. The honest early-stage answer.
- **Node as a latent variable** (probabilistic): the established homes are Item
  Response Theory and Knowledge Tracing (BKT/DKT) — decades-old fields for
  exactly "fuzzy, evolving, grounded skill mastery." Mastery = a posterior
  (variance = the seed). Borrow their vocabulary *and* their known failure modes
  (classic versions assume predefined, independent skills — which fights the
  fuzzy/emergent view).
- **Node as a geometric region** (spectral / diffusion maps): most faithful to
  the manifold + measure ontology; soft clusters = fuzzy nodes; the diffusion
  operator's invariant measure = the base measure. Costly (transductive) and
  hides the base-measure choice inside the similarity kernel.

Grounding is mandatory in all three: a representation learned from pure
co-occurrence is circular; it must be anchored by observable outcomes
(toy-project completion, successful transmission). Staging: hand-authored symbol +
retrieval (early) → IRT / matrix factorization (mid) → diffusion / deep knowledge
tracing + neuro-symbolic alignment back to legible labels (mature).

### 9.7 Identity vs. form — the load-bearing distinction

The most important result of the conversation. "Nodes should be malleable"
conflates two different variabilities:

- **Route variability** (which prerequisites, what order) belongs to the *path*.
  It is fully solved by many paths composing the *same* fixed-identity nodes
  differently. It does NOT require malleable nodes.
- **Framing variability** (a designer's "normal" vs a mathematician's "normal" —
  same concept, different entry intuition and emphasis) is the only thing that
  genuinely needs node plasticity — and even then, only the node's *form* is
  plastic, not its *identity*.

Hard line: if a node loses cross-path *identity* (becomes purely path-constituted
with no shared referent), Atlas loses "you are N nodes from X," background
matching, Lens reuse, and the ability to say two people learned "the same thing"
by different routes. That shared identity is the only thing separating Atlas from
a folder of unrelated tutorials; transition maps (9.2) require overlapping charts
to describe the same underlying manifold. Therefore: **malleability lives in the
rendering/adapter (form); identity and location live in the shared field.** Same
two-level structure as 9.4, re-derived from the learner's side.

Reframed breakthrough: the failing design unit is "an authored path" (or a fixed
node). A better unit is the pair **(starting background → toy project)**; route
and node-form are composed/adapted per pair over the shared grounded field, while
node identity stays shared. Two hard constraints: (1) it is a matching/composition
system, explicitly deferred by project status; (2) the composition must stay
human-authored — many people write many partial charts and the system matches and
stitches existing human charts; it must not AI-generate node content
(non-negotiable).

Scoping caveat: individual difference is modeled here *only* as difference in
prerequisite background, because that is the part node structure can represent.
Motivation, aptitude, time, and thinking style are real, orthogonal differences
that should not be forced into node structure.

### 9.8 Unresolved after this session

Fuzzy nodes threaten reproducibility/copyability — the property that made the
"open-source knowledge" premise work in the first place. The user believes this
line of thinking has further form and value not yet articulated; it is
deliberately left open. The realism fork also remains open: preserve shared
cross-path node identity (keeps Atlas a global map; the recommended side) vs.
fully path-constituted nodes (more faithful to radical individual difference, but
collapses Atlas toward a tutorial folder).

## 10. Open Questions

These are unresolved and should not be treated as decisions:

1. **Cold start experience.** Before any paths exist, what does a new user see
   and do? The first path must be real, but the creation tool's minimum viable
   form is undefined.

2. **Node identity and reuse.** If "can UV unwrap an inorganic object" appears in
   multiple paths, is it the same node or a copy? Shared node identity enables
   cross-path traversal graphs; copies are simpler to implement but fragment the
   network.

3. **Horizontal path discovery.** A modeler does not know to search for
   "graphics concepts for modelers." How does Atlas surface the cross-domain
   path to someone who does not know it exists?

4. **Physical resource layer.** For non-digital toy projects (sewing, cooking,
   physical electronics), "what to learn" and "what to use" are equally important
   barriers. Atlas's relationship to shared physical resources (makerspaces,
   lending tools, local groups) is undefined.

5. **Salon and offline community.** The original vision in `docs/Chat.md`
   includes small-group sharing sessions built around toy projects. The
   relationship between Atlas digital paths and offline gathering is unexplored.

6. **Reproducibility of fuzzy nodes.** See 9.8. Fuzzy, observer-relative nodes
   risk losing the copyability that underwrites the open-source-knowledge premise.
   There is believed to be unstated form and value in this idea still to recover.

7. **The realism fork.** See 9.7 and 9.8. Shared cross-path node identity
   (recommended) vs. fully path-constituted nodes with no shared referent.

8. **The neutral-ish base-measure substrate.** See 9.5. Traversal frequency
   (lively but majoritarian) vs. topological reachability/support (near
   value-neutral but low-information).
