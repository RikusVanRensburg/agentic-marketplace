# UI Prototype

Generate **several radically different UI variations** on a single route, switchable from a floating bottom bar. The user flips between variants in the browser, picks one (or steals bits from each), then throws the rest away.

## Where the variants live

Mount them in a **host page** — a page the app already has, with its real header, sidebar, data, and density — gated by a `?variant=` URL search param. The existing data fetching, params, and auth all stay; only the rendered subtree swaps. Something that has no page of its own yet but would naturally live inside one (a new dashboard section, a new card on the settings screen, a new step in an existing flow) still mounts in its host page.

Reach for a **throwaway route** only when there is no page that could host the variants — an entirely new top-level surface, or a flow that can't be embedded anywhere sensible. The host page is what makes a design judgeable: every variant looks fine in a vacuum, and the app around it is what exposes the problems. When you do need the route, follow whatever routing convention the project already uses, and put `prototype` in the path or filename so a casual reader can see what it is.

The floating switcher is identical either way.

## Process

### 1. State the question and pick N

Default to **3 variants**. More than 5 stops being radically different and starts being noise — cap there.

Write down the plan in one line, in the prototype's location or a top-of-file comment:

> "Three variants of the settings page, switchable via `?variant=`, on the existing `/settings` route."

### 2. Generate radically different variants

Draft each variant. Hold each one to:

- The page's purpose and the data it has access to.
- The project's component library / styling system (TailwindCSS, shadcn, MUI, plain CSS, whatever).
- A clear exported component name, e.g. `VariantA`, `VariantB`, `VariantC`.
- Its own layout. Share only leaf components — a shared `<Header>` is fine, a shared `<Layout>` defeats the point, because throwing out the layout is exactly what a variant is free to do.
- Read-only behaviour. Variants render; any action that would write points at a stub. The question is what this should look like, not whether the backend works.

Variants must be **structurally different** — different layout, different information hierarchy, different primary affordance, not just different colours or copy. Three slightly-tweaked card grids isn't a UI prototype, it's wallpaper. If two drafts come out too similar, redo one under an explicit structural constraint ("lead with a table", "put the primary action in a left rail").

### 3. Wire them together

Create a single switcher component on the route:

```tsx
// pseudo-code — adapt to the project's framework
const variant = searchParams.get('variant') ?? 'A';
return (
  <>
    {variant === 'A' && <VariantA {...data} />}
    {variant === 'B' && <VariantB {...data} />}
    {variant === 'C' && <VariantC {...data} />}
    <PrototypeSwitcher variants={['A','B','C']} current={variant} />
  </>
);
```

Existing data fetching stays above the switcher; only the subtree below it changes per variant.

### 4. Build the floating switcher

A small fixed-position bar at the bottom-centre of the screen with three pieces:

- **Left arrow** — cycles to the previous variant (wraps around).
- **Variant label** — shows the current variant key and, if the variant exports a name, that name too. e.g. `B — Sidebar layout`.
- **Right arrow** — cycles forward (wraps around).

Behaviour:

- Clicking an arrow updates the URL search param (use the framework's router — `router.replace` on Next, `navigate` on React Router, etc) so the variant is shareable and reload-stable.
- `←` and `→` cycle too — skipped while an `<input>`, `<textarea>`, or `[contenteditable]` has focus.
- Visually distinct from the page (e.g. high-contrast pill, subtle shadow) so it's obviously not part of the design being evaluated.

Keep it in one component, wherever shared UI lives in the project.

### 5. Hand over

Hand over the way [SKILL.md](SKILL.md) describes — for this branch, "how to reach it" is the URL plus the `?variant=` keys.

The user flips through whenever they get to it. The interesting feedback is usually **"I want the header from B with the sidebar from C"** — that's the actual design they want.

When the verdict lands, the winner is folded into the real code and rewritten to production standards, since it was drafted under prototype constraints: into the host page if it has one, or promoted to a real route if it doesn't. The losing variants and the switcher come out of main and stay on the throwaway branch — the full set of variants is the primary source, and variants left behind in main rot fast and confuse the next reader.
