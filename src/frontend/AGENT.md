# Champ Design System

Dark, tactical, military-tech HUD aesthetic. High contrast. Sharp geometry. Scanline and grid overlays for atmosphere. Accent glow on interaction.

## Color Tokens (CSS Variables)

All colors defined as CSS custom properties on `:root` in `globals.css`. Always reference via `var(--clr-*)` — never hardcode hex.

| Token | Value | Usage |
|---|---|---|
| `--clr-bg` | `#0a0c10` | Page background |
| `--clr-surface` | `#111318` | Card / panel backgrounds |
| `--clr-surface-2` | `#181b22` | Nested surfaces, code blocks |
| `--clr-border` | `#1e2230` | Default borders |
| `--clr-border-accent` | `#2a3045` | Emphasized borders, dividers |
| `--clr-text` | `#e8eaf0` | Primary text |
| `--clr-text-dim` | `#8890a4` | Secondary / body text |
| `--clr-accent` | `#00e5a0` | Primary accent (green) |
| `--clr-accent-dim` | `rgba(0, 229, 160, 0.12)` | Accent backgrounds |
| `--clr-warning` | `#ff6b3d` | Warning / alert accent (orange) |
| `--clr-warning-dim` | `rgba(255, 107, 61, 0.12)` | Warning backgrounds |
| `--clr-blue` | `#4d8eff` | Secondary accent (blue) |
| `--clr-blue-dim` | `rgba(77, 142, 255, 0.1)` | Blue backgrounds |

Tailwind utility classes use the `hud-*` prefix: `bg-hud-surface`, `text-hud-accent`, `border-hud-border`, etc.

## Typography

| Token | Font Family | Usage |
|---|---|---|
| `--font-display` | `Chakra Petch`, sans-serif | Headings, nav, buttons, hero text |
| `--font-mono` | `Source Code Pro`, monospace | Labels, tags, stats, code, terminal UI |

Rules:
- All `<h1>` through `<h3>` use `font-display` via `style={{ fontFamily: "var(--font-display)" }}`
- All labels, tags, mono badges, and technical readouts use `font-mono`
- Body text inherits `font-display` (set on `<body>`)
- Never use Inter, Roboto, Arial, or system fonts
- Heading weights: 600–700. Body: 400. Labels/tags: 400–500

## Borders & Shapes

- **No border-radius** on cards, buttons, inputs, or panels — everything is sharp-edged
- Exception: `pulse-dot` uses `rounded-full`, scrollbar thumb uses 3px radius
- Borders: always `1px solid var(--clr-border)` at rest

## Spacing & Layout

- Section separators: `border-t border-hud-border`
- Card padding: `p-4` to `p-5`
- Grid gaps: `gap-3` to `gap-6`

## Component Classes (globals.css)

| Class | Purpose |
|---|---|
| `.panel` | Surface with border |
| `.panel-raised` | Surface with hover border transition |
| `.btn-primary` | Green accent button, uppercase |
| `.btn-ghost` | Transparent button, hover reveals surface |
| `.input-field` | Dark input with accent focus glow |
| `.label` | Mono uppercase label |
| `.tag` / `.tag-accent` / `.tag-blue` / `.tag-warning` | Status tags |
| `.pulse-dot` | Animated status indicator |
| `.grid-overlay` | Atmospheric grid background |
| `.scanline-overlay` | Animated scanline effect |

## Glow Effects

Interaction states use glow shadows:
- `shadow-glow-accent`: `0 0 12px rgba(0, 229, 160, 0.25)`
- `shadow-glow-accent-sm`: `0 0 6px rgba(0, 229, 160, 0.15)`
- `shadow-glow-warning`: `0 0 12px rgba(255, 107, 61, 0.25)`
- `shadow-glow-blue`: `0 0 12px rgba(77, 142, 255, 0.25)`
