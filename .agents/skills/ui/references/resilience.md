# Mobile usability and realistic content

## Responsive interaction

- Test the component at its actual container width, a narrow mobile viewport, and the supported wide layout. Check enlarged text or 200% zoom.
- Restrict hover-only effects to capable pointers, for example `@media (hover: hover) and (pointer: fine)`. Keep essential actions available to touch and keyboard users.
- Preserve pinch zoom. On mobile forms, a readable input size around 16 CSS pixels helps avoid unwanted focus zoom.
- Choose viewport units intentionally: `dvh` can track changing browser chrome for an app shell; `svh` can keep a hero stable. Verify software-keyboard behavior separately.
- When using safe-area insets, check the viewport configuration and bottom controls on an actual relevant device when possible.
- Keep controls comfortably tappable and separated. Avoid global text-selection or scrolling restrictions; scope gesture rules to the component that needs them.
- Check that sticky controls, drawers, and input fields remain reachable while the software keyboard is open.

## Content stress testing

Inspect the rendered fields and their schema limits. Use plausible values or actual accepted limits, through props, fixtures, or mocks rather than editing markup to manufacture failures.

Cover relevant cases: long names and emails, short names, missing optional fields, failed images, zero and one item, large counts, translated labels, non-Latin text, emoji, and realistic large collections. Include loading, error, empty, and no-results states. Check RTL only when supported or requested.

Common repairs:

| Symptom | Likely repair |
| --- | --- |
| Text pushes actions out of a flex row | `min-width: 0` on the flexible text region; prevent actions from shrinking |
| Grid column overflows | Consider `minmax(0, 1fr)` for the flexible track |
| Long URL cannot wrap | Use `overflow-wrap: anywhere` on that field |
| Avatar becomes distorted | Preserve its dimensions and provide an image failure fallback |
| Translated button text clips | Let content determine width and allow the surrounding layout to adapt |
| Count has wrong formatting or plural | Use locale-aware number formatting and plural rules |
| Truncated values become indistinguishable | Reconsider wrapping or middle truncation and expose the full value accessibly |
| Tall scripts clip | Revisit line height and text overflow constraints |
| Large collections stall scrolling | Measure and use appropriate pagination or virtualization |

Amounts and other values users must compare should stay readable. Distinguish absent values from zero. Escape user text through the framework's normal rendering path.

Keep stress fixtures and switches development-only. For a review, document the observed problem and proposed repair; when fixes are requested, apply them and recheck normal as well as extreme content. Do not claim visual or hardware verification from source inspection alone.
