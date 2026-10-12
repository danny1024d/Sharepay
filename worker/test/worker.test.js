import test from "node:test";
import assert from "node:assert/strict";
import {
  geocodeIdentifiedPlace,
  extractGoogleMapsPlaceName,
  handleRequest,
  normalizeGoogleMapsUrl,
  nominatimSearchUrl,
  parseGoogleMapsCoordinates,
  parseNominatimResults,
  parsePlaceIdentificationResult,
  resolveGoogleMapsShareUrl,
  UserDailyRateLimiter
} from "../src/index.js";

const env = {
  ALLOWED_ORIGINS: "https://sharepay-f60d3.web.app",
  FIREBASE_PROJECT_ID: "sharepay-f60d3"
};

function request({ method = "POST", origin = "https://sharepay-f60d3.web.app", headers = {} } = {}) {
  return new Request("https://worker.example/api", {
    method,
    headers: { Origin: origin, "Content-Type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify({ name: "test place", address: "Hokkaido", mapsUrl: "https://maps.app.goo.gl/test" }) : undefined
  });
}

test("rejects unknown origins", async () => {
  const response = await handleRequest(request({ origin: "https://attacker.example" }), env);
  assert.equal(response.status, 403);
});

test("allows preflight only for a configured origin", async () => {
  const response = await handleRequest(request({ method: "OPTIONS" }), env);
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://sharepay-f60d3.web.app");
});

test("rejects non-POST requests", async () => {
  const response = await handleRequest(request({ method: "GET" }), env);
  assert.equal(response.status, 405);
});

test("rejects unauthenticated calls before reaching OpenAI", async () => {
  const response = await handleRequest(request(), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "Sign-in required.");
});

test("daily quota is enforced per limiter instance", async () => {
  const records = new Map();
  const storage = {
    async transaction(callback) {
      return callback({
        get: async key => records.get(key),
        put: async (key, value) => records.set(key, value)
      });
    }
  };
  const limiter = new UserDailyRateLimiter({ storage });
  const check = () => limiter.fetch(new Request("https://rate-limit.internal/check", {
    method: "POST",
    body: JSON.stringify({ limit: 1 })
  }));

  assert.equal((await check()).status, 200);
  assert.equal((await check()).status, 429);
});

test("AI identification returns a cited place name and address, not coordinates", () => {
  const result = parsePlaceIdentificationResult(
    JSON.stringify({ found: true, placeName: "旭川市科学館サイパル", alternateNames: ["旭川市科学館"], address: "北海道旭川市", latitude: 43.7681, longitude: 142.3655, scope: "asahikawa" }),
    [{ title: "Official place page", url: "https://example.jp/place" }]
  );
  assert.equal(result.found, true);
  assert.equal(result.placeName, "旭川市科学館サイパル");
  assert.deepEqual(result.alternateNames, ["旭川市科学館"]);
  assert.equal(result.scope, "asahikawa");
  assert.equal(result.sources.length, 1);
  assert.equal("latitude" in result, false);
});

test("requires a cited exact place identification", () => {
  const result = parsePlaceIdentificationResult(
    JSON.stringify({ found: true, placeName: "市科學館", address: "", scope: "asahikawa" }),
    []
  );
  assert.deepEqual(result, { found: false, sources: [] });
});

test("Nominatim results must be inside Japan and the requested area", () => {
  const result = parseNominatimResults([
    { lat: "35.6812", lon: "139.7671", address: { country_code: "jp" } },
    { lat: "43.7563416", lon: "142.3704140", display_name: "旭川市科学館", address: { country_code: "jp" } }
  ], { minLatitude: 43.4, maxLatitude: 43.95, minLongitude: 142.1, maxLongitude: 142.8 });
  assert.equal(result.latitude, 43.7563416);
  assert.equal(result.longitude, 142.370414);
});

test("Nominatim search hard-filters Japan and the supplied viewbox", () => {
  const url = new URL(nominatimSearchUrl(
    { placeName: "旭川市科学館サイパル", address: "北海道旭川市宮前" },
    { minLatitude: 43.4, maxLatitude: 43.95, minLongitude: 142.1, maxLongitude: 142.8 },
    "旭川市科学館"
  ));
  assert.equal(url.searchParams.get("countrycodes"), "jp");
  assert.equal(url.searchParams.get("bounded"), "1");
  assert.equal(url.searchParams.get("viewbox"), "142.1,43.95,142.8,43.4");
  assert.match(url.searchParams.get("q"), /旭川市科学館/);
});

test("tries AI-provided map aliases before widening the search area", async () => {
  const urls = [];
  const result = await geocodeIdentifiedPlace({
    placeName: "旭川市科学館サイパル",
    alternateNames: ["旭川市科学館"],
    address: "北海道旭川市",
    scope: "asahikawa",
    sources: [{ title: "Official page", url: "https://example.jp/place" }]
  }, {}, async url => {
    urls.push(new URL(url));
    return Response.json(urls.length === 1 ? [] : [{
      lat: "43.7563416",
      lon: "142.3704140",
      display_name: "旭川市科学館",
      address: { country_code: "jp" },
      osm_type: "way",
      osm_id: 123
    }]);
  }, async () => {});

  assert.equal(result.found, true);
  assert.equal(result.scope, "asahikawa");
  assert.equal(urls.length, 2);
  assert.match(urls[1].searchParams.get("q"), /旭川市科学館/);
});

test("falls back from Asahikawa to Hokkaido geocoding when the first area has no match", async () => {
  const urls = [];
  let paceCalls = 0;
  const result = await geocodeIdentifiedPlace({
    placeName: "北海道の施設",
    address: "",
    scope: "asahikawa",
    sources: [{ title: "Source", url: "https://example.jp/place" }]
  }, {}, async url => {
    urls.push(new URL(url));
    return Response.json(urls.length === 1 ? [] : [{
      lat: "43.7563416",
      lon: "142.3704140",
      display_name: "旭川市科学館",
      address: { country_code: "jp" },
      osm_type: "way",
      osm_id: 123
    }]);
  }, async () => { paceCalls += 1; });

  assert.equal(result.found, true);
  assert.equal(result.scope, "hokkaido");
  assert.equal(urls.length, 2);
  assert.equal(paceCalls, 2);
  assert.equal(result.sources[0].title.startsWith("OpenStreetMap"), true);
});

test("prefers Google's place pin coordinates over the map viewport center", () => {
  const url = "https://www.google.com/maps/place/Asahikawa+Kitasaito+Garden/@43.7585599,142.3432046,14.67z/data=!4m6!3m5!1splace!2m2!3d43.7591118!4d142.3629502";
  assert.deepEqual(parseGoogleMapsCoordinates(url), { latitude: 43.7591118, longitude: 142.3629502 });
  assert.equal(extractGoogleMapsPlaceName(url), "Asahikawa Kitasaito Garden");
});

test("only accepts HTTPS Google Maps link hosts", () => {
  assert.equal(normalizeGoogleMapsUrl("https://maps.app.goo.gl/example")?.hostname, "maps.app.goo.gl");
  assert.equal(normalizeGoogleMapsUrl("https://evil.example/maps/place/test"), null);
  assert.equal(normalizeGoogleMapsUrl("http://maps.app.goo.gl/example"), null);
});

test("resolves a short Google Maps link to its exact place coordinates", async () => {
  const longUrl = "https://www.google.com/maps/place/Asahikawa+Kitasaito+Garden/@43.7585599,142.3432046,14.67z/data=!3d43.7591118!4d142.3629502";
  const result = await resolveGoogleMapsShareUrl("https://maps.app.goo.gl/example", async () => new Response(null, {
    status: 302,
    headers: { Location: longUrl }
  }));
  assert.deepEqual(result.coordinates, { latitude: 43.7591118, longitude: 142.3629502 });
  assert.equal(result.placeName, "Asahikawa Kitasaito Garden");
});

test("rejects a Google Maps short link that redirects outside Google Maps", async () => {
  await assert.rejects(
    resolveGoogleMapsShareUrl("https://maps.app.goo.gl/example", async () => new Response(null, {
      status: 302,
      headers: { Location: "https://evil.example/collect" }
    })),
    /redirect is not allowed/
  );
});