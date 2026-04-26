# Lumen Seed Webpages for Lens Experiments

Date: 2026-04-25
Status: Candidate pool v0.1

## Selection Criteria

A good Lumen experiment page should satisfy several of these:

- Has dense ideas, metaphors, diagrams, formulas, code, or strong opinions.
- Contains many anchorable text spans, headings, examples, and claims.
- Supports both entertainment Lens and knowledge Lens.
- Is publicly accessible and stable enough for browser annotation experiments.
- Has visible friction points: confusing concepts, controversial claims, common mistakes, funny phrasing, or real-world analogies.
- Represents a distinct page archetype: article, visual lesson, technical doc, book chapter, PDF, company engineering blog, or public essay.

## Recommended First 16 Pages

These are the best first batch because they cover very different Lens use cases.

### AI / Deep Learning

1. The Illustrated Transformer — Jay Alammar
   - URL: https://jalammar.github.io/illustrated-transformer/
   - Why: classic visual ML explanation; great for diagram, concept, analogy, and confusion Lens.
   - Lens examples: Q/K/V explainer, “matrix soup” joke, attention poll, architecture map.

2. The Annotated Transformer — Harvard NLP
   - URL: https://nlp.seas.harvard.edu/annotated-transformer
   - Why: paper + code + commentary; useful for testing code-adjacent Lens.
   - Lens examples: code note, formula question, paper annotation, training detail.

3. What are Diffusion Models? — Lilian Weng
   - URL: https://lilianweng.github.io/posts/2021-07-11-diffusion-models/
   - Why: long conceptual survey with formulas and diagrams.
   - Lens examples: noise process, score matching, sampling intuition, formula breakdown.

4. A Recipe for Training Neural Networks — Andrej Karpathy
   - URL: https://karpathy.github.io/2019/04/25/recipe/
   - Why: extremely practical; ideal for funny “debugging pain” and checklist Lens.
   - Lens examples: overfit-one-batch challenge, training superstition joke, debugging checklist.

### Systems / Engineering

5. Addressing Cascading Failures — Google SRE Book
   - URL: https://sre.google/sre-book/addressing-cascading-failures/
   - Why: production failure concepts; strong for incident, reliability, and tradeoff Lens.
   - Lens examples: cascading failure, deadline, fail-fast poll, “health check killed the service” joke.

6. The Tail at Scale — Jeff Dean & Luiz André Barroso
   - URL: https://barroso.org/publications/TheTailAtScale.pdf
   - Why: p99/p999 latency is a perfect “aha” topic.
   - Lens examples: average latency trap, hedged request debate, fanout visualization.

7. Life Beyond Distributed Transactions — ACM Queue
   - URL: https://queue.acm.org/detail.cfm?id=3025012
   - Why: distributed systems worldview shift; great for debate Lens.
   - Lens examples: Saga vs 2PC poll, entity/activity distinction, eventual consistency explainer.

8. Things You Should Never Do, Part I — Joel on Software
   - URL: https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/
   - Why: rewrite-vs-refactor controversy; ideal for entertainment and poll Lens.
   - Lens examples: legacy archaeology joke, rewrite poll, hidden business logic knowledge Lens.

### Math / Visual Explanation

9. Fourier Transform — 3Blue1Brown
   - URL: https://www.3blue1brown.com/lessons/fourier-transforms/
   - Why: visual metaphor + formula bridge; excellent for anchored visual Lens.
   - Lens examples: winding metaphor, center-of-mass explainer, frequency-domain aha.

10. Bayes Theorem — 3Blue1Brown
    - URL: https://www.3blue1brown.com/lessons/bayes-theorem
    - Why: common misconception-rich; perfect for “prior/likelihood/posterior” Lens.
    - Lens examples: base-rate trap, conditional flip, diagnostic poll.

11. A Visual Exploration of Gaussian Processes — Distill
    - URL: https://distill.pub/2019/visual-exploration-gaussian-processes
    - Why: interactive visual explanation with advanced concepts.
    - Lens examples: uncertainty band, kernel intuition, Bayesian update.

12. Conditional Probability Explained Visually — Setosa
    - URL: https://setosa.io/conditional/
    - Why: small, focused, visual; good first target for dense Lens placement.
    - Lens examples: denominator shift, area model, misconception marker.

### Public Essays / Culture / Product

13. 1,000 True Fans — Kevin Kelly
    - URL: https://kk.org/thetechnium/1000-true-fans/
    - Why: clear business model claim; easy to annotate and debate.
    - Lens examples: creator economy lens, “number magic” poll, long-tail comparison.

14. Do Things that Don’t Scale — Paul Graham
    - URL: https://paulgraham.com/ds.html
    - Why: startup/product classic with many memorable claims.
    - Lens examples: PMF lens, founder folklore joke, manual-work challenge.

15. The Curse of Knowledge — Harvard Business Review
    - URL: https://hbr.org/2006/12/the-curse-of-knowledge
    - Why: cross-domain cognitive bias; good for product, writing, teaching Lens.
    - Lens examples: expert blind spot, product copy challenge, “explain to a beginner” Lens.

16. Politics and the English Language — George Orwell
    - URL: https://www.george-orwell.org/Politics_and_the_English_Language/
    - Why: language, power, jargon, PR-speak; extremely Lens-friendly.
    - Lens examples: jargon translator, euphemism detector, writing challenge, satire Lens.

## Page Archetype Coverage

- Visual ML blog: Jay Alammar
- Code/paper hybrid: Annotated Transformer
- Long survey: Lilian Weng
- Practical engineering essay: Karpathy recipe
- Reliability doc/book chapter: Google SRE
- Academic PDF: The Tail at Scale
- Distributed systems opinion: ACM Queue
- Classic engineering culture essay: Joel on Software
- Math visualization: 3Blue1Brown
- Interactive explainer: Distill / Setosa
- Product/business essay: Kevin Kelly / Paul Graham
- Cognitive bias / writing / culture: HBR / Orwell

## Suggested Experiment Order

### Round 1: Easiest Visual Win

- The Illustrated Transformer
- Fourier Transform / 3Blue1Brown
- 1,000 True Fans
- Things You Should Never Do

Goal: prove Lens can be fun, beautiful, and useful on very different pages.

### Round 2: Technical Depth

- Addressing Cascading Failures
- A Recipe for Training Neural Networks
- Life Beyond Distributed Transactions
- What are Diffusion Models?

Goal: test technical knowledge Lens, debate Lens, and practical checklist Lens.

### Round 3: Interaction / Visual Anchoring

- Gaussian Processes / Distill
- Conditional Probability / Setosa
- Bayes Theorem / 3Blue1Brown
- The Annotated Transformer

Goal: test diagrams, code, formulas, and interactive pages.

### Round 4: Social / Entertainment

- Do Things that Don’t Scale
- The Curse of Knowledge
- Politics and the English Language
- Premium Mediocre, optional: https://www.ribbonfarm.com/2017/08/17/the-premium-mediocre-life-of-maya-millennial/

Goal: test jokes, polls, live-room debate, cultural commentary, and shareable Lens.

## Notes

- PDF pages should be treated as later-stage experiments unless the extension/browser app has PDF anchoring support.
- Interactive pages may need element-level anchors, not only text selection.
- For early demos, prefer pages with stable HTML and long-lived URLs.
- Use official/public pages only; avoid login-walled or highly dynamic pages in the first batch.
