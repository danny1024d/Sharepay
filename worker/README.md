# Cloudflare OpenAI Worker

This Worker keeps the OpenAI API key on Cloudflare. It verifies Firebase ID tokens against Google's public signing keys, authorizes the two ledger accounts, restricts browser origins, and enforces a daily request quota per Firebase user. It accepts Google Maps share links, safely follows only Google Maps redirects, and prefers exact place-pin coordinates from the final URL. If the link has no coordinates, OpenAI web search identifies a cited canonical venue name and Nominatim supplies coordinates, first bounded to Asahikawa and then to Hokkaido. AI-generated coordinates are ignored.

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

4. Deploy the Worker:

   ```powershell
   npm run deploy
   ```

Wrangler prints the Worker URL after deployment. `wrangler.toml` contains public configuration only. Update `ALLOWED_ORIGINS` if the Firebase Hosting site uses a custom domain or a different local development port. The default daily limit is 30 calls per signed-in account; adjust `DAILY_REQUEST_LIMIT` before deployment if needed.

## Frontend call

The place-save flow requires a Google Maps link and imports a helper from `public/ai-client.js`:

```js
import { requestPlaceCoordinates } from "./ai-client.js";

const result = await requestPlaceCoordinates({
  user: auth.currentUser,
   mapsUrl: "https://maps.app.goo.gl/example"
});
```

The Worker accepts place names up to 100 characters and addresses up to 200 characters. If Nominatim finds a Japanese location inside the requested viewbox, it returns the geocoder coordinates plus up to three HTTPS sources, including the OpenStreetMap result. Otherwise the app saves the place without coordinates. Responses are capped at 300 output tokens. Saved coordinates are reused while the place name/address stay unchanged. Nominatim requests are paced globally at least 1.1 seconds apart, and the UI links to the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) and credits OpenStreetMap contributors.

## Local checks

```powershell
npm test
npm run dev
```

The OpenAI secret is not needed for the unit tests. Local Worker requests that call OpenAI need a local secret configured with Wrangler; never commit `.dev.vars`.