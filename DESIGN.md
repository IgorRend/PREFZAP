---
name: ZAPO / Atende Mafra
description: WhatsApp helpdesk and CRM for public-sector service teams
colors:
  live-current: "#10b981"
  live-current-deep: "#059669"
  live-current-bright: "#34d399"
  surface-void: "#09090b"
  surface-deep: "#111113"
  surface-raised: "#161618"
  surface-overlay: "#1c1c1f"
  surface-float: "#2a2a2e"
  ink-primary: "#f4f4f5"
  ink-secondary: "#d4d4d8"
  ink-muted: "#a1a1aa"
  ink-dim: "#71717a"
  status-error: "#ef4444"
  status-warning: "#f59e0b"
  status-info: "#3b82f6"
typography:
  display:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Geist Variable, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: "0.06em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.live-current}"
    textColor: "{colors.surface-void}"
    rounded: "{rounded.md}"
    padding: "7px 14px"
    typography: "13px / 600"
  button-primary-hover:
    backgroundColor: "{colors.live-current-deep}"
    textColor: "{colors.surface-void}"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  button-secondary:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "7px 14px"
    typography: "13px / 600"
  button-secondary-hover:
    backgroundColor: "{colors.surface-float}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-dim}"
    rounded: "{rounded.sm}"
    padding: "5px"
  button-ghost-hover:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.sm}"
    padding: "5px"
  button-danger:
    backgroundColor: "#1f0a0a"
    textColor: "#fca5a5"
    rounded: "{rounded.md}"
    padding: "7px 14px"
  badge-green:
    backgroundColor: "#0a2e1e"
    textColor: "{colors.live-current-bright}"
    rounded: "{rounded.full}"
    padding: "2px 7px"
    typography: "10px / 700"
  badge-yellow:
    backgroundColor: "#2a1a03"
    textColor: "#fbbf24"
    rounded: "{rounded.full}"
    padding: "2px 7px"
    typography: "10px / 700"
  badge-blue:
    backgroundColor: "#0a1529"
    textColor: "#60a5fa"
    rounded: "{rounded.full}"
    padding: "2px 7px"
    typography: "10px / 700"
  badge-gray:
    backgroundColor: "#1a1a1e"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "2px 7px"
    typography: "10px / 700"
  input-default:
    backgroundColor: "{colors.surface-overlay}"
    textColor: "{colors.ink-primary}"
    rounded: "{rounded.md}"
    padding: "8px 10px"
    typography: "13px / 400"
---

# Design System: ZAPO / Atende Mafra

## 1. Overview

**Creative North Star: "The Sharp Desk"**

This system is built for agents who live inside it. Not a dashboard you visit once a day — a workspace you occupy for eight hours, resolving citizen requests through WhatsApp at volume. The visual grammar reflects that context precisely: every pixel serves function, density is a virtue, and decoration competes with the task and loses.

The palette is near-black zinc with a single, precise emerald accent. The zinc surfaces recede so that content — names, messages, statuses, timestamps — reads at a glance. The emerald ("Live Current") appears only where it carries meaning: an active ticket, a confirmed send, a live connection, the outgoing message bubble. Its rarity makes it a reliable signal. The moment it becomes decoration, it stops being information.

This system explicitly rejects the aesthetic of generic SaaS helpdesks — HubSpot, Zendesk, Freshdesk — with their beige-white surfaces, rounded blue primary buttons, and padding sized for comfort rather than throughput. It equally rejects the WhatsApp Web clone reflex: the chat view handles WhatsApp data, but is a professional operator interface, not a reskin of a consumer app.

**Key Characteristics:**
- Dark-only. No light mode. The zinc surface IS the product identity, not a preference setting.
- Single accent. Live Current (emerald `#10b981`) is used for active state, primary action, and live indicators only. Never for decoration.
- Tonal layering, not shadows. Depth is conveyed by stepping through the zinc ramp (Surface Void → Surface Deep → Surface Raised → Surface Overlay → Surface Float). Shadows are reserved for floating layers only.
- Dense and direct. Components are sized for operators who scan, not users who browse. Padding earns its space.
- One typeface. Geist Variable across all roles. Weight and size carry the entire hierarchy.

## 2. Colors: The Live Current Palette

One accent, one neutral ramp, three semantic signals. No secondary brand color. The restraint is load-bearing: the fewer things are emerald, the more the emerald means.

### Primary
- **Live Current** (`#10b981` / `oklch(0.68 0.16 162)`): The emerald signal. Used for primary action buttons, active navigation states, selected items, outgoing message bubbles, and live/online indicators. Never decorative. Its presence always means something: active, confirmed, or in motion.
- **Live Current Deep** (`#059669` / `oklch(0.60 0.16 162)`): The pressed/hover state of Live Current. Also used for button borders and the highest-contrast emerald in text-on-tint contexts.
- **Live Current Bright** (`#34d399` / `oklch(0.79 0.14 162)`): Badge text on dark emerald tint backgrounds, chart series, inline accent labels.

### Neutral
- **Surface Void** (`#09090b` / `oklch(0.07 0.004 264)`): The deepest surface. Chat message canvas, modal backdrop behind floating panels.
- **Surface Deep** (`#111113` / `oklch(0.09 0.004 264)`): Primary app background. The base layer every other surface sits on.
- **Surface Raised** (`#161618` / `oklch(0.12 0.004 264)`): Sidebar background, top bar, primary panel backgrounds. One tonal step above Deep.
- **Surface Overlay** (`#1c1c1f` / `oklch(0.15 0.004 264)`): Cards, input field backgrounds, list item surfaces. The default "raised content" color.
- **Surface Float** (`#2a2a2e` / `oklch(0.20 0.004 264)`): Hover states, selected rows, active list items, open dropdown triggers.
- **Ink Primary** (`#f4f4f5` / `oklch(0.97 0.003 264)`): Headings, active item labels, high-signal text.
- **Ink Secondary** (`#d4d4d8` / `oklch(0.88 0.003 264)`): Body text, button labels, form values. Default readable text color.
- **Ink Muted** (`#a1a1aa` / `oklch(0.73 0.005 264)`): Tertiary labels, timestamps, captions, inactive nav items.
- **Ink Dim** (`#71717a` / `oklch(0.55 0.008 264)`): Disabled text, metadata below the fold, placeholder support text.

Borders use semi-transparent white layered over the zinc surfaces: `rgba(255,255,255,0.06)` (Border Subtle, dividers between adjacent surfaces) and `rgba(255,255,255,0.10)` (Border Medium, emphasized containers and active states).

### Semantic
- **Status Error** (`#ef4444`): Destructive actions, error messages, invalid input borders.
- **Status Warning** (`#f59e0b`): Pending, caution, unassigned queue states. The amber badge family.
- **Status Info** (`#3b82f6`): Informational badges, assigned/neutral indicators.

### Named Rules
**The One Signal Rule.** Live Current appears on ≤15% of any given screen surface. The entire value of the accent is that it stands out. Reserve it for primary actions, active states, and live indicators. If multiple elements on the same screen are emerald, at least one of them is wrong.

**The Tint Rule.** Semantic color backgrounds use the base color at 8–15% opacity, never at full saturation. A green-tinted badge is a status cue; a fully green cell is noise.

## 3. Typography

**Font:** Geist Variable (with `system-ui, sans-serif` fallback)

Geist is a geometric sans-serif with tight letter-fitting and excellent legibility at small sizes, designed for code editors and product UI. This system uses it as the single family across all roles, from 10px uppercase labels to 20px display headings. Weight contrast (400 / 600 / 700) carries the entire hierarchy — no second typeface needed.

Font feature settings `"cv02", "cv03", "cv04", "cv11"` activate disambiguating character alternates: the kind of detail that matters when agents are reading phone numbers, ticket protocol IDs, and names at speed.

**Character:** Utilitarian and precise. The same typeface in different weights reads as discipline, not monotony. No serif for warmth, no condensed for drama. The type disappears into the content.

### Hierarchy
- **Display** (700, 20px, line-height 1.2, tracking -0.01em): Page section headings, modal titles, major panel labels. Appears sparingly — one per context, never stacked.
- **Headline** (700, 16px, line-height 1.3, tracking -0.005em): Card headings, sidebar section group labels, dialog sub-headings.
- **Title** (600, 14px, line-height 1.4): Subsection labels, form group headers, table column names.
- **Body** (400, 14px, line-height 1.5): Message text, list item content, descriptions, form helper text.
- **Label** (700, 10–11px, letter-spacing 0.06em, uppercase): Field labels (SETOR, PROTOCOLO, STATUS), badge text, compact metadata chips. Four words maximum. Never applied to full sentences.

### Named Rules
**The No-Display-Font Rule.** Geist Variable is the only typeface in the system. No serif for headings, no condensed variant for data, no mono for UI chrome. Mono faces are acceptable for inline protocol numbers and phone values where character-level disambiguation matters.

**The Uppercase Ceiling.** All-caps applies to Label-scale text only: 10–11px, four words maximum. Button labels, error messages, descriptions, and any text that could form a complete sentence: sentence case only.

## 4. Elevation

This system uses **tonal layering as its primary depth signal**. Panels don't float above the page with drop shadows; they're distinguished by stepping up the zinc ramp. On a near-black surface, overlapping shadow cones create visual noise; a single tonal step is cleaner and more precise.

### The Zinc Depth Ladder

| Layer | Token | Value | Role |
|---|---|---|---|
| Canvas | Surface Void | `#09090b` | Chat message background, modal tint overlay |
| Base | Surface Deep | `#111113` | App canvas |
| Panel | Surface Raised | `#161618` | Sidebar, top bar |
| Card | Surface Overlay | `#1c1c1f` | Cards, inputs, secondary surfaces |
| Hover | Surface Float | `#2a2a2e` | Hover/selected states |
| Divider | Border Subtle | `rgba(255,255,255,0.06)` | Between adjacent surfaces of the same depth |

Shadows appear only on **floating layers** (modals, dropdowns, tooltips, command palette) where tonal distinction cannot signal separation from the page because the layer sits above the full viewport.

### Shadow Vocabulary
- **Ambient** (`0 1px 3px rgba(0,0,0,0.5)`): Inset detail on buttons or small inline lifts.
- **Modal** (`0 8px 32px rgba(0,0,0,0.5)`): Floating panels, popovers, command palette panel.
- **Overlay** (`0 20px 60px rgba(0,0,0,0.6)`): Full-screen modal dialogs, drawers.
- **Live Glow** (`0 0 24px rgba(16,185,129,0.18)`): Signature material for Live Current elements — active connection badge, primary CTA on the connection setup screen. Not a general hover effect.
- **Live Glow Strong** (`0 0 48px rgba(16,185,129,0.28)`): Reserved for the confirmed active WhatsApp connection indicator only.

### Named Rules
**The Tonal-First Rule.** Before adding a shadow to separate two surfaces, step one of them up or down the zinc ladder. Shadows on resting surfaces indicate a modeling failure, not a styling choice.

**The Glow Reserve Rule.** The emerald glow is a signature material, not a hover pattern. At most two elements per screen may carry it. Standard focus treatment is a border-color shift to `rgba(16,185,129,0.25)`, not a box-shadow glow.

## 5. Components

Components are dense and direct. Default sizes are compact; the small (`-sm`) variant is the norm for in-panel controls. Consistent shape vocabulary: 8px radius for form controls and buttons, 10px for containers and cards, full-radius (9999px) for badges and pills only.

### Buttons
**Shape:** Gently curved (8px radius). Never pill-shaped on primary actions. Never sharp-cornered.
- **Primary:** Live Current background (`#10b981`), Surface Void text, 7px/14px padding, 13px/600. Hover: Live Current Deep (`#059669`). Represents confirmed, high-signal actions: send message, confirm assignment, save settings.
- **Secondary:** Surface Overlay background (`#1c1c1f`), Ink Secondary text, Border Medium border. Same padding. For secondary and cancel actions paired with primary in dialogs.
- **Ghost:** Transparent background, Ink Dim text, 5px padding (icon-only default). Hover: Surface Overlay background, Ink Primary text. Default for toolbar controls and list row actions.
- **Danger:** Red tint background (`rgba(239,68,68,0.12)`), `#fca5a5` text, red border (`rgba(239,68,68,0.25)`). Destructive confirmations only — delete, disconnect, remove.
- **Small (-sm):** 5px/10px padding, 12px text. Default for controls inside panels, sidebars, and form rows.
- **Icon-only (28×28px):** Square ghost style (`border-radius: 6px`). Header toolbar actions, chat input controls.

Transition on all buttons: `all 150ms cubic-bezier(0.4,0,0.2,1)`. No transform-scale on hover, no bounce, no shadow transitions.

### Badges
**Shape:** Pill (9999px radius), 2px/7px padding, 10px/700, letter-spacing 0.04em, uppercase.
- **Green:** Active, open, online — `rgba(16,185,129,0.12)` bg, `#34d399` text, `rgba(16,185,129,0.25)` border
- **Yellow:** Pending, waiting, unassigned — `rgba(245,158,11,0.12)` bg, `#fbbf24` text
- **Blue:** Assigned, informational — `rgba(59,130,246,0.12)` bg, `#60a5fa` text
- **Gray:** Closed, inactive, resolved — `rgba(113,113,122,0.15)` bg, `#a1a1aa` text
- **Indigo:** Bot, automated — `rgba(99,102,241,0.12)` bg, `#818cf8` text

Five variants. No new hues introduced for new status types — map to the closest semantic role.

### Cards / Containers
**Corner Style:** 10px radius for main containers; 8px for inline cards and list items; 14px for dialogs and modals.
**Background:** Surface Overlay (`#1c1c1f`) as the default card surface. Surface Raised (`#161618`) for sidebar and header panel surfaces. Surface Deep (`#111113`) for stat card backgrounds inside the dashboard.
**Shadow Strategy:** None at rest. Tonal distinction handles separation per the Tonal-First Rule. Modal shadow for overlaid contexts.
**Border:** Border Subtle (`rgba(255,255,255,0.06)`) as the default 1px divider. Border Medium (`rgba(255,255,255,0.10)`) for emphasized containers, focused states, and Live Current-adjacent borders (`rgba(16,185,129,0.30)`).
**Internal Padding:** 20px (large — modal bodies, stat cards); 16px (standard — panel sections); 12px (compact — chat panels, dense lists); 8px (tight — list row items).

### Inputs / Fields
**Style:** Surface Overlay background, Border Medium border (1px), 8px radius, 13px/400 body text, 8px/10px padding.
**Focus:** Border shifts to `rgba(16,185,129,0.35)`. No box-shadow glow on standard inputs (Glow Reserve Rule).
**Placeholder:** Ink Dim (`#71717a`) — holds 4.5:1 contrast against Surface Overlay background.
**Label:** 10px/700, uppercase, letter-spacing 0.06em, Ink Dim color. Positioned above the field, 4px gap.
**Error:** Border shifts to `rgba(239,68,68,0.35)`. Error banner below in `rgba(239,68,68,0.10)` background with `#fca5a5` text, 8px/12px padding, 8px radius.
**Disabled:** 40% opacity. No state change on interaction.

### Navigation
**Structure:** Fixed left sidebar (232px expanded / 60px collapsed, toggled and persisted to localStorage) + 52px top bar.
**Sidebar surface:** Surface Raised (`#161618`) with Border Subtle bottom/right dividers. Section group labels at 11px/700/uppercase/Ink Dim, letter-spacing 0.07em — one label per nav group, not per item.
**Nav items:** 13px/500, Ink Muted by default. Hover: Surface Float (`rgba(255,255,255,0.04)`) background, Ink Primary text. Active: `rgba(16,185,129,0.08)` background tint, Live Current text (`#10b981`), 600 weight. No left-border stripe on any state.
**Top bar:** Surface Raised background, Border Subtle bottom border. Contains search trigger (`⌘K`), notification bell, and user avatar dropdown.

### Chat Bubbles (Signature Component)
The chat view is the core surface. Bubbles are the most recognizable element of the system.
- **Outgoing (agent):** Emerald gradient (`linear-gradient(135deg, #059669, #10b981)`), white text, 16px/16px/4px/16px radius (tail at bottom-right), `0 2px 10px rgba(16,185,129,0.20)` shadow.
- **Incoming (citizen):** Surface Overlay background (`#1c1c1f`), Ink Primary text, Border Subtle border, 16px/16px/16px/4px radius (tail at bottom-left).
- **Note / Bot:** Amber tint background (`rgba(245,158,11,0.08)`), amber border (`rgba(245,158,11,0.20)`), Ink Primary text, 12px radius. Internal notes and automated messages.
- **System:** Compact pill shape (99px radius), Ink Dim text (`#71717a`), Border Subtle border, 11px/italic. Status events (ticket opened, assigned, closed) — not conversational.

### Command Palette (Signature Component)
Accessed via `⌘K` / `Ctrl+K`. Fixed full-viewport overlay with `rgba(0,0,0,0.60)` backdrop and `blur(6px)`. 580px panel centered at 80px from top. Surface Raised background (`#161618`), Border Medium border, 14px radius, Overlay shadow. Input at 15px, results at 13px. Keyboard shortcut hints in footer at 11px/Ink Dim. Avatar chips use Live Current tint (`rgba(16,185,129,0.08)`) with Live Current ring.

## 6. Do's and Don'ts

### Do:
- **Do** use tonal surface steps before shadows. When two adjacent panels need separation, step one of them up or down the zinc ladder.
- **Do** reserve Live Current for primary actions, active/selected states, and live indicators. The fewer emerald elements on screen, the higher the signal value of each one.
- **Do** use the five badge variants (green, yellow, blue, gray, indigo) as the complete status vocabulary. Map new status types to the nearest semantic role; do not introduce new hues.
- **Do** use the small (`-sm`) button and compact (12px) padding inside panels and forms. Full-size buttons belong at the top level of a flow — submission, connection, high-signal confirmation.
- **Do** use Geist font-feature settings (`cv02, cv03, cv04, cv11`) on every text context. These alternates disambiguate characters that agents read at high volume: phone numbers, IDs, names.
- **Do** size focus rings as a border-color shift to `rgba(16,185,129,0.35)`. Reserve the emerald glow (`box-shadow: 0 0 24px rgba(16,185,129,0.18)`) for at most two elements per screen — connection indicators and top-level live state signals.
- **Do** use sentence case for all interactive labels, button text, error messages, and descriptive copy. Uppercase only at Label scale (≤11px, ≤4 words).
- **Do** use `rgba(255,255,255,0.06)` (Border Subtle) as the divider between adjacent surfaces of the same depth. Stronger borders signal meaningful separation.

### Don't:
- **Don't** apply the HubSpot / Zendesk / Freshdesk aesthetic: no light surfaces, no rounded blue primary buttons, no generous padding "for comfort." This is a throughput tool for operators, not a portal for occasional visitors.
- **Don't** make the chat interface look like WhatsApp Web. Bubble shapes and chat layout are necessary; WhatsApp's teal header, green status bars, and consumer iconography are clone signals. They are prohibited.
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on nav items, cards, callouts, or list rows. Use background tint + text color to express active and selected states.
- **Don't** apply `background-clip: text` with a gradient fill to any text. Emphasis through weight or size only.
- **Don't** use the emerald glow (`--shadow-em`, `--shadow-em-lg`) as a general hover or focus style. It is a live-state material reserved for connection indicators and primary CTAs on setup flows.
- **Don't** introduce a light mode or light-surface variant. The dark zinc system is the identity; designing for a light mode toggle is designing a different product.
- **Don't** add decorative motion. Transitions are 150–200ms conveying state change only. No page-load entrance sequences, no staggered list animations, no scroll-driven choreography. Agents are in flow; they don't watch screens load.
- **Don't** use glassmorphism (backdrop-blur + semi-transparent colored panel) as a default surface style. The `.glass` utility exists for overlaid panels only, purposefully and rarely.
- **Don't** apply uppercase to body text, button labels, dialog content, or error messages. Uppercase at body scale reads as shouting in a tool where agents are already under pressure.
- **Don't** invent new accent hues for branding, section decoration, or emphasis. Violet (`#8b5cf6`) and blue (`#3b82f6`) are semantic-only (badge and chart contexts). Live Current is the only brand color.
