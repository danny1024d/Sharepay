import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlaceIdentificationPrompt,
  extractGoogleMapsPlaceName,
  getKamuiMapData,
  analyzeProductBarcode,
  analyzeTravelImage,
  findGooglePlace,
  handleRequest,
  normalizeGoogleMapsUrl,
  normalizeKamuiMapElements,
  parseGoogleMapsCoordinates,
  parsePlaceIdentificationResult,
  placeIdentificationResponseFormat,
  placeIntroductionTranslationResponseFormat,
  placeLookupFailure,
  parseReceiptDraft,
  placesTextSearchBody,
  serveKamuiMapData,
  translatePlaceIntroduction,
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

test("daily receipt quota is isolated by account and from Places quota", async () => {
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
  const check = (key, limit = 1) => limiter.fetch(new Request("https://rate-limit.internal/check", {
    method: "POST",
    body: JSON.stringify({ key, limit })
  }));

  assert.equal((await check("places")).status, 200);
  assert.equal((await check("places")).status, 429);
  assert.equal((await check("receipt:first@example.com")).status, 200);
  assert.equal((await check("receipt:first@example.com")).status, 429);
  assert.equal((await check("receipt:second@example.com")).status, 200);
  assert.equal((await check("image-analysis:first@example.com")).status, 200);
  assert.equal((await check("image-analysis:second@example.com")).status, 200);
});

test("receipt parser rejects invalid and oversized images before calling OpenAI", async () => {
  let requested = false;
  const fetchImpl = async () => {
    requested = true;
    return Response.json({});
  };

  await assert.rejects(parseReceiptDraft("not-an-image", { OPENAI_API_KEY: "test" }, fetchImpl), /receipt_image_invalid/);
  const oversized = `data:image/jpeg;base64,${"A".repeat(Math.ceil(1_500_001 * 4 / 3))}`;
  await assert.rejects(parseReceiptDraft(oversized, { OPENAI_API_KEY: "test" }, fetchImpl), /receipt_image_invalid/);
  assert.equal(requested, false);
});

test("receipt parser returns the printed currency without converting the amount", async () => {
  let openAiRequest;
  const draft = {
    merchant: "旭川ラーメン",
    date: "2026-12-24",
    total: 1680,
    currency: "JPY",
    category: "餐費",
    note: "味噌拉麵",
    confidence: "high"
  };
  const image = `data:image/jpeg;base64,${"A".repeat(128)}`;
  const result = await parseReceiptDraft(
    image,
    { OPENAI_API_KEY: "test", OPENAI_MODEL: "gpt-4.1-mini" },
    async (url, options) => {
      openAiRequest = JSON.parse(options.body);
      return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify(draft) }] }] });
    },
    async url => {
      assert.equal(url, "https://open.er-api.com/v6/latest/JPY");
      return Response.json({
        result: "success",
        base_code: "JPY",
        time_last_update_unix: 1_791_849_451,
        rates: { TWD: 0.201496 }
      });
    }
  );

  assert.equal(result.total, 1680);
  assert.equal(result.currency, "JPY");
  assert.equal(result.twdTotal, 339);
  assert.equal(result.exchangeRate, 0.201496);
  assert.equal(result.exchangeRateDate, "2026-10-13");
  assert.equal(result.exchangeRateSource, "ExchangeRate-API");
  assert.equal(result.category, "餐費");
  assert.equal(result.confidence, "high");
  assert.equal(openAiRequest.input[0].content[1].type, "input_image");
  assert.equal(openAiRequest.text.format.name, "receipt_expense_draft");
});

test("receipt parser leaves JPY total unconverted when the FX endpoint is unavailable", async () => {
  const draft = { merchant: "店家", date: "", total: 1200, currency: "JPY", category: "餐費", note: "", confidence: "medium" };
  const result = await parseReceiptDraft(
    `data:image/jpeg;base64,${"A".repeat(128)}`,
    { OPENAI_API_KEY: "test" },
    async () => Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify(draft) }] }] }),
    async () => new Response("Unavailable", { status: 503 })
  );

  assert.equal(result.total, 1200);
  assert.equal(result.currency, "JPY");
  assert.equal(result.twdTotal, null);
  assert.equal(result.exchangeRate, null);
});

test("menu image analysis returns Japanese/Traditional Chinese lines and bounded overlay boxes", async () => {
  const imageDataUrl = `data:image/jpeg;base64,${"A".repeat(128)}`;
  const analysis = {
    title: "本日のおすすめ",
    productName: "",
    brand: "",
    description: "",
    features: [],
    priceText: "",
    currency: "JPY",
    menuItems: [{ originalText: "味噌ラーメン", translatedText: "味噌拉麵", description: "味噌湯底", priceText: "1,200円", priceAmount: 1200, currency: "JPY", x: 1.2, y: 0.1, width: 0.4, height: 0.08 }],
    confidence: "high"
  };
  let requestBody;
  const result = await analyzeTravelImage(
    imageDataUrl,
    "menu",
    { OPENAI_API_KEY: "test" },
    async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify(analysis) }] }] });
    },
    async () => Response.json({ result: "success", base_code: "JPY", time_last_update_unix: 1_791_849_451, rates: { TWD: 0.201496 } })
  );

  assert.equal(requestBody.text.format.name, "travel_image_analysis");
  assert.equal(requestBody.tools, undefined);
  assert.match(requestBody.input[0].content[0].text, /Traditional Chinese/);
  assert.equal(result.type, "menu");
  assert.equal(result.menuItems[0].originalText, "味噌ラーメン");
  assert.equal(result.menuItems[0].translatedText, "味噌拉麵");
  assert.equal(result.menuItems[0].x, 1);
  assert.equal(result.menuItems[0].twdPrice, 242);
  assert.equal(result.menuItems[0].exchangeRateDate, "2026-10-13");
});

test("product image analysis returns visible product details without inventing price", async () => {
  const analysis = {
    title: "無線耳機",
    productName: "Noise Cancelling Headphones",
    brand: "Example Audio",
    description: "頭戴式無線耳機。",
    features: ["主動降噪", "藍牙連線"],
    priceText: "",
    currency: "UNKNOWN",
    menuItems: [],
    confidence: "low"
  };
  let requestCount = 0;
  const result = await analyzeTravelImage(`data:image/jpeg;base64,${"A".repeat(128)}`, "product", { OPENAI_API_KEY: "test" }, async () => {
    requestCount += 1;
    return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify(analysis) }] }] });
  });

  assert.equal(result.type, "product");
  assert.equal(result.productName, "Noise Cancelling Headphones");
  assert.equal(result.priceText, "");
  assert.equal(result.currency, "UNKNOWN");
  assert.deepEqual(result.features, ["主動降噪", "藍牙連線"]);
  assert.equal(result.originStatus, "unknown");
  assert.equal(result.referencePriceMin, 0);
  assert.deepEqual(result.purchaseOptions, []);
  assert.deepEqual(result.sources, []);
  assert.equal(result.researchStatus, "not_searched");
  assert.equal(requestCount, 1);
});

test("barcode product analysis uses web search without searching for an image", async () => {
  const research = {
    title: "測試商品",
    productName: "測試商品 100g",
    brand: "測試品牌",
    description: "條碼對應商品。",
    features: ["100g 包裝"],
    priceText: "",
    currency: "UNKNOWN",
    origin: "日本",
    originStatus: "verified",
    limitedScope: "japan",
    limitedEvidence: "官方商品頁列出日本製。",
    tags: [],
    oneLineFeature: "條碼對應的 100g 商品。",
    recommendationReason: "官方資料可確認商品規格。",
    referencePriceMin: 0,
    referencePriceMax: 0,
    referencePriceCurrency: "UNKNOWN",
    referencePriceNote: "",
    purchaseOptions: [],
    confidence: "high"
  };
  let requestBody;
  const result = await analyzeProductBarcode("4901234567894", { OPENAI_API_KEY: "test" }, async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return Response.json({ output: [
      { content: [{ type: "output_text", text: JSON.stringify(research) }] },
      { type: "web_search_call", action: { sources: [{ title: "Official product", url: "https://example.jp/product" }] } }
    ] });
  });

  assert.match(requestBody.input, /4901234567894/);
  assert.equal(JSON.stringify(requestBody).includes("input_image"), false);
  assert.equal(result.identificationMethod, "barcode");
  assert.equal(result.barcode, "4901234567894");
  assert.equal(result.productName, "測試商品 100g");
  assert.equal(result.researchStatus, "completed");
  assert.equal(Object.hasOwn(result, "barcodeImageDataUrl"), false);
});

test("barcode product analysis rejects an invalid checksum before web search", async () => {
  let requested = false;
  await assert.rejects(analyzeProductBarcode("4901234567890", { OPENAI_API_KEY: "test" }, async () => {
    requested = true;
    return Response.json({});
  }), /barcode_invalid/);
  assert.equal(requested, false);
});

test("product image search is required after recognition and returns sourced Asahikawa options", async () => {
  const recognition = {
    title: "流氷DRAFT",
    productName: "流氷ドラフト",
    brand: "網走ビール",
    description: "青色のクラフトビール。",
    features: ["網走の流氷をイメージした青色"],
    priceText: "",
    currency: "UNKNOWN",
    menuItems: [],
    confidence: "high"
  };
  const research = {
    title: "旭川蜂蜜",
    productName: "Asahikawa Clover Honey",
    brand: "Northern Apiary",
    description: "旭川產蜂蜜。",
    features: ["當地蜂場採收"],
    priceText: "",
    currency: "UNKNOWN",
    origin: "北海道旭川市",
    originStatus: "verified",
    limitedScope: "asahikawa",
    limitedEvidence: "生產者頁面註明蜂場位於旭川市。",
    tags: ["旭川限定", "北海道特產", "高 CP 值", "unverified tag"],
    oneLineFeature: "旭川蜂場採收的百花蜜。",
    recommendationReason: "來源確認蜂蜜由旭川蜂場生產，適合想帶回當地農產伴手禮的旅客。",
    referencePriceMin: 1200,
    referencePriceMax: 1600,
    referencePriceCurrency: "JPY",
    referencePriceNote: "依官方 150g 瓶裝與零售頁價格。",
    purchaseOptions: [{
      name: "Northern Apiary Shop",
      area: "asahikawa",
      address: "旭川市",
      reason: "生產者官方網站列為直營販售點。",
      availability: "product_listed"
    }],
    confidence: "high"
  };
  const requestBodies = [];
  const result = await analyzeTravelImage(
    `data:image/jpeg;base64,${"A".repeat(128)}`,
    "product",
    { OPENAI_API_KEY: "test" },
    async (_url, options) => {
      const requestBody = JSON.parse(options.body);
      requestBodies.push(requestBody);
      if (requestBody.text.format.name === "travel_image_analysis") {
        return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify(recognition) }] }] });
      }
      return Response.json({ output: [
        { content: [{ type: "output_text", text: JSON.stringify(research) }] },
        { type: "web_search_call", action: { sources: [
          { title: "Official producer", url: "https://example.jp/honey" },
          { title: "Insecure result", url: "http://example.jp/honey" },
          { title: "Official producer duplicate", url: "https://example.jp/honey" }
        ] } }
      ] });
    },
    async () => Response.json({ result: "success", base_code: "JPY", time_last_update_unix: 1_791_849_451, rates: { TWD: 0.2 } })
  );

  assert.equal(requestBodies.length, 2);
  assert.equal(requestBodies[0].tools, undefined);
  assert.equal(requestBodies[1].text.format.name, "travel_product_research");
  assert.equal(requestBodies[1].tools[0].type, "web_search");
  assert.equal(requestBodies[1].tool_choice, "required");
  assert.match(requestBodies[1].input, /Asahikawa/i);
  assert.match(requestBodies[1].input, /網走ビール/);
  assert.equal(result.productName, "流氷ドラフト");
  assert.equal(result.researchStatus, "completed");
  assert.equal(result.originStatus, "verified");
  assert.equal(result.limitedScope, "asahikawa");
  assert.deepEqual(result.tags, ["旭川限定", "北海道特產", "高 CP 值"]);
  assert.equal(result.referencePriceTwdMin, 240);
  assert.equal(result.referencePriceTwdMax, 320);
  assert.equal(result.referenceExchangeRateDate, "2026-10-13");
  assert.equal(result.purchaseOptions[0].availability, "product_listed");
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].url, "https://example.jp/honey");
});

test("product image search failure preserves visual recognition", async () => {
  const recognition = {
    title: "流氷DRAFT",
    productName: "流氷ドラフト",
    brand: "網走ビール",
    description: "青色のクラフトビール。",
    features: [],
    priceText: "",
    currency: "UNKNOWN",
    menuItems: [],
    confidence: "high"
  };
  let requestCount = 0;
  const result = await analyzeTravelImage(`data:image/jpeg;base64,${"A".repeat(128)}`, "product", { OPENAI_API_KEY: "test" }, async () => {
    requestCount += 1;
    if (requestCount === 2) throw new Error("search service unavailable");
    return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify(recognition) }] }] });
  });

  assert.equal(result.productName, "流氷ドラフト");
  assert.equal(result.researchStatus, "search_unavailable");
  assert.equal(result.referencePriceMin, 0);
  assert.deepEqual(result.purchaseOptions, []);
});

test("travel image analysis rejects invalid image types before calling OpenAI", async () => {
  let requested = false;
  await assert.rejects(analyzeTravelImage("not-an-image", "menu", { OPENAI_API_KEY: "test" }, async () => {
    requested = true;
    return Response.json({});
  }), /image_invalid/);
  assert.equal(requested, false);
});

test("identification failures retain a suggested Google Maps place name", () => {
  const result = placeLookupFailure("山頭火 旭川本店", "ai_unavailable", [
    { title: "Google Maps", url: "https://www.google.com/maps/place/test" }
  ]);
  assert.equal(result.found, false);
  assert.equal(result.suggestedName, "山頭火 旭川本店");
  assert.equal(result.failureReason, "ai_unavailable");
  assert.equal(result.sources.length, 1);
});

test("daily quota failures retain the resolved Maps title", () => {
  const result = placeLookupFailure("山頭火 旭川本店", "daily_limit");
  assert.equal(result.suggestedName, "山頭火 旭川本店");
  assert.equal(result.failureReason, "daily_limit");
});

test("AI identification returns a cited place name and address, not coordinates", () => {
  const result = parsePlaceIdentificationResult(
    JSON.stringify({
      found: true,
      placeName: "旭川市科学館サイパル",
      alternateNames: ["旭川市科学館"],
      address: "北海道旭川市",
      latitude: 43.7681,
      longitude: 142.3655,
      scope: "asahikawa",
      introduction: {
        language: "zh-Hant",
        placeType: "museum",
        cuisineType: "should be discarded",
        signatureDishes: ["should be discarded"],
        keyFeatures: ["互動式展示"],
        visitReason: "適合親子與科學愛好者。"
      }
    }),
    [{ title: "Official place page", url: "https://example.jp/place" }]
  );
  assert.equal(result.found, true);
  assert.equal(result.placeName, "旭川市科学館サイパル");
  assert.deepEqual(result.alternateNames, ["旭川市科学館"]);
  assert.equal(result.scope, "asahikawa");
  assert.equal(result.sources.length, 1);
  assert.equal("latitude" in result, false);
  assert.deepEqual(result.introduction, {
    language: "zh-Hant",
    placeType: "museum",
    cuisineType: "",
    signatureDishes: [],
    keyFeatures: ["互動式展示"],
    visitReason: "適合親子與科學愛好者。",
    recommendationStars: 0,
    recommendationReason: "",
    sources: result.sources
  });
});

test("AI introduction response schema preserves the detected source language", () => {
  const format = placeIdentificationResponseFormat;
  assert.equal(format.type, "json_schema");
  assert.equal(format.strict, true);
  assert.equal(format.schema.properties.introduction.properties.language.type, "string");
  assert.equal("enum" in format.schema.properties.introduction.properties.language, false);
  assert.equal(format.schema.additionalProperties, false);
  assert.equal(format.schema.properties.introduction.additionalProperties, false);
});

test("translation response schema requires Traditional Chinese", () => {
  const format = placeIntroductionTranslationResponseFormat;
  assert.equal(format.type, "json_schema");
  assert.equal(format.strict, true);
  assert.deepEqual(format.schema.properties.language.enum, ["zh-Hant"]);
  assert.equal(format.schema.additionalProperties, false);
});

test("translates sourced fields while preserving the rating and citations", async () => {
  const introduction = {
    language: "ja",
    placeType: "restaurant",
    cuisineType: "ジンギスカン",
    signatureDishes: ["ラム肉"],
    keyFeatures: ["炭火焼き"],
    visitReason: "北海道の郷土料理を味わえる。",
    recommendationStars: 4,
    recommendationReason: "公式サイトで専門店と確認できる。",
    sources: [{ title: "Official site", url: "https://example.jp/" }]
  };
  const translated = await translatePlaceIntroduction(introduction, { OPENAI_API_KEY: "test-key" }, async (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const requestBody = JSON.parse(options.body);
    assert.equal(requestBody.text.format.name, "traditional_chinese_place_introduction");
    return Response.json({ output: [{ content: [{ type: "output_text", text: JSON.stringify({
      language: "zh-Hant",
      placeType: "restaurant",
      cuisineType: "成吉思汗烤肉",
      signatureDishes: ["羊肉"],
      keyFeatures: ["炭火燒烤"],
      visitReason: "可品嚐北海道鄉土料理。",
      recommendationStars: 4,
      recommendationReason: "官方網站確認是專門店。"
    }) }] }] });
  });

  assert.equal(translated.language, "zh-Hant");
  assert.equal(translated.cuisineType, "成吉思汗烤肉");
  assert.equal(translated.recommendationStars, 4);
  assert.deepEqual(translated.sources, introduction.sources);
});

test("restaurant introduction preserves cuisine, signature dishes, features, and cited sources", () => {
  const sources = [{ title: "Restaurant official site", url: "https://example.jp/menu" }];
  const result = parsePlaceIdentificationResult(JSON.stringify({
    found: true,
    placeName: "旭川拉麵店",
    address: "北海道旭川市",
    scope: "asahikawa",
    introduction: {
      language: "zh-Hant",
      placeType: "restaurant",
      cuisineType: "旭川醬油拉麵",
      signatureDishes: ["醬油拉麵", "鹽味拉麵"],
      keyFeatures: ["以豬骨與魚介熬製湯頭"],
      visitReason: "品嚐當地代表性的旭川拉麵。",
      recommendationStars: 5,
      recommendationReason: "來源明確記載其為旭川代表性拉麵。"
    }
  }), sources);

  assert.equal(result.introduction.placeType, "restaurant");
  assert.equal(result.introduction.cuisineType, "旭川醬油拉麵");
  assert.deepEqual(result.introduction.signatureDishes, ["醬油拉麵", "鹽味拉麵"]);
  assert.equal(result.introduction.recommendationStars, 5);
  assert.equal(result.introduction.recommendationReason, "來源明確記載其為旭川代表性拉麵。");
  assert.deepEqual(result.introduction.sources, sources);
});

test("empty AI descriptions are not marked as generated introductions", () => {
  const result = parsePlaceIdentificationResult(JSON.stringify({
    found: true,
    placeName: "未找到介紹的店家",
    address: "北海道旭川市",
    scope: "asahikawa",
    introduction: {
      placeType: "restaurant",
      cuisineType: "",
      signatureDishes: [],
      keyFeatures: [],
      visitReason: ""
    }
  }), [{ title: "Map page", url: "https://example.jp/place" }]);

  assert.equal(result.found, true);
  assert.equal(result.introduction, null);
});

test("preserves cited non-Traditional-Chinese introduction fields for translation", () => {
  const result = parsePlaceIdentificationResult(JSON.stringify({
    found: true,
    placeName: "旭川拉麵店",
    address: "北海道旭川市",
    scope: "asahikawa",
    introduction: {
      language: "zh-Hans",
      placeType: "restaurant",
      cuisineType: "旭川酱油拉面",
      signatureDishes: ["酱油拉面"],
      keyFeatures: ["本地风味"],
      visitReason: "品尝当地特色拉面。"
    }
  }), [{ title: "Source", url: "https://example.jp/place" }]);

  assert.equal(result.found, true);
  assert.equal(result.introduction.language, "zh-hans");
  assert.equal(result.introduction.cuisineType, "旭川酱油拉面");
  assert.equal(result.introduction.sources.length, 1);
});

test("zh-Hant-TW locale aliases are normalized to zh-Hant", () => {
  const result = parsePlaceIdentificationResult(JSON.stringify({
    found: true,
    placeName: "旭川拉麵店",
    address: "北海道旭川市",
    scope: "asahikawa",
    introduction: {
      language: "zh-Hant-TW",
      placeType: "restaurant",
      cuisineType: "旭川醬油拉麵",
      signatureDishes: [],
      keyFeatures: [],
      visitReason: "品嚐當地特色。"
    }
  }), [{ title: "Source", url: "https://example.jp/place" }]);

  assert.equal(result.introduction.language, "zh-Hant");
});

test("requires a cited exact place identification", () => {
  const result = parsePlaceIdentificationResult(
    JSON.stringify({ found: true, placeName: "市科學館", address: "", scope: "asahikawa" }),
    []
  );
  assert.deepEqual(result, { found: false, sources: [] });
});

test("Text Search biases toward Hokkaido and only requests place IDs", () => {
  const body = placesTextSearchBody({ placeName: "旭川市科学館サイパル", address: "北海道旭川市宮前" });
  assert.equal(body.textQuery, "旭川市科学館サイパル, 北海道旭川市宮前, 北海道 日本");
  assert.equal(body.pageSize, 1);
  assert.equal(body.regionCode, "JP");
  assert.deepEqual(body.locationBias.rectangle, {
    low: { latitude: 41.2, longitude: 139.2 },
    high: { latitude: 45.7, longitude: 148.9 }
  });
});

test("Text Search gets a place ID before Essentials Details returns its location", async () => {
  const calls = [];
  const result = await findGooglePlace({ placeName: "旭川市科学館サイパル", address: "北海道旭川市" }, "test-key", async (url, options = {}) => {
    calls.push({ url, options });
    return calls.length === 1
      ? Response.json({ places: [{ id: "place-id-123" }] })
      : Response.json({ formattedAddress: "北海道旭川市宮前", location: { latitude: 43.7563, longitude: 142.3704 } });
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://places.googleapis.com/v1/places:searchText");
  assert.equal(calls[0].options.headers["X-Goog-FieldMask"], "places.id");
  assert.equal(calls[1].url, "https://places.googleapis.com/v1/places/place-id-123");
  assert.equal(calls[1].options.headers["X-Goog-FieldMask"], "location");
  assert.equal(result.found, true);
  assert.equal(result.placeId, "place-id-123");
  assert.equal(result.latitude, 43.7563);
  assert.equal(result.longitude, 142.3704);
  assert.equal(result.method, "google_places");
});

test("Text Search returns no match without calling Place Details", async () => {
  let calls = 0;
  const result = await findGooglePlace({ placeName: "不存在的地點" }, "test-key", async () => {
    calls += 1;
    return Response.json({ places: [] });
  });
  assert.equal(result, null);
  assert.equal(calls, 1);
});

test("Place Details coordinates outside Hokkaido are rejected", async () => {
  const result = await findGooglePlace({ placeName: "東京車站" }, "test-key", async (url) =>
    url.endsWith("searchText")
      ? Response.json({ places: [{ id: "tokyo-station" }] })
      : Response.json({ formattedAddress: "東京都", location: { latitude: 35.6812, longitude: 139.7671 } }));
  assert.deepEqual(result, { found: false, outsideHokkaido: true });
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

test("AI prompt separates venue names from appended Google Maps address text", () => {
  const prompt = buildPlaceIdentificationPrompt({
    name: "山頭火 旭川本店 MANNY BLD 1F 8 Chome-348-6 1 Jodori, Asahikawa, Hokkaido",
    address: "",
    coordinates: { latitude: 43.77, longitude: 142.36 }
  });
  assert.match(prompt, /Google Maps title may concatenate the venue name, building, floor, street, city, and postal code/);
  assert.match(prompt, /separate the core venue name from address context/);
  assert.match(prompt, /Place name:.*山頭火 旭川本店/);
  assert.match(prompt, /Google Maps pin coordinates: 43\.77, 142\.36/);
  assert.doesNotMatch(prompt, /reverse-geocoded OpenStreetMap/);
});

test("refreshes an expired location directly from its stored Place ID", async () => {
  const calls = [];
  const result = await findGooglePlace({ placeId: "place-id-saved", placeName: "旭川市科学館" }, "test-key", async url => {
    calls.push(url);
    return Response.json({ location: { latitude: 43.7563, longitude: 142.3704 } });
  });

  assert.deepEqual(calls, ["https://places.googleapis.com/v1/places/place-id-saved"]);
  assert.equal(result.placeId, "place-id-saved");
  assert.equal(result.method, "google_places");
});

test("normalizes Kamui piste difficulties and aerialways from OSM geometry", () => {
  const result = normalizeKamuiMapElements([
    { type: "way", id: 1, tags: { name: "ダイナミック", "piste:type": "downhill", "piste:difficulty": "advanced" }, geometry: [{ lat: 43.7, lon: 142.2 }, { lat: 43.71, lon: 142.21 }] },
    { type: "way", id: 2, tags: { name: "カムイゴンドラ", aerialway: "gondola" }, geometry: [{ lat: 43.7, lon: 142.2 }, { lat: 43.72, lon: 142.22 }] },
    { type: "way", id: 3, tags: { name: "bad geometry", "piste:type": "downhill" }, geometry: [{ lat: "bad", lon: 142.2 }] }
  ], "2026-10-12T00:00:00.000Z");

  assert.equal(result.source, "OpenStreetMap");
  assert.equal(result.features.length, 2);
  assert.equal(result.features[0].difficulty, "advanced");
  assert.deepEqual(result.features[0].geometry[0], { lat: 43.7, lng: 142.2 });
  assert.equal(result.features[1].kind, "lift");
  assert.equal(result.features[1].aerialway, "gondola");
});

test("Kamui OSM data fetch uses the fixed map query and a descriptive user agent", async () => {
  let requestedUrl;
  let requestedUserAgent;
  const result = await getKamuiMapData(async (url, options) => {
    requestedUrl = new URL(url);
    requestedUserAgent = options.headers["User-Agent"];
    return Response.json({ elements: [
      { type: "way", id: 1, tags: { "piste:type": "downhill", "piste:difficulty": "intermediate" }, geometry: [{ lat: 43.7, lon: 142.2 }, { lat: 43.71, lon: 142.21 }] }
    ] });
  });

  assert.equal(requestedUrl.hostname, "overpass.openstreetmap.fr");
  const query = requestedUrl.searchParams.get("data");
  assert.match(query, /aerialway/);
  assert.match(query, /43\.685,142\.185,43\.72,142\.225/);
  assert.match(requestedUserAgent, /SharePayKamuiMap/);
  assert.equal(result.features.length, 1);
});

test("Santa Present Park and Pippu use their own fixed OSM bounds", async () => {
  const resorts = [
    { id: "santa-present-park", bounds: "43.745,142.285,43.775,142.32" },
    { id: "pippu", bounds: "43.915,142.48,43.955,142.53" }
  ];

  for (const resort of resorts) {
    let requestedQuery;
    const result = await getKamuiMapData(async url => {
      requestedQuery = new URL(url).searchParams.get("data");
      return Response.json({ elements: [
        { type: "way", id: 3, tags: { "piste:type": "downhill" }, geometry: [{ lat: 43.7, lon: 142.2 }, { lat: 43.71, lon: 142.21 }] }
      ] });
    }, false, resort.id);

    assert.ok(requestedQuery.includes(resort.bounds));
    assert.equal(result.resortId, resort.id);
    assert.equal(result.features.length, 1);
  }
});

test("rejects ski resort IDs outside the allowlist before querying Overpass", async () => {
  let requested = false;
  await assert.rejects(getKamuiMapData(async () => {
    requested = true;
    return Response.json({ elements: [] });
  }, false, "toString"), /Unknown ski resort/);
  assert.equal(requested, false);
});

test("Kamui OSM data fetch falls back when the primary Overpass endpoint fails", async () => {
  const requestedHosts = [];
  const result = await getKamuiMapData(async url => {
    const host = new URL(url).hostname;
    requestedHosts.push(host);
    if (host === "overpass.openstreetmap.fr") return new Response("Unavailable", { status: 504 });
    return Response.json({ elements: [
      { type: "way", id: 2, tags: { name: "lift", aerialway: "gondola" }, geometry: [{ lat: 43.7, lon: 142.2 }, { lat: 43.71, lon: 142.21 }] }
    ] });
  });

  assert.deepEqual(requestedHosts, ["overpass.openstreetmap.fr", "overpass-api.de"]);
  assert.equal(result.features.length, 1);
  assert.equal(result.features[0].kind, "lift");
});

test("serves a fresh Kamui KV snapshot without querying Overpass", async () => {
  const snapshot = { source: "OpenStreetMap", fetchedAt: new Date().toISOString(), features: [{ id: "way-1" }] };
  const calls = [];
  const cache = { get: async () => ({ savedAt: Date.now(), data: snapshot }) };
  const result = await serveKamuiMapData({ KAMUI_MAP_CACHE: cache }, undefined, async () => {
    calls.push("overpass");
    throw new Error("Overpass should not be called for a fresh snapshot");
  });

  assert.deepEqual(result, snapshot);
  assert.deepEqual(calls, []);
});

test("each ski resort reads its own KV snapshot", async () => {
  const snapshots = new Map([
    ["ski-map-data-v3:kamui", { resortId: "kamui" }],
    ["ski-map-data-v1:santa-present-park", { resortId: "santa-present-park" }],
    ["ski-map-data-v1:pippu", { resortId: "pippu" }]
  ]);
  const requestedKeys = [];
  const cache = {
    get: async key => {
      requestedKeys.push(key);
      return { savedAt: Date.now(), data: snapshots.get(key) };
    }
  };

  for (const resortId of ["kamui", "santa-present-park", "pippu"]) {
    const result = await serveKamuiMapData({ KAMUI_MAP_CACHE: cache }, undefined, async () => {
      throw new Error("A fresh resort snapshot should not query Overpass");
    }, resortId);
    assert.equal(result.resortId, resortId);
  }

  assert.deepEqual(requestedKeys, [...snapshots.keys()]);
});

test("serves stale Kamui KV data immediately and refreshes in the background", async () => {
  const snapshot = { source: "OpenStreetMap", fetchedAt: "2026-01-01T00:00:00.000Z", features: [{ id: "way-1" }] };
  let savedRecord = { savedAt: Date.now() - 7 * 60 * 60 * 1000, data: snapshot };
  const tasks = [];
  const cache = {
    get: async () => savedRecord,
    put: async (_key, value) => { savedRecord = JSON.parse(value); }
  };
  const ctx = { waitUntil: task => tasks.push(task) };
  const result = await serveKamuiMapData({ KAMUI_MAP_CACHE: cache }, ctx, async () => Response.json({ elements: [
    { type: "way", id: 2, tags: { name: "Piste", "piste:type": "downhill" }, geometry: [{ lat: 43.7, lon: 142.2 }, { lat: 43.71, lon: 142.21 }] }
  ] }));

  assert.equal(result.stale, true);
  assert.deepEqual(result.features, snapshot.features);
  assert.equal(tasks.length, 1);
  await Promise.all(tasks);
  assert.equal(savedRecord.data.features[0].id, "way-2");
});

test("keeps serving stale Kamui KV data when Overpass refresh fails", async () => {
  const snapshot = { source: "OpenStreetMap", fetchedAt: "2026-01-01T00:00:00.000Z", features: [{ id: "way-1" }] };
  const cache = { get: async () => ({ savedAt: Date.now() - 7 * 60 * 60 * 1000, data: snapshot }) };
  const result = await serveKamuiMapData({ KAMUI_MAP_CACHE: cache }, undefined, async () => new Response("Unavailable", { status: 503 }));

  assert.equal(result.stale, true);
  assert.deepEqual(result.features, snapshot.features);
});