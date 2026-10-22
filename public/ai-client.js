const workerUrl = "https://sharepay-openai-api.zzdanny781024.workers.dev";

function validateProductResearchResult(result) {
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

export async function requestKamuiMapData({ user, resortId = "all" } = {}) {
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
  if (!response.ok) throw new Error(result.error || "滑雪場圖資暫時無法使用。");
  if (result.source !== "OpenStreetMap") {
    throw new Error("滑雪場圖資回應格式不正確。");
  }
  if (resortId === "all" || !resortId) {
    if (!result.resorts || typeof result.resorts !== "object") {
      throw new Error("滑雪場離線圖資格式不正確。");
    }
    return result;
  }
  if (!Array.isArray(result.features)) {
    throw new Error("滑雪場圖資回應格式不正確。");
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

export async function requestJpyTwdRate({ user }) {
  if (!user || typeof user.getIdToken !== "function") throw new Error("請先登入後再取得匯率。");
  const token = await user.getIdToken();
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action: "jpy_twd_rate" })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "日圓匯率暫時無法取得，請稍後重試。");
  if (!Number.isFinite(result.rate) || result.rate <= 0 || typeof result.date !== "string" || typeof result.source !== "string") {
    throw new Error("匯率資料格式錯誤，請稍後重試。");
  }
  return result;
}

export async function requestItinerarySchedule({ user, stage }) {
  if (!user || typeof user.getIdToken !== "function") throw new Error("請先登入旅遊分帳後再使用 AI 更新班次。");
  const token = await user.getIdToken();
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action: "itinerary_schedule", stage })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "AI 班次查詢暫時無法使用。");
  const isTime = value => typeof value === "string" && (value === "" || /^\d{2}:\d{2}$/.test(value));
  const isService = service => service && isTime(service.departure) && isTime(service.arrival) && typeof service.trainName === "string";
  if (!isService(result.airportTrain) || !isService(result.limitedExpress)
    || !Array.isArray(result.alternatives) || !result.alternatives.every(isService)
    || !Array.isArray(result.sources) || typeof result.tokyoTime !== "string") {
    throw new Error("班次資料格式錯誤，請重試。");
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
    validateProductResearchResult(result);
  }
  return result;
}

export async function requestProductBarcodeAnalysis({ user, barcode }) {
  if (!user || typeof user.getIdToken !== "function") throw new Error("Sign-in required.");
  if (!/^\d+$/.test(barcode || "") || ![8, 12, 13, 14].includes(barcode.length)) throw new Error("請掃描有效的 JAN／EAN 商品條碼。");
  const token = await user.getIdToken();
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ action: "analyze_product_barcode", barcode })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "條碼商品搜尋暫時無法使用。");
  if (result.type !== "product" || result.identificationMethod !== "barcode" || result.barcode !== barcode
    || typeof result.title !== "string" || typeof result.productName !== "string"
    || typeof result.description !== "string" || !Array.isArray(result.features)
    || !Array.isArray(result.menuItems) || !["high", "medium", "low"].includes(result.confidence)) {
    throw new Error("條碼商品搜尋結果格式錯誤，請重試。");
  }
  validateProductResearchResult(result);
  return result;
}

export function extractYouTubeId(url) {
  if (!url || typeof url !== "string") return null;
  const match = url.trim().match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/i);
  return match ? match[1] : null;
}

export function getYouTubeThumbnailUrl(videoId, quality = "hq") {
  if (!videoId) return "";
  if (quality === "max") return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  if (quality === "mq") return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export async function fetchYouTubeOEmbed(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) return null;
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
    const response = await fetch(oembedUrl, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) return { videoId, title: "", author: "", thumbnailUrl: getYouTubeThumbnailUrl(videoId) };
    const data = await response.json();
    return {
      videoId,
      title: typeof data.title === "string" ? data.title : "",
      author: typeof data.author_name === "string" ? data.author_name : "",
      thumbnailUrl: data.thumbnail_url || getYouTubeThumbnailUrl(videoId)
    };
  } catch {
    return { videoId, title: "", author: "", thumbnailUrl: getYouTubeThumbnailUrl(videoId) };
  }
}

export async function requestSnowboardAnalysis({ user, videoUrl, title, transcript }) {
  if (!user || typeof user.getIdToken !== "function") throw new Error("請先登入旅遊分帳後再使用 AI 教練分析。");
  const cleanTranscript = (transcript || "").trim();
  const cleanTitle = (title || "").trim();
  if (!cleanTranscript && !cleanTitle) {
    throw new Error("請填寫影片字幕檔或影片標題。");
  }
  const token = await user.getIdToken();
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "analyze_snowboard_video",
      videoUrl: videoUrl || "",
      title: cleanTitle,
      transcript: cleanTranscript
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "AI 滑雪教練分析暫時無法使用。");
  if (!result || typeof result.category !== "string") {
    throw new Error("AI 回傳格式不正確，請稍後重試。");
  }
  return result;
}

export async function requestYouTubeTranscript({ user, videoUrl, videoId }) {
  if (!user || typeof user.getIdToken !== "function") throw new Error("請先登入旅遊分帳。");
  const targetId = videoId || extractYouTubeId(videoUrl);
  if (!targetId) throw new Error("無效的 YouTube 影片網址。");
  const token = await user.getIdToken();
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "fetch_youtube_transcript",
      videoId: targetId,
      videoUrl: videoUrl || ""
    })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "自動取得字幕失敗。");
  return result;
}