const bookingTasks = [
  { id: "taisetsu", date: "10/28", time: "", task: "たいせつライナー巴士訂票", query: "たいせつライナー 旭川 新千歲 預約" },
  { id: "ekinet", date: "11/17", time: "13:00 台灣時間", task: "Eki-net JR 訂票", query: "えきねっと JR 札幌 旭川" },
  { id: "kamui", date: "11/24", time: "09:00 台灣時間", task: "Kamui 21 號 JR 訂票", query: "えきねっと Kamui 21 札幌 旭川" },
  { id: "ski-shuttle", date: "前一晚", time: "22:00 前", task: "預約雪場接駁" }
];

const days = {
  "12-24": {
    label: "12/24",
    destination: "前往旭川",
    description: "桃園起飛，經新千歲與札幌前往旭川。",
    connection: "Airport 71 預計 12:57 抵達札幌；原行程接續 14:00 Kamui 21 前往旭川。",
    connections: [
      { label: "新千歲機場 → 札幌站地圖", origin: "新千歲機場", destination: "札幌站" },
      { label: "札幌站 → 旭川站地圖", origin: "札幌站", destination: "旭川站" }
    ],
    optionsTitle: "JR 札幌 → 旭川",
    optionsDescription: "主要班次與前後替代班次",
    table: {
      headers: ["札幌出發", "旭川抵達", "列車"],
      rows: [
        ["13:00", "約 14:25", "Kamui"],
        ["14:00", "15:25", "Kamui 21 號"],
        ["14:30", "約 15:55", "Lilac"],
        ["15:00", "約 16:25", "Lilac"]
      ],
      selectedRow: 1,
      search: "JR 札幌 旭川 Kamui Lilac 時刻表"
    },
    events: [
      { time: "05:40", title: "VZ570 桃園起飛", detail: "桃園國際機場", key: true },
      { time: "10:25", title: "抵達新千歲", detail: "新千歲機場" },
      { time: "～11:45", title: "入境與領取行李", detail: "預留時間辦理入境及行李" },
      { time: "12:20", title: "Airport 71 出發", detail: "新千歲 → 札幌", map: { origin: "新千歲機場", destination: "札幌站" } },
      { time: "12:57", title: "抵達札幌", detail: "Airport 71" },
      { time: "14:00", title: "Kamui 21 號出發", detail: "札幌 → 旭川・原行程班次", key: true, map: { origin: "札幌站", destination: "旭川站" } },
      { time: "15:25", title: "抵達旭川", detail: "旭川站" },
      { time: "～15:40", title: "抵達 OMO7", detail: "旭川" }
    ]
  },
  "12-28": {
    label: "12/28",
    destination: "返回桃園",
    description: "從 OMO7 旭川前搭巴士前往新千歲，再飛回桃園。",
    connection: "原行程選用 5 便：12:56 自 OMO7 旭川前出發，15:35 抵達新千歲國內線；TR893 預計 18:15 起飛。",
    connections: [
      { label: "OMO7 旭川 → 新千歲機場地圖", origin: "OMO7 旭川", destination: "新千歲機場 國內線" }
    ],
    optionsTitle: "巴士 旭川 → 新千歲",
    optionsDescription: "たいせつライナー班次",
    table: {
      headers: ["便", "OMO7 旭川前", "新千歲國內線", "南千歲"],
      rows: [
        ["1 便", "06:56", "09:35", "09:50"],
        ["3 便", "08:56", "11:35", "11:50"],
        ["5 便", "12:56", "15:35", "15:50"]
      ],
      selectedRow: 2,
      search: "たいせつライナー 旭川 新千歲 時刻表 予約"
    },
    events: [
      { time: "12:56", title: "たいせつライナー 5 便出發", detail: "OMO7 旭川前・原行程班次", key: true, map: { origin: "OMO7 旭川", destination: "新千歲機場 國內線" } },
      { time: "15:35", title: "抵達新千歲國內線", detail: "新千歲機場" },
      { time: "18:15", title: "TR893 新千歲起飛", detail: "新千歲 → 桃園", key: true },
      { time: "22:05", title: "抵達桃園", detail: "桃園國際機場" }
    ]
  }
};

const tabs = [...document.querySelectorAll("[data-day]")];
const timeline = document.getElementById("timeline");
const taskState = new Map();
let activeDay = "12-24";
let storageAvailable = true;
let aiSchedule = null;
let authUserPromise = null;

const aiDayKey = "12-24";
const hokkaidoBounds = { minLat: 41.2, maxLat: 45.7, minLng: 139.2, maxLng: 148.9 };
const stations = [
  { id: "taoyuan", name: "桃園國際機場", lat: 25.0797, lng: 121.2342, radiusKm: 5 },
  { id: "new_chitose", name: "新千歲機場", lat: 42.7752, lng: 141.6923, radiusKm: 3 },
  { id: "sapporo", name: "札幌站", lat: 43.0687, lng: 141.3508, radiusKm: 2 },
  { id: "asahikawa", name: "旭川站", lat: 43.7627, lng: 142.3581, radiusKm: 3 }
];
// Index of the timeline event that represents "being at" each station on 12/24.
const stationEventIndex = { taoyuan: 0, new_chitose: 1, airport_start: 3, sapporo: 4, asahikawa: 6 };

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function addMinutes(time, minutes) {
  const [hours, mins] = time.split(":").map(Number);
  const total = (hours * 60 + mins + minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function mapUrl(origin, destination) {
  const query = new URLSearchParams({ api: "1", origin, destination, travelmode: "transit" });
  return `https://www.google.com/maps/dir/?${query.toString()}`;
}

function searchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function renderEvents(day) {
  timeline.innerHTML = day.events.map(event => {
    const classes = ["timeline-item", event.key && "is-key", event.status === "done" && "is-done", event.status === "current" && "is-current"].filter(Boolean).join(" ");
    return `
    <li class="${classes}">
      <time class="timeline-time${event.was ? " is-updated" : ""}">${escapeHtml(event.time)}</time>
      <span class="timeline-marker" aria-hidden="true"></span>
      <div class="timeline-content">
        <div class="event-topline">
          <span class="event-title">${escapeHtml(event.title)}</span>
          ${event.status === "current" ? '<span class="event-badge is-current">目前位置</span>' : ""}
          ${event.was ? `<span class="event-badge is-updated">AI 更新<span class="event-was">${escapeHtml(event.was)}</span></span>` : ""}
          ${event.key && !event.status ? '<span class="event-badge">主要節點</span>' : ""}
        </div>
        <p class="event-detail">${escapeHtml(event.detail)}</p>
        ${event.map ? `<a class="event-link" href="${mapUrl(event.map.origin, event.map.destination)}" target="_blank" rel="noopener noreferrer">開啟地圖路線</a>` : ""}
      </div>
    </li>`;
  }).join("");
}

function renderTable(day) {
  const headers = day.table.headers.map(header => `<th scope="col">${header}</th>`).join("");
  const rows = day.table.rows.map((row, index) => `
    <tr${index === day.table.selectedRow ? ' class="is-selected"' : ""}>
      ${row.map((cell, cellIndex) => `<td>${cellIndex === 0 && index === day.table.selectedRow ? `<span class="visually-hidden">${day.table.selectedLabel || "原行程班次"}：</span>` : ""}${escapeHtml(cell)}</td>`).join("")}
    </tr>`).join("");
  document.getElementById("options-table").innerHTML = `<table class="service-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  document.getElementById("options-links").innerHTML = `<a href="${searchUrl(day.table.search)}" target="_blank" rel="noopener noreferrer">搜尋交通資訊</a>`;
}

function renderConnections(day) {
  document.getElementById("connection-copy").textContent = day.connection;
  document.getElementById("connection-links").innerHTML = day.connections.map(connection => `
    <a href="${mapUrl(connection.origin, connection.destination)}" target="_blank" rel="noopener noreferrer">${connection.label}</a>`).join("");
}

function readTaskState(task) {
  if (taskState.has(task.id)) return taskState.get(task.id);
  try {
    const checked = localStorage.getItem(`hokkaido-itinerary-${task.id}`) === "true";
    taskState.set(task.id, checked);
    return checked;
  } catch {
    storageAvailable = false;
    return false;
  }
}

function updateBookingProgress() {
  const completed = bookingTasks.filter(task => readTaskState(task)).length;
  document.getElementById("booking-progress").textContent = `${completed} / ${bookingTasks.length} 項已完成`;
  document.getElementById("storage-note").textContent = storageAvailable
    ? "勾選狀態保存在此瀏覽器。"
    : "此瀏覽器無法保存勾選狀態，重新載入後需再次確認。";
}

function renderBookings() {
  const list = document.getElementById("booking-list");
  list.innerHTML = bookingTasks.map(task => {
    const checked = readTaskState(task);
    return `
      <li class="booking-item${checked ? " is-done" : ""}">
        <input class="booking-check" id="booking-${task.id}" type="checkbox" data-task="${task.id}"${checked ? " checked" : ""} />
        <label class="booking-copy" for="booking-${task.id}">
          <span class="booking-date">${task.date}${task.time ? `・${task.time}` : ""}</span>
          <span class="booking-task">${task.task}</span>
        </label>
      </li>`;
  }).join("");

  list.querySelectorAll("[data-task]").forEach(input => {
    input.addEventListener("change", () => {
      const item = bookingTasks.find(task => task.id === input.dataset.task);
      const checked = input.checked;
      taskState.set(item.id, checked);
      try {
        localStorage.setItem(`hokkaido-itinerary-${item.id}`, String(checked));
      } catch {
        storageAvailable = false;
      }
      input.closest(".booking-item").classList.toggle("is-done", checked);
      updateBookingProgress();
    });
  });
  updateBookingProgress();
}

function selectDay(key, moveFocus = false) {
  const day = key === aiDayKey && aiSchedule ? aiSchedule.day : days[key];
  activeDay = key;
  document.getElementById("ai-update").hidden = key !== aiDayKey;
  tabs.forEach(tab => {
    const selected = tab.dataset.day === key;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && moveFocus) tab.focus();
  });

  const panel = document.getElementById("itinerary-panel");
  panel.setAttribute("aria-labelledby", `tab-${key}`);
  document.getElementById("agenda-description").textContent = day.description;
  document.getElementById("day-tag").textContent = day.label;
  document.getElementById("connection-caption").textContent = `${day.label}・主要轉乘`;
  document.getElementById("options-title").textContent = day.optionsTitle;
  document.getElementById("options-description").textContent = day.optionsDescription;
  renderEvents(day);
  renderConnections(day);
  renderTable(day);

  try {
    localStorage.setItem("hokkaido-itinerary-day", key);
  } catch {
    storageAvailable = false;
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectDay(tab.dataset.day));
  tab.addEventListener("keydown", event => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    selectDay(tabs[nextIndex].dataset.day, true);
  });
});

function distanceKm(a, b) {
  const toRad = degrees => degrees * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

function locate() {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 }
    );
  });
}

function resolveStage(position) {
  if (!position) return { stage: "unknown", stationId: "airport_start", label: "無法取得 GPS 位置，以新千歲機場為起點、依現在時間查詢" };
  const ranked = stations
    .map(station => ({ station, km: distanceKm(position, station) }))
    .sort((a, b) => a.km - b.km);
  const inHokkaido = position.lat >= hokkaidoBounds.minLat && position.lat <= hokkaidoBounds.maxLat
    && position.lng >= hokkaidoBounds.minLng && position.lng <= hokkaidoBounds.maxLng;
  if (!inHokkaido) {
    return {
      stage: "pre_trip",
      stationId: "airport_start",
      label: "目前不在北海道，以新千歲機場為起點、依現在時間查詢"
    };
  }
  const nearest = ranked.find(item => item.station.id !== "taoyuan");
  const within = nearest.km <= nearest.station.radiusKm;
  const distance = nearest.km < 1 ? `${Math.round(nearest.km * 1000)} 公尺` : `${nearest.km.toFixed(1)} 公里`;
  return {
    stage: nearest.station.id,
    stationId: nearest.station.id,
    label: within ? `GPS：目前在${nearest.station.name}` : `GPS：最接近${nearest.station.name}（約 ${distance}）`
  };
}

async function getSignedInUser() {
  if (!authUserPromise) {
    authUserPromise = (async () => {
      const [{ initializeApp, getApps }, { getAuth, onAuthStateChanged }, { firebaseConfig }] = await Promise.all([
        import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
        import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
        import("./firebase-config.js")
      ]);
      const app = getApps()[0] || initializeApp(firebaseConfig);
      const auth = getAuth(app);
      return new Promise(resolve => {
        const unsubscribe = onAuthStateChanged(auth, user => {
          unsubscribe();
          resolve(user);
        });
      });
    })().catch(error => {
      authUserPromise = null;
      throw error;
    });
  }
  return authUserPromise;
}

function buildAiDay(result, located) {
  const base = days[aiDayKey];
  const events = base.events.map(event => ({ ...event }));
  const setTime = (index, time) => {
    if (time && events[index].time !== time) {
      events[index].was = events[index].time;
      events[index].time = time;
    }
  };
  const { airportTrain, limitedExpress } = result || {};
  if (airportTrain?.departure) {
    const name = airportTrain.trainName || "快速エアポート";
    setTime(3, airportTrain.departure);
    events[3].title = `${name} 出發`;
    setTime(4, airportTrain.arrival);
    events[4].detail = name;
  }
  if (limitedExpress?.departure) {
    const name = limitedExpress.trainName || "特急";
    setTime(5, limitedExpress.departure);
    events[5].title = `${name} 出發`;
    events[5].detail = "札幌 → 旭川・AI 依目前時間選擇班次";
    setTime(6, limitedExpress.arrival);
    setTime(7, `～${addMinutes(limitedExpress.arrival, 15)}`);
  }
  const currentIndex = located.stationId ? stationEventIndex[located.stationId] : -1;
  events.forEach((event, index) => {
    if (currentIndex >= 0 && index < currentIndex) event.status = "done";
    if (index === currentIndex) event.status = "current";
  });

  const day = { ...base, events };
  if (limitedExpress?.departure) {
    const services = [limitedExpress, ...(result.alternatives || [])];
    day.table = {
      ...base.table,
      rows: services.map(service => [service.departure, service.arrival, service.trainName]),
      selectedRow: 0,
      selectedLabel: "AI 建議班次"
    };
    day.optionsDescription = `AI 依日本時間 ${result.tokyoTime} 查詢的建議與替代班次`;
    day.connection = airportTrain?.departure
      ? `AI 更新：${airportTrain.trainName || "快速エアポート"} ${airportTrain.departure} 自新千歲出發、${airportTrain.arrival} 抵達札幌；接續 ${limitedExpress.trainName} ${limitedExpress.departure} 前往旭川，${limitedExpress.arrival} 抵達。`
      : `AI 更新：${limitedExpress.trainName} ${limitedExpress.departure} 自札幌出發，${limitedExpress.arrival} 抵達旭川。`;
  }
  return day;
}

function setAiStatus(message, { loading = false, error = false, sources = [] } = {}) {
  const panel = document.getElementById("ai-update");
  panel.classList.toggle("is-loading", loading);
  panel.classList.toggle("is-error", error);
  document.getElementById("ai-update-status").textContent = message;
  document.getElementById("ai-update-button").disabled = loading;
  document.getElementById("ai-update-label").textContent = loading ? "查詢中…" : aiSchedule ? "重新更新班次" : "AI 更新班次";
  document.getElementById("ai-reset-button").hidden = loading || !aiSchedule;
  const list = document.getElementById("ai-update-sources");
  list.hidden = !sources.length;
  list.innerHTML = sources.map(source =>
    `<li><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(source.title)}</a></li>`).join("");
}

async function runAiUpdate() {
  setAiStatus("正在取得 GPS 位置…", { loading: true });
  const located = resolveStage(await locate());

  if (located.stage === "asahikawa") {
    aiSchedule = { day: buildAiDay(null, located) };
    selectDay(aiDayKey);
    setAiStatus(`${located.label}。已抵達旭川，不需再查詢 JR 班次。`);
    return;
  }

  setAiStatus(`${located.label}。AI 正在搜尋最新時刻表…`, { loading: true });
  try {
    const [{ requestItinerarySchedule }, user] = await Promise.all([import("./ai-client.js"), getSignedInUser()]);
    const result = await requestItinerarySchedule({ user, stage: located.stage });
    aiSchedule = { day: buildAiDay(result, located) };
    selectDay(aiDayKey);
    setAiStatus(`日本時間 ${result.tokyoTime} 查詢・${located.label}。${result.notes || ""}`.trim(), { sources: result.sources });
  } catch (error) {
    setAiStatus(error?.message || "AI 班次查詢失敗，請稍後再試。", { error: true });
  }
}

document.getElementById("ai-update-button").addEventListener("click", () => void runAiUpdate());
document.getElementById("ai-reset-button").addEventListener("click", () => {
  aiSchedule = null;
  selectDay(aiDayKey);
  setAiStatus("已還原原行程。依目前時間與 GPS 位置，查詢可搭乘的 JR 班次。");
});

renderBookings();
selectDay("12-24");

try {
  const savedDay = localStorage.getItem("hokkaido-itinerary-day");
  if (savedDay && days[savedDay]) selectDay(savedDay);
} catch {
  storageAvailable = false;
  updateBookingProgress();
}