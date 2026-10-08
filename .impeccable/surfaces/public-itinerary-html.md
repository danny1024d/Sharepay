---
version: 1
slug: "public-itinerary-html"
primary_target: "public/itinerary.html"
related_targets: []
---

# Hokkaido itinerary

## Scope
A new web page in the existing travel-split app. Visitor mode: Operate.

## Audience and task
Two companions use this page while planning and during the Hokkaido trip. They need to check important transfers, compare the supplied train and bus options, and complete booking reminders.

## Content and constraints
Use the user-provided itinerary as the source of truth. Preserve all dates, times, transport names, stations, reminders, and distinctions between primary and alternative services. Reorganize wording only. Date switching, persistent reminder checks, and useful transport links are confirmed requirements. Do not imply that unverified links or booking availability were checked.

## Direction contract
THESIS: Organize the page around the traveler’s critical connections, not an undifferentiated chronological list.
OWN-WORLD: Extend the existing app’s white and cool-neutral surfaces, slate text, indigo primary controls, restrained state colors, compact system typography, and clear mobile-first spacing. No new visual identity.
STORY: First understand the 12/24 arrival-to-Asahikawa transfer and the 12/28 OMO7-to-airport departure; then compare the supplied alternatives and act on booking reminders.
FIRST VIEWPORT: Show the trip title and dates, a standard 12/24 / 12/28 date control, then a wide itinerary work area beside a compact key-connection and booking area. On mobile, stack the same areas and keep the date control reachable. The selected date scopes its events and transit options.
FORM: Transfer-priority workbench; grounded structure 6 in the ordered list; concept seed 338b1deb. Signature move: selected-date transit options sit directly beside the itinerary segment they relate to.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
The source does not specify a trip year or exact booking URLs. Do not invent either; use the dates as supplied and only link to verified public transport information or destination-based map searches.
