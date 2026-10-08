---
name: ui
description: Build, refine, and review web interfaces with attention to visual hierarchy, interaction feedback, purposeful animation, mobile usability, and realistic content edge cases. Use for UI implementation or polish, component design, and interface reviews.
---

# UI

Create interfaces that are clear, responsive, accessible, and resilient to real content. Adapt the design-engineering guidance from the supplied skills-main archive to the user's product and existing code.

## Work within the product

Read the relevant components, styling tokens, dependencies, and project instructions before changing UI. Preserve the user's framework, branding, and requested scope. Reuse existing primitives instead of adding competing component systems. Do not replace an existing application with a new scaffold.

For an implementation request, make and verify the changes. For a review request, report concrete findings with file locations and suggested fixes. Ask only when a missing product decision materially changes the result. Do not impose a fixed greeting, report format, approval step, or redesign on unrelated work.

## Visual and interaction quality

- Establish a clear primary action and readable hierarchy through typography, spacing, grouping, and contrast. Reuse the product's spacing, radius, color, and type scales.
- Prefer semantic controls with accessible names. Include visible keyboard focus, sensible tab order, and hover, pressed, disabled, loading, error, and success states where applicable.
- Keep feedback immediate. Loading feedback must reflect actual work; preserve input and provide a useful recovery path on failure.
- Use established accessible primitives for dialogs, menus, and popovers. Verify focus entry, dismissal, focus restoration, and background interaction behavior.
- Align icons and text optically, preserve fixed-size icons in flexible rows, and use tabular numerals where changing values need stable alignment.
- Do not sacrifice readable content or reachable actions for visual uniformity. Choose wrapping or truncation per field, with an accessible way to obtain the full value.

## Choose the relevant guidance

- For transitions, gestures, or animation reviews, read [references/motion.md](references/motion.md).
- For responsive behavior, mobile polish, or content stress testing, read [references/resilience.md](references/resilience.md).

Use the project's existing animation and UI libraries when suitable. Consult current official documentation when an API or browser capability is uncertain. Do not install dependencies merely because the source archive recommends them.

## Verify the result

Exercise the changed interaction and relevant loading, error, empty, and populated states. Check narrow and wide containers, keyboard operation, and reduced motion when affected. Use realistic fixtures through the existing data boundary; keep development controls out of production.

Use browser inspection when available to confirm layout and behavior. Report code-only conclusions as such, and distinguish device emulation from testing on actual hardware. Run the project's relevant checks without adding tests that only reproduce implementation details.

Finish with the concrete changes or findings, verification performed, and any unresolved limitation. Link the edited files when useful.

## Attribution

Adapted from Emil Kowalski's design-engineering, animation, mobile-native, and UI stress-testing material in the user-provided skills-main.zip. The accompanying [LICENSE](LICENSE) preserves the source license.
