---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: ["public/home.js","public/shared.css","public/ai-client.js"]
---

# Ledger surface

MODE: Operate

AUDIENCE: Signed-in travel companions checking prices while shopping or preparing to record expenses.

JOB: Convert a typed Japanese-yen amount to New Taiwan dollars in a few thumb taps, without leaving the active trip or changing ledger data.

CONSTRAINTS: Preserve the existing ledger tabs, trip context, authentication, green visual language, and expense workflow. Use the existing Worker exchange-rate source and show its date and availability honestly.

THESIS: Currency conversion is a momentary travel tool, not a fifth ledger destination. It opens from the ledger header as a focused calculator and refuses a permanent dashboard card or another bottom-navigation tab.

OWN-WORLD: Inherit the ledger's deep travel green shell, pale green working surface, compact sans-serif controls, square-rounded corners, and tabular numerals. The calculator is denser and more tactile, with large familiar keys and no decorative cards.

STORY: The traveler opens conversion beside the trip switcher, sees whether the rate is current, taps a yen amount, reads the Taiwan-dollar result immediately, then closes the tool and continues the same task.

FIRST VIEWPORT: A full-height mobile calculator sheet covers the ledger with a compact close control at top, a large right-aligned JPY input and larger TWD result in the upper third, rate metadata below, and a stable 4-column keypad filling the lower area. Desktop keeps the same phone-width focused surface centered over a dimmed ledger.

FORM: Local extension of the established Operate surface; no concept seed applies. Signature interaction: each key updates both currencies immediately while the result holds spatially still.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
