---
target: chat
total_score: 25
p0_count: 0
p1_count: 3
p2_count: 2
timestamp: 2026-06-03T17-37-45Z
slug: frontend-src-pages-chat-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Solid: typing indicator, window warnings, skeletons, unread badge, draft restored. Missing read receipts. |
| 2 | Match System / Real World | 3 | Good Portuguese localization. "Janela de 24h" and "HSM" are unexplained jargon for non-technical agents. |
| 3 | User Control and Freedom | 3 | Draft persistence excellent. Cancel everywhere. Missing: no undo for ticket close. |
| 4 | Consistency and Standards | 2 | Two coexisting token systems. Duplicate tag-trigger button in input toolbar. Arbitrary z-index values. Active ticket styling doesn't match DESIGN.md spec. |
| 5 | Error Prevention | 3 | Character limit, file size validation, window status guard. Missing: no confirmation before irreversible ticket close. |
| 6 | Recognition Rather Than Recall | 3 | Quick reply prefix hinted in placeholder. Note shortcut shown. HTML title attributes not keyboard/screen-reader accessible. |
| 7 | Flexibility and Efficiency | 3 | Ctrl+K, Ctrl+Shift+N, Enter to send, / quick replies, paste/drag-drop. Missing: no arrow-key ticket list navigation, no keyboard shortcut for Assumir/Encerrar. |
| 8 | Aesthetic and Minimalist Design | 2 | 3-column structure well-designed. Input toolbar crowded. Left-stripe SLA indicator violates absolute ban. |
| 9 | Error Recovery | 2 | Toast on send failure with input restored is solid. Failure messages terse with no actionable guidance. |
| 10 | Help and Documentation | 1 | Placeholder text only help. No keyboard-reachable tooltips. No explanation of 24h window concept. |
| **Total** | | **25/40** | **Acceptable** |

## Anti-Patterns Verdict

LLM assessment: Does NOT look AI-generated. Purpose-built operator tool with iteration scars, not slop. Zinc/emerald identity is strong and distinctive.

Deterministic scan: [] — zero findings.

## Priority Issues

[P1] SLA breach uses left border stripe (absolute ban). Line 938: borderLeft: '3px solid #ea4335'. Fix: background tint + dot/badge. Mismatched hex #ea4335 vs system #ef4444.

[P1] Emoji picker clipped by overflow container. Line 302: position:absolute inside overflow-y:auto .chat-messages. Fix: position:fixed with getBoundingClientRect positioning.

[P1] window.confirm() for destructive actions. Lines 322, 1031. Breaks design system, not accessible. Fix: in-app confirmation using existing modal pattern.

[P2] Duplicate tag-trigger button. Lines 1241 and 1334 both open showTagPicker. Remove trailing Plus button.

[P2] Drag-drop highlight uses violet rgba(99,102,241,0.06) instead of emerald rgba(16,185,129,0.06). Lines 1063, 1066.

## Persona Red Flags

Alex: No arrow-key ticket list navigation. No keyboard shortcut for Assumir/Encerrar. Emoji reactions are mouse-only.

Sam: toolbar buttons have title not aria-label. Upload error has no aria-live region. Typing indicator dots have no ARIA equivalent. SLA breach is color-only.

Fernanda (municipal agent): 24h window expiry message is opaque with no actionable guidance. SLA breach has no call-to-action.

## Minor Observations

- Note mode placeholder buries description after shortcut. Reverse order.
- Loading spinner manually re-implemented inline; should use shared component.
- showChatMenu, showActionMenu, showTagPicker each implement click-outside dismissal differently.
- Empty state teaches nothing; could surface queue count or pending tickets.
- Transfer bar renders all departments inline; overflows with 6+ departments.
