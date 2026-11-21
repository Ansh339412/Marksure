# MarkSure motion design system

## Purpose and implementation

Motion explains navigation, selection, pending requests and authoritative results. Existing React, React Router, CSS and browser Web Animations APIs are used; no dependency was installed. The original cream, white and maroon palette is preserved, including existing semantic status and print colors. Motion accents reuse the original color tokens.

The primitives live in [Motion.tsx](../client/src/motion/Motion.tsx), with [motion styles](../client/src/motion/motion.css) and [screen palette](../client/src/motion/theme.css). Existing pages import PageTransition through the shared design system for compatibility.

| Primitive | Timing | Behavior |
| --- | --- | --- |
| PageTransition | 320 ms | Current page opacity and 6 px rise; shell/auth provider stay mounted |
| Reveal | 420 ms | One IntersectionObserver entrance; disconnects after first intersection |
| SelectionTrack | 240 ms | One shared underline or vertical navigation marker moves to selected control |
| MetricValue | 320 ms | Reveals the actual changed value; no invented intermediate counts |
| Hero copy / visual | 440 / 520 ms | Small staged sequence, maximum delay 180 ms |
| Metric group | 360 ms | Five cards, 45 ms stagger; table rows are not staggered |
| Modal | 220 ms entrance / 160 ms exit | Native dialog with focus containment, restoration and Escape handling |
| Mobile navigation | 220 ms | Short downward entrance, disclosure semantics |
| Content / proof / approval feedback | 220–320 ms | Group-level entrance; state changes are immediate |
| Button / focus / hover feedback | 160 ms | Color and small press response |
| Request indicator | 1.6 s cycle | Indeterminate, present only during active verification |

Default easing is `cubic-bezier(.16,1,.3,1)`. The logo draws for at most two cycles; the indeterminate request line communicates ongoing work without a percentage.

## Accessibility and lifecycle

CSS disables animations and transitions on elements and pseudo-elements under `prefers-reduced-motion: reduce`. JavaScript animation hooks consult the preference and cancel active animations when it changes. Content is visible without animations. Hover motion is limited to fine pointers. Focus outlines remain visible; filter controls expose `aria-pressed`, navigation exposes `aria-current`, and the mobile menu exposes `aria-expanded`.

Native dialogs block background interaction, preserve focus and restore it to the opener. Discrete exit transitions progressively enhance compatible browsers; other browsers close immediately. The mobile menu remains an inline disclosure, not a modal overlay.

Observers, animation handles, media listeners and clipboard/toast timers are cleaned up. Selection geometry is measured only on selection/layout changes, not every animation frame. Repeated route changes cancel prior page animations.

## Data and security boundaries

Public pages render while session restoration runs; protected pages retain their existing role checks. Outgoing private pages are removed immediately. Route entrances are implemented; outgoing route snapshots/exit animations are deliberately not retained. No navigation delay is introduced.

Verification pending state does not claim substeps succeeded. All five results render only after the server response. Re-verification clears the old report; request generations prevent late responses from replacing newer requests. Directory shortcuts do not assert verdicts. Existing landing scenarios remain explicitly illustrative.

The proof inspector and ledger hash relationships use keyboard-accessible native disclosure controls. Approval slots reveal only their existing authoritative status. Cryptographic operations, backend contracts, permissions and database schemas are unchanged.

## Extension rules

Use one reveal for a meaningful group. Keep errors immediate. Do not animate every row, invent progress, or count through fabricated metrics. Prefer opacity and transform. Do not retain private DOM for exit transitions. Use a real data change as the trigger for status motion.
