# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two travel companions share a travel ledger. For the Hokkaido itinerary surface, both use it while planning and during the trip to check the next travel step and booking tasks.

## Product Purpose

The web app keeps shared trip expenses and reimbursements organized. The Hokkaido itinerary page adds a single place to review the supplied travel schedule and booking reminders before departure and on the move.

## Positioning

The ledger calculates each companion's share from recorded expenses, payment advances, and per-expense ratios, keeping the trip's entries and settlement together.

## Operating Context

The app is opened in a browser. Its current workflows cover recording shared expenses, tracking advances, saving places, and reviewing settlement. The itinerary is used both during trip planning and while traveling.

## Capabilities and Constraints

- Existing app: static HTML pages and JavaScript ES modules, Firebase Authentication, and Cloud Firestore, hosted by Firebase Hosting.
- Existing ledger: expense categories and ratios, payment advances, place bookmarks, and settlement calculations for two companions.
- Hokkaido itinerary page: preserve supplied dates, times, routes, train and bus names, and booking reminders. Content may be reorganized, but do not invent or silently change travel facts.
- Confirmed surface interactions: switch between travel dates, check off booking reminders, and provide relevant transport links.
- The itinerary content is supplied in `新增 文字文件 (2).txt` outside the project; it is the source of truth for this page.

## Evidence on Hand

- Existing product implementation and setup notes: `public/index.html`, `public/home.js`, and `public/README.md`.
- Hokkaido trip schedule, JR alternatives, airport bus options, and booking deadlines: user-provided itinerary text file.
- No independent verification of the travel schedule or external booking URLs has been provided.

## Product Principles

- Keep shared trip information easy to find in a browser.
- Make expense shares and settlement understandable from the recorded data.
- Keep travel facts faithful to their source.
- Make key trip information useful during both preparation and travel.