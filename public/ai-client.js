const workerUrl = "https://sharepay-openai-api.zzdanny781024.workers.dev";

export async function requestPlaceCoordinates({ user, name, address, mapsUrl, placeId }) {
  if (!user || typeof user.getIdToken !== "function") throw new Error("Sign-in required.");
  if ((!mapsUrl || !mapsUrl.trim()) && !placeId) throw new Error("Google Maps share link or Place ID is required.");

  const token = await user.getIdToken();
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: name || "", address: address || "", mapsUrl: mapsUrl || "", placeId: placeId || "" })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || "Location lookup is temporarily unavailable.");
    error.suggestedName = result.suggestedName || "";
    error.failureReason = result.failureReason || "request_failed";
    throw error;
  }
  if (result.found === false) return {
    found: false,
    sources: result.sources || [],
    suggestedName: result.suggestedName || "",
    failureReason: result.failureReason || "",
    introduction: result.introduction || null
  };
  if (result.found !== true || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)
    || !["asahikawa", "hokkaido"].includes(result.scope) || !Array.isArray(result.sources)) {
    throw new Error("AI service returned an invalid location.");
  }
  return result;
}

export async function requestKamuiMapData({ user, resortId = "kamui" }) {
  if (!user || typeof user.getIdToken !== "function") throw new Error("Sign-in required.");
  const token = await user.getIdToken();
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action: "kamui_map_data", resortId })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Kamui map data is temporarily unavailable.");
  if (result.source !== "OpenStreetMap" || !Array.isArray(result.features)) {
    throw new Error("Kamui map data response was invalid.");
  }
  return result;
}

export async function requestReceiptDraft({ user, imageDataUrl }) {
  if (!user || typeof user.getIdToken !== "function") throw new Error("Sign-in required.");
  const token = await user.getIdToken();
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action: "parse_receipt", imageDataUrl })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "收據辨識暫時無法使用。");
  if (typeof result.merchant !== "string" || typeof result.date !== "string"
    || !Number.isFinite(result.total) || !["TWD", "JPY", "USD", "CNY", "HKD", "KRW", "OTHER", "UNKNOWN"].includes(result.currency)
    || !["住宿", "餐費", "交通", "滑雪", "雜支"].includes(result.category)
    || !["high", "medium", "low"].includes(result.confidence)) {
    throw new Error("收據辨識結果格式錯誤，請重試。");
  }
  return result;
}

export async function requestTravelImageAnalysis({ user, imageDataUrl, analysisType }) {
  if (!user || typeof user.getIdToken !== "function") throw new Error("Sign-in required.");
  if (!["menu", "product"].includes(analysisType)) throw new Error("請選擇菜單或商品辨識。");
  const token = await user.getIdToken();
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action: "analyze_travel_image", imageDataUrl, analysisType })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "圖片辨識暫時無法使用。");
  if (result.type !== analysisType || typeof result.title !== "string"
    || typeof result.productName !== "string" || typeof result.description !== "string"
    || !Array.isArray(result.features) || !Array.isArray(result.menuItems)
    || !["high", "medium", "low"].includes(result.confidence)) {
    throw new Error("圖片辨識結果格式錯誤，請重試。");
  }
  if (analysisType === "product") {
    const validCurrencies = ["JPY", "TWD", "USD", "CNY", "HKD", "KRW", "OTHER", "UNKNOWN"];
    const validTags = ["旭川限定", "北海道限定", "北海道特產", "特色伴手禮", "高 CP 值"];
    const validAreas = ["asahikawa", "hokkaido_other", "unknown"];
    const validAvailability = ["product_listed", "store_confirmed", "unknown"];
    const validResearchStatuses = ["completed", "not_found", "not_searched", "search_unavailable"];
    const safeSources = Array.isArray(result.sources) && result.sources.every(source => {
      try {
        return typeof source.title === "string" && new URL(source.url).protocol === "https:";
      } catch {
        return false;
      }
    });
    const validPurchaseOptions = Array.isArray(result.purchaseOptions) && result.purchaseOptions.every(option =>
      typeof option.name === "string" && validAreas.includes(option.area)
      && typeof option.address === "string" && typeof option.reason === "string"
      && validAvailability.includes(option.availability)
    );
    if (typeof result.origin !== "string" || !["verified", "unknown"].includes(result.originStatus)
      || !["asahikawa", "hokkaido", "japan", "not_limited", "unknown"].includes(result.limitedScope)
      || typeof result.limitedEvidence !== "string"
      || !Array.isArray(result.tags) || result.tags.some(tag => !validTags.includes(tag))
      || typeof result.oneLineFeature !== "string" || typeof result.recommendationReason !== "string"
      || !Number.isFinite(result.referencePriceMin) || !Number.isFinite(result.referencePriceMax)
      || !validCurrencies.includes(result.referencePriceCurrency)
      || typeof result.referencePriceNote !== "string"
      || !validResearchStatuses.includes(result.researchStatus)
      || !validPurchaseOptions || !safeSources
      || ![null, "", undefined].includes(result.referencePriceTwdMin) && !Number.isFinite(result.referencePriceTwdMin)
      || ![null, "", undefined].includes(result.referencePriceTwdMax) && !Number.isFinite(result.referencePriceTwdMax)) {
      throw new Error("商品查證結果格式錯誤，請重試。");
    }
  }
  return result;
}