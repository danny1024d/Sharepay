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