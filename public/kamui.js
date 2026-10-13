import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { allowedEmails, firebaseConfig, googleMapsApiKey, googleMapsMapId } from "./firebase-config.js?v=kamui-vector-v1";
import { requestKamuiMapData } from "./ai-client.js?v=kamui-map-v1";

const isConfigured = !Object.values(firebaseConfig).some(value => value.includes("YOUR_"));
const mapStatus = document.getElementById("kamui-map-status");
const mapRetry = document.getElementById("kamui-map-retry");
const liftList = document.getElementById("kamui-lift-list");
let googleMapsLibraryPromise;
let map;
let infoWindow;
let pisteTileLayer;
let mapLines = [];
let currentLocationMarker;
let currentUser;
let kamuiMapFeatures = [];

const kamuiMapHeading = 120;
const earthRadiusMeters = 6_378_137;
const mapMetersPerPixelAtZoomZero = 156_543.03392;

function fitKamuiMapView(features) {
  const points = features.flatMap(feature => feature.geometry || []);
  if (!points.length) return;

  const heading = kamuiMapHeading * Math.PI / 180;
  const cosHeading = Math.cos(heading);
  const sinHeading = Math.sin(heading);
  const projected = points.map(point => {
    const longitude = point.lng * Math.PI / 180;
    const latitude = Math.max(-85.05112878, Math.min(85.05112878, point.lat)) * Math.PI / 180;
    const x = earthRadiusMeters * longitude;
    const y = earthRadiusMeters * Math.log(Math.tan(Math.PI / 4 + latitude / 2));
    return {
      x: x * cosHeading - y * sinHeading,
      y: x * sinHeading + y * cosHeading
    };
  });
  const xs = projected.map(point => point.x);
  const ys = projected.map(point => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const centerMercatorX = centerX * cosHeading + centerY * sinHeading;
  const centerMercatorY = -centerX * sinHeading + centerY * cosHeading;
  const center = {
    lat: Math.atan(Math.sinh(centerMercatorY / earthRadiusMeters)) * 180 / Math.PI,
    lng: centerMercatorX / earthRadiusMeters * 180 / Math.PI
  };
  const viewport = map.getDiv().getBoundingClientRect();
  const zoom = Math.min(
    Math.log2(mapMetersPerPixelAtZoomZero * viewport.width * 0.84 / Math.max(1, maxX - minX)),
    Math.log2(mapMetersPerPixelAtZoomZero * viewport.height * 0.66 / Math.max(1, maxY - minY))
  );

  map.setCenter(center);
  map.setZoom(zoom);
  map.setHeading(kamuiMapHeading);
}

function isAllowed(email) {
  return Boolean(email) && allowedEmails.some(value => value.toLowerCase() === email.toLowerCase());
}

function loadGoogleMaps() {
  if (!googleMapsApiKey?.trim()) return Promise.reject(new Error("Google Maps key is missing."));
  if (window.google?.maps?.importLibrary) return Promise.resolve();
  if (googleMapsLibraryPromise) return googleMapsLibraryPromise;

  googleMapsLibraryPromise = new Promise((resolve, reject) => {
    const callbackName = `__kamuiMapsReady${Date.now()}`;
    const timeout = setTimeout(() => finish(reject, new Error("Google Maps load timed out.")), 15_000);
    const finish = (callback, value) => {
      clearTimeout(timeout);
      delete window[callbackName];
      callback(value);
    };
    window[callbackName] = () => finish(resolve);
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey)}&loading=async&callback=${callbackName}&language=zh-TW&region=JP&v=weekly`;
    script.onerror = () => finish(reject, new Error("Google Maps failed to load."));
    document.head.append(script);
  }).catch(error => {
    googleMapsLibraryPromise = null;
    throw error;
  });
  return googleMapsLibraryPromise;
}

function difficultyStyle(difficulty) {
  if (difficulty === "easy" || difficulty === "novice") return { color: "#15803d", label: "初級" };
  if (difficulty === "intermediate") return { color: "#dc2626", label: "中級" };
  if (difficulty === "advanced" || difficulty === "expert") return { color: "#111827", label: "高級" };
  return { color: "#64748b", label: "難度未標記" };
}

function addLine(feature, Polyline) {
  const isLift = feature.kind === "lift";
  const style = isLift ? { color: "#ea580c", label: "纜車" } : difficultyStyle(feature.difficulty);
  const line = new Polyline({
    map,
    path: feature.geometry,
    clickable: true,
    strokeColor: style.color,
    strokeOpacity: 0.92,
    strokeWeight: isLift ? 3 : 5,
    zIndex: isLift ? 2 : 1,
    icons: isLift ? [{
      icon: { path: "M 0,-1 0,1", strokeOpacity: 0.85, scale: 3 },
      offset: "0",
      repeat: "14px"
    }] : undefined
  });
  line.addListener("click", event => {
    const content = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = feature.name;
    const detail = document.createElement("p");
    detail.textContent = isLift ? "營運狀態與收班時間請查官方公告" : `${style.label}雪道`;
    content.append(name, detail);
    infoWindow.setContent(content);
    infoWindow.setPosition(event.latLng);
    infoWindow.open({ map });
  });
  mapLines.push(line);
}

function renderLiftList(features) {
  const lifts = [...new Map(features.filter(feature => feature.kind === "lift")
    .map(feature => [feature.name, feature])).values()]
    .sort((left, right) => left.name.localeCompare(right.name, "ja"));
  liftList.innerHTML = lifts.length
     ? lifts.map(lift => `<li><span class="kamui-lift-name" title="${escapeHtml(lift.name)}">${escapeHtml(lift.name)}</span><span class="kamui-lift-state">開放與收班待確認</span></li>`).join("")
    : `<li class="kamui-empty">目前圖資沒有標記纜車路線。</li>`;
}

function locateCurrentPosition() {
  if (!map) return;
  if (!navigator.geolocation) {
    mapStatus.textContent = "此瀏覽器不支援目前位置定位。";
    return;
  }
  const button = document.getElementById("kamui-current-location");
  button.disabled = true;
  mapStatus.textContent = "正在取得目前位置…";
  navigator.geolocation.getCurrentPosition(position => {
    const point = { lat: position.coords.latitude, lng: position.coords.longitude };
    map.setCenter(point);
    map.setZoom(16);
    currentLocationMarker?.setMap(null);
    currentLocationMarker = new google.maps.Marker({
      map,
      position: point,
      title: "目前位置",
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: "#2563eb",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 2
      },
      zIndex: 1000
    });
    mapStatus.textContent = "已定位到目前位置；位置僅用於本次地圖顯示。";
    button.disabled = false;
  }, error => {
    mapStatus.textContent = error.code === 1
      ? "未允許定位權限；請在瀏覽器設定中允許此網站使用位置。"
      : error.code === 3 ? "取得目前位置逾時，請再試一次。" : "無法取得目前位置；請確認裝置定位服務已開啟。";
    button.disabled = false;
  }, { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 });
}

function locateKamuiResort() {
  if (!map) return;
  currentLocationMarker?.setMap(null);
  currentLocationMarker = null;
  if (kamuiMapFeatures.length) {
    fitKamuiMapView(kamuiMapFeatures);
  } else {
    map.setCenter({ lat: 43.7007, lng: 142.1995 });
    map.setZoom(14);
    map.setHeading(kamuiMapHeading);
  }
  mapStatus.textContent = "已回到神居雪場。";
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

async function loadKamuiMap() {
  mapRetry.classList.add("hidden");
  mapStatus.textContent = "正在載入雪道與纜車圖資…";
  try {
    await loadGoogleMaps();
    const { Map, InfoWindow, Polyline } = await google.maps.importLibrary("maps");
    if (!map) {
      map = new Map(document.getElementById("kamui-map"), {
        center: { lat: 43.7007, lng: 142.1995 },
        zoom: 14,
        heading: kamuiMapHeading,
        mapId: googleMapsMapId,
        renderingType: google.maps.RenderingType.VECTOR,
        headingInteractionEnabled: true,
        tiltInteractionEnabled: false,
        rotateControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
      });
      infoWindow = new InfoWindow();
      pisteTileLayer = new google.maps.ImageMapType({
        name: "OpenSnowMap pistes",
        alt: "OpenSnowMap ski pistes",
        tileSize: new google.maps.Size(256, 256),
        minZoom: 5,
        maxZoom: 18,
        opacity: 0.9,
        getTileUrl(coordinate, zoom) {
          const tileCount = 2 ** zoom;
          if (coordinate.y < 0 || coordinate.y >= tileCount) return "";
          const x = ((coordinate.x % tileCount) + tileCount) % tileCount;
          return `https://tiles.opensnowmap.org/pistes/${zoom}/${x}/${coordinate.y}.png`;
        }
      });
      map.overlayMapTypes.insertAt(0, pisteTileLayer);
    }
    mapStatus.textContent = "雪道底圖已載入，正在讀取路線名稱…";
  } catch (error) {
    mapStatus.textContent = error.message || "雪道圖資目前無法載入。";
    mapRetry.classList.remove("hidden");
    return;
  }

  try {
    const { Polyline } = await google.maps.importLibrary("maps");
    const data = await requestKamuiMapData({ user: currentUser });
    if (!data.features.length) throw new Error("目前沒有可顯示的路線細節。");

    mapLines.forEach(line => line.setMap(null));
    mapLines = [];
    data.features.forEach(feature => {
      if (!Array.isArray(feature.geometry) || feature.geometry.length < 2) return;
      addLine(feature, Polyline);
    });
    kamuiMapFeatures = data.features;
    fitKamuiMapView(kamuiMapFeatures);
    if (pisteTileLayer) map.overlayMapTypes.setAt(0, null);

    const pistes = data.features.filter(feature => feature.kind === "piste").length;
    const lifts = data.features.filter(feature => feature.kind === "lift").length;
    const fetchedAt = new Date(data.fetchedAt).toLocaleString("zh-TW", { dateStyle: "short", timeStyle: "short" });
    const cacheLabel = data.stale ? "（使用快取資料）" : "";
    mapStatus.textContent = `雪道線段 ${pistes} 條・纜車路線 ${lifts} 條｜OSM 查詢 ${fetchedAt}${cacheLabel}`;
    renderLiftList(data.features);
    window.lucide?.createIcons();
  } catch (error) {
    mapStatus.textContent = "雪道底圖已載入；路線名稱資料暫時不可用，纜車營運請查官方公告。";
    liftList.innerHTML = `<li class="kamui-empty">路線細節目前無法取得。<a href="https://www.kamui-skilinks.com/today/" target="_blank" rel="noopener noreferrer">查看神居滑雪場官方今日資訊</a></li>`;
    mapRetry.classList.remove("hidden");
  }
}

mapRetry.addEventListener("click", () => void loadKamuiMap());
document.getElementById("kamui-current-location").addEventListener("click", locateCurrentPosition);
document.getElementById("kamui-locate").addEventListener("click", locateKamuiResort);
window.addEventListener("resize", () => {
  if (kamuiMapFeatures.length) fitKamuiMapView(kamuiMapFeatures);
});
window.lucide?.createIcons();

if (!isConfigured) {
  window.location.replace("login.html");
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  onAuthStateChanged(auth, user => {
    if (!user || !isAllowed(user.email)) {
      if (user) void signOut(auth);
      window.location.replace("login.html");
      return;
    }
    currentUser = user;
    void loadKamuiMap();
  });
}
