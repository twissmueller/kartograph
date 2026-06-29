# Prompt: Design system for the Kartograph "Tracking" view

> Paste everything below the line into your design tool (v0, Lovable, Figma AI, Claude, etc.).
> It is self-contained — it explains the product, the screen, the data, and the visual direction,
> and asks for a reusable **design system**, not just one screen.

---

You are a senior product designer. Create a **design system** (design tokens + component
specs) for a desktop app called **Kartograph**, then apply it to its main screen, the
**Tracking view**. Deliver tokens first (color, typography, spacing, radius, elevation,
motion), then the components, then the assembled screen. Keep it cohesive and reusable.

## What Kartograph is

Kartograph keeps a **living map of what a software product does**. The behaviour of the
system is written as plain-language, user-walkable **scenarios** (think: "Given the
organization has not yet claimed the domain, when the admin claims it, then the domain is
awaiting verification"). A non-technical stakeholder reads these scenarios and confirms them
against the running product. The Tracking view is where someone watches the whole product
come to life, scenario by scenario.

The audience is a mix of technical and **non-technical** people (product owners, founders,
domain experts). The tone should feel **clear, calm, and human — simple but not cold or
clinical.** Approachable, with warmth.

## The structure being displayed (the browser)

Everything is organised as a three-level tree the user browses on the left:

- **Context** — a broad area of the product (e.g. "Admin Console", "Identity & Access").
- **Capability** — a cohesive ability within a context (e.g. "Domain Management").
- **Feature** — a file of related scenarios within a capability (e.g. "Domain verification").
- (and inside a feature: the individual **scenarios**.)

Each node is collapsible. Selecting a Context/Capability/Feature filters the detail pane on
the right to that node.

**Copyable slugs — important, keep this prominent.** Every Context, Capability, Feature, and
Scenario has a short machine identifier ("slug", e.g. `domain-management`,
`domain-management/verify.feature#"Claim a domain"`). The user **loves being able to copy these
with one click** — they paste them to point an AI or a teammate at an exact item. Design a
small, tasteful **"copy ID" chip/affordance** that sits next to each node's name, shows the
slug, and copies it on click with clear "copied!" feedback. It should be glanceable but never
shout over the human-readable name.

## The two dimensions to make visible

This screen must let the user read **two independent dimensions at once** for every
capability/feature/scenario:

### Dimension 1 — Maturity (how thoroughly the behaviour is specified)
Each scenario covers one **path**, shown by a tag:
- `@happy` — the normal, everything-goes-right path
- `@edge` — boundary / unusual-but-valid conditions
- `@error` — failure handling

Maturity climbs as more paths are covered (cumulatively): happy only → in progress; happy +
edge → more mature; happy + edge + error → fully hardened. Design a compact, **at-a-glance
maturity indicator** (e.g. a three-segment meter or three small path pips: happy / edge /
error, filled when that path exists) that can sit on a capability or feature header. Give the
three paths their own consistent accent treatment (happy = calm/positive, edge = caution,
error = alert) — but keep them harmonious within the blue-anchored palette below, not a loud
traffic-light.

### Dimension 2 — Development progress (how far a scenario has actually been built)
Independent of maturity, each **scenario** has exactly one of **three** progress states:
- **Open** — not built yet
- **Developed** — built and ready for the user to walk through and confirm
- **Accepted** — the user has walked it and confirmed it works

(There are exactly these three — no "in progress"/"WIP" state.) Design a **segmented control**
(three options) on each scenario row so the user can set the state by clicking. Make the
**current** state obviously selected. The progression Open → Developed → Accepted should feel
like forward motion. Also design small **roll-up indicators** for features and capabilities:
a status dot + an `accepted / total` count (e.g. "7 / 12"), so a collapsed node still
communicates how far along it is.

Crucially, the two dimensions are **orthogonal** and must be readable together: a feature can
be fully mature (all three paths specified) yet mostly Open (not built), or fully Accepted yet
only happy-path. Don't conflate them into one bar.

## The detail pane (right side)

When a capability or feature is selected, show its **features as cards**. Each card header:
feature name + copy-ID chip + the maturity indicator + the `accepted / total` roll-up. Inside
the card, list **scenarios**, each with:
- a left accent indicating its path class (happy / edge / error),
- the path tag(s),
- the scenario name + its copy-ID chip,
- the Gherkin steps (Given/When/Then), shown in a calm monospaced block,
- the three-state segmented control (Open / Developed / Accepted).

Above the cards: a **search field** (filter scenarios by text) and **path-tag filters**
(toggle @happy / @edge / @error), plus a "Raw" toggle to view the underlying file text.

## Visual direction (please honour these)

- **Blue is the primary brand colour.** Build the palette around a confident, friendly blue as
  the anchor. Provide a full ramp (50–900) plus semantic roles (primary, accent, success,
  caution, danger, surface, border, text). Keep success/caution/danger gentle and harmonious
  with the blue, not garish.
- **Simple but warm, not cold.** Soft neutrals (avoid stark pure-white/pure-black and harsh
  greys), gentle rounded corners, soft shadows/elevation, generous whitespace, a little
  warmth in the neutrals. Friendly, not corporate-sterile.
- **Comfortable, generously sized typography — do not use small fonts.** Set a readable base
  body size (≈16px minimum; lean larger for primary text) and a clear, restrained type scale.
  Choose a humanist, approachable sans-serif for UI text and a comfortable monospaced face for
  the Gherkin steps and slugs. Strong, legible hierarchy.
- Provide **light and dark** themes from the same tokens (dark optional but appreciated).
- Mind **accessibility**: WCAG-AA contrast, visible focus states, keyboard-operable tree and
  segmented control, and never rely on colour alone (pair the maturity/path and progress cues
  with shape, label, or icon).

## Deliverables

1. **Design tokens** — color ramps + semantic roles, type scale + font choices, spacing scale,
   radii, elevation/shadows, and motion/easing. Show them explicitly (as a table or token list).
2. **Component specs** with their states (default / hover / selected / focus / disabled):
   the **copy-ID chip**, the **maturity indicator**, the **three-state segmented control**,
   the **status dot + roll-up count**, the **collapsible tree row**, the **scenario card**,
   and the **search + tag-filter bar**.
3. The assembled **Tracking view** using those components, populated with realistic sample data
   (a couple of contexts, several capabilities/features, a mix of maturities and Open/Developed/
   Accepted states) so the two dimensions are visible together.
4. A short rationale for the palette and type choices.

Lead with the tokens, keep the system small and coherent, and make the result feel like a tool
a non-technical person would actually enjoy using.
