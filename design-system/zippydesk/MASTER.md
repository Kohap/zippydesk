# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** zippyDesk
**Generated:** 2026-08-19 18:06:44
**Regenerated:** 2026-08-19 (design review — palette synced to shipped code)
**Category:** Fintech/Crypto
**Design Dials:** Variance 5/10 (Balanced / Modern) | Motion 6/10 (Standard) | Density 7/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Ink (bg) | `#0a0e15` | `--color-ink` |
| Panel | `#10161f` | `--color-panel` |
| Panel 2 | `#151d28` | `--color-panel-2` |
| Panel 3 | `#1c2634` | `--color-panel-3` |
| Line | `rgba(153,168,186,.1)` | `--color-line` |
| Line strong | `rgba(153,168,186,.18)` | `--color-line-strong` |
| Text | `#f1f5f9` | `--color-ink-text` |
| Muted text | `#9fb0c1` | `--color-ink-muted` |
| Faint text (warns: ≥4.5:1) | `#7d8fa3` | `--color-ink-faint` |
| Brand / primary | `#00799c` | `--color-ocean` |
| Brand accent | `#00bfa6` | `--color-aqua` |
| Bright accent | `#37e2c6` | `--color-aqua-bright` |
| Success | `#3ecf97` | `--color-good` |
| Warning | `#f2b44c` | `--color-warn` |
| Destructive | `#f0565b` | `--color-bad` |
| Info | `#4da5e4` | `--color-info` |

**Color Notes:** Deep ocean → aqua gradient on night ink. One hue family only; no gold/purple. Brand bands use `gradient-brand` (`#005f85 → #00799c → #00bfa6`).

### Typography

- **Heading Font:** IBM Plex Sans
- **Body Font:** IBM Plex Sans
- **Data/Mono Font:** IBM Plex Mono — financial numerals, order IDs, references, timestamps (`.data` / `.money` classes, tabular-nums)
- **Mood:** financial, trustworthy, professional, corporate, banking, serious
- **Google Fonts:** [IBM Plex Sans + IBM Plex Mono](https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap)

**CSS Import (FIRST line of globals.css):**
```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');
```

### Spacing Variables

*Density: 7/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button — .btn-brand */
.btn-primary {
  background-image: linear-gradient(135deg, #0085ab 0%, #00bfa6 100%);
  color: #ffffff;
  border-radius: 8px;
  font-weight: 600;
  box-shadow: 0 1px 0 0 rgba(255, 255, 255, 0.12) inset, 0 8px 20px -12px rgba(0, 191, 166, 0.55);
  transition: background 150ms ease;
  cursor: pointer;
}
.btn-primary:hover { background-image: linear-gradient(135deg, #0090ba 0%, #12cdb1 100%); }
.btn-primary:active { background-image: linear-gradient(135deg, #006f92 0%, #00a88f 100%); box-shadow: none; }
.btn-primary:disabled { opacity: 0.45; cursor: not-allowed; }

/* Secondary Button — .btn-ghost */
.btn-secondary {
  background: transparent;
  color: #f1f5f9;
  border: 1px solid rgba(153, 168, 186, 0.18);
  border-radius: 8px;
  font-weight: 600;
  transition: background 150ms ease;
  cursor: pointer;
}
.btn-secondary:hover { background: #151d28; }
.btn-secondary:active { background: #1c2634; }
.btn-secondary:disabled { opacity: 0.45; cursor: not-allowed; }
```

### Cards

```css
.card {
  background: linear-gradient(180deg, #10161f 0%, color-mix(in srgb, #10161f 92%, #0a0e15) 100%);
  border: 1px solid rgba(153, 168, 186, 0.1);
  border-radius: 12px;
  box-shadow: 0 1px 0 0 rgba(255, 255, 255, 0.02) inset, 0 10px 24px -18px rgba(0, 0, 0, 0.8);
}
/* Elevated: balance/hero surfaces -> .card-elevated (panel-2 gradient, stronger shadow) */
/* Brand band: balance heroes -> .brand-band (ocean->aqua gradient, surface-grid texture) */
```

### Inputs

```css
.input {
  background: #10161f;
  border: 1px solid rgba(153, 168, 186, 0.18);
  border-radius: 8px;
  color: #f1f5f9;
  transition: border-color 200ms ease;
}

.input:focus-visible {
  border-color: #00bfa6;
  outline: 2px solid #00bfa6;
  outline-offset: 2px;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Minimalism & Swiss Style

**Keywords:** Clean, simple, spacious, functional, white space, high contrast, geometric, sans-serif, grid-based, essential

**Best For:** Enterprise apps, dashboards, documentation sites, SaaS platforms, professional tools

**Key Effects:** Subtle hover (200-250ms), smooth transitions, sharp shadows if any, clear type hierarchy, fast loading

### Page Pattern

**Pattern Name:** Trust & Authority + Conversion

- **Conversion Strategy:** Security badges. Case studies. Transparent pricing. Low-friction form. Provide pause/stop and stop the logo carousel on focus, hover, and reduced motion. Previous/next controls provide the keyboard equivalent; pause offscreen/hidden and render a static logo set under reduced motion.
- **CTA Placement:** Contact Sales / Get Quote (primary) + Nav
- **Section Order:** Hero (mission/credibility) > Proof (logos, certs, stats) > Solution overview > Clear CTA path

---

## Motion

**Stagger List** (Standard) — Trigger: load or scroll | Duration: 300-450ms | Easing: `back.out(1.4)`

```js
gsap.from('.grid-item', { opacity: 0, scale: 0.92, y: 16, duration: 0.4, stagger: { each: 0.06, from: 'start', grid: 'auto' }, ease: 'back.out(1.4)' });
```

**Framework notes:** grid: 'auto' lets GSAP infer rows/columns from a CSS grid layout for a natural wave stagger; Use matchMedia('(prefers-reduced-motion: reduce)') to skip non-essential motion and render the final state immediately

- ✅ Combine with from: 'center' for a bento-grid layout to draw the eye inward first
- ❌ Don't use back.out on dense data tables; the overshoot reads as sloppy on informational UI
- ⚡ Group DOM writes; avoid interleaving layout reads (getBoundingClientRect) between staggered tweens

---

## Anti-Patterns (Do NOT Use)

- ❌ Playful design
- ❌ Unclear fees
- ❌ AI purple/pink gradients (ocean→aqua is the only allowed accent gradient)

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Dark mode only: text contrast 4.5:1 minimum (ink-faint ≥ 4.5:1 on ink)
- [ ] Focus states visible for keyboard navigation (`:focus-visible` outline, aqua)
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile
