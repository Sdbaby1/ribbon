# Motion

Choose motion for feedback, spatial continuity, state changes, or explanation. Reduce or omit it for frequently repeated interactions; never delay keyboard actions or completion of a task for decoration.

## Timing and easing

Use these as starting points, adjusting to travel distance and the product's established behavior:

| Interaction | Starting duration |
| --- | --- |
| Press feedback | 100–160 ms |
| Tooltip or small popover | 125–200 ms |
| Dropdown | 150–250 ms |
| Dialog or drawer | 200–350 ms |

An ease-out curve gives an entrance immediate response. Ease-in-out suits movement between positions. Linear timing suits constant-speed motion. A useful responsive curve is `cubic-bezier(0.23, 1, 0.32, 1)`; match it to the interaction rather than applying it everywhere.

## Implementation choices

- Prefer transform and opacity when they express the intended effect efficiently. Measure layout or paint costs when size, clipping, or filters are necessary; do not assume every transform or clip is automatically composited.
- List transition properties explicitly instead of using `transition: all`.
- Use retargetable transitions for simple toggles. Consider the existing spring library for gestures requiring continuity when interrupted. Test rapid reversal and repeated activation.
- For subtle entrances, combine opacity with a small offset or scale near 1. Anchor a popover's transform origin to its trigger; centered dialogs can remain centered.
- Optional press scaling should be subtle and should not undermine precision or legibility. Visible color or border feedback may be more suitable for some controls.
- With tooltip groups, consider an initial delay followed by prompt adjacent tooltips; support focus as well as hover.
- During dragging, handle pointer capture, cancellation, and extra pointers. Choose dismissal distance and velocity thresholds for the actual gesture and units; avoid copying unexplained constants.
- Avoid large stagger delays, excessive bounce, and expensive blur in routine workflows. Do not add permanent `will-change` declarations without a measured need.

## Accessibility and verification

Respect `prefers-reduced-motion` by removing nonessential movement while preserving state feedback and functionality. Ensure completion logic does not depend solely on an animation event that may not fire when motion is disabled.

Verify entry, exit, interruption, rapid repetition, reduced motion, and loading transitions. Check that hidden or exiting content cannot unexpectedly receive focus or clicks.
