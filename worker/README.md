# Cloudflare OpenAI Worker

This Worker keeps the OpenAI and Google Places API keys on Cloudflare. It verifies Firebase ID tokens against Google's public signing keys, authorizes the two ledger accounts, restricts browser origins, and enforces a shared daily limit of 200 place lookup workflows across the Worker. It accepts Google Maps share links, safely follows only Google Maps redirects, and keeps exact place-pin coordinates from the final URL. If the link has no coordinates, the Worker first calls Places Text Search with an IDs Only field mask, then Place Details with Essentials fields to retrieve location. Results outside Hokkaido are rejected. OpenAI web search researches sources in any language; sourced introduction fields are translated to Traditional Chinese afterward without changing their facts, rating, or citations. Restaurant details prioritize cuisine, signature dishes, features, and reasons to visit. AI-generated coordinates are ignored.

Google classifies the human-readable `displayName` field as Place Details Pro, not Essentials. To keep the requested Essentials SKU, Place Details requests only `location`; the saved human-readable name comes from the Google Maps title, optionally refined by the cited AI identification. Text Search requests only `places.id` (IDs Only).

The app stores Place IDs on the long-lived place document. Places coordinates are stored separately in the `googleLocations` subcollection with an `expiresAt` timestamp, never in the parent place document. The map stops using an expired coordinate immediately, deletes the old location document, and refreshes Place Details by the saved Place ID. Configure Firestore TTL for collection group `googleLocations` using field `expiresAt` so abandoned location documents are also removed. Firestore TTL deletion is asynchronous and typically completes within 24 hours; the app's expiry check prevents use after the 30-day deadline. Places content is displayed on Google Maps, not Leaflet/OpenStreetMap. See [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies) and [Google Maps Platform Service Specific Terms](https://cloud.google.com/maps-platform/terms/maps-service-terms).

The Kamui ski page requests a fixed OpenStreetMap Overpass query through an authenticated Worker action; normalized piste and aerialway geometry is persisted in Cloudflare KV, served immediately while stale snapshots refresh, and preloaded every six hours by a Worker Cron Trigger. A failed Overpass request leaves the previous snapshot available and does not consume the Places daily quota. The page renders OSM `easy` pistes in green, `intermediate` in red, and `advanced`/`expert` in black, with visible OpenStreetMap attribution. Lift state and closing times are not inferred from map geometry; visitors are linked to Kamui's official daily-operations page for current status. The official course map is linked, not copied or embedded.

## Deploy

1. Install the dependencies from this directory:

   ```powershell
   npm install
   ```

2. Authenticate Wrangler in your own terminal:

   ```powershell
   npx wrangler login
   ```

3. Set the OpenAI API key as a Cloudflare secret. Do not put it in `wrangler.toml` or any file under `public/`:

   ```powershell
   npx wrangler secret put OPENAI_API_KEY
   ```

4. Enable Places API (New) and billing for the Google Cloud project, create an API key restricted to Places API (New), and store it as a Cloudflare secret:

   ```powershell
   npx wrangler secret put GOOGLE_MAPS_API_KEY
   ```

   Do not put this key in `wrangler.toml`, frontend files, or source control. Google Cloud API quotas and billing alerts should also be configured; the Worker limit caps lookup workflows, not Google's billing account usage from other clients.

5. Enable Maps JavaScript API and billing, create a separate browser key restricted to Maps JavaScript API and the Firebase Hosting HTTP referrers, then set `googleMapsApiKey` in `public/firebase-config.js`. This browser key is visible by design; HTTP referrer and API restrictions are required.

6. In the Firestore console, create a TTL policy for collection group `googleLocations` on timestamp field `expiresAt`. TTL is a Firestore project setting, not deployed by Firebase Hosting or Firestore Rules.

7. Deploy the Worker and publish the updated Hosting files and rules:

   ```powershell
   npm run deploy
   ```

   From the workspace root, deploy Hosting and Rules with `firebase deploy --only hosting,firestore:rules`.

Wrangler prints the Worker URL after deployment. `wrangler.toml` contains public configuration only. Update `ALLOWED_ORIGINS` if the Firebase Hosting site uses a custom domain or a different local development port. The local preview at port 8000 is already allowed. `DAILY_REQUEST_LIMIT` defaults to 200 workflows per day across all authorized accounts and cannot be configured above 200.

## Frontend call

The place-save flow requires a Google Maps link and imports a helper from `public/ai-client.js`:

```js
import { requestPlaceCoordinates } from "./ai-client.js";

const result = await requestPlaceCoordinates({
  user: auth.currentUser,
   mapsUrl: "https://maps.app.goo.gl/example"
});
```

The Worker accepts place names up to 100 characters and addresses up to 200 characters. If Places does not return a match or its result is outside Hokkaido, the app keeps the Maps title and URL but saves no coordinates. A no-pin lookup makes one Text Search request and one Place Details request; a 30-day refresh makes only one Place Details request. The 200-count quota is consumed once per Worker lookup workflow, including coordinate refreshes and workflows that use coordinates already present in the Maps link. The counter resets at 00:00 UTC. The Google map loads only after the user switches to map view.

## Local checks

```powershell
npm test
npm run dev
```

The OpenAI secret is not needed for the unit tests. Local Worker requests that call OpenAI need a local secret configured with Wrangler; never commit `.dev.vars`.