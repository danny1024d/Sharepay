const workerUrl = "https://sharepay-openai-api.zzdanny781024.workers.dev";

export async function requestPlaceCoordinates({ user, name, address, mapsUrl }) {
  if (!user || typeof user.getIdToken !== "function") throw new Error("Sign-in required.");
  if (typeof mapsUrl !== "string" || !mapsUrl.trim()) throw new Error("Google Maps share link is required.");

  const token = await user.getIdToken();
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ name: name || "", address: address || "", mapsUrl: mapsUrl || "" })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "AI service is temporarily unavailable.");
  if (result.found === false) return { found: false, sources: [], suggestedName: result.suggestedName || "" };
  if (result.found !== true || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)
    || !["asahikawa", "hokkaido"].includes(result.scope) || !Array.isArray(result.sources)) {
    throw new Error("AI service returned an invalid location.");
  }
  return result;
}