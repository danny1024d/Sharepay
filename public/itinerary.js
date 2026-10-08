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

function mapUrl(origin, destination) {
  const query = new URLSearchParams({ api: "1", origin, destination, travelmode: "transit" });
  return `https://www.google.com/maps/dir/?${query.toString()}`;
}

function searchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function renderEvents(day) {
  timeline.innerHTML = day.events.map(event => `
    <li class="timeline-item${event.key ? " is-key" : ""}">
      <time class="timeline-time">${event.time}</time>
      <span class="timeline-marker" aria-hidden="true"></span>
      <div class="timeline-content">
        <div class="event-topline">
          <span class="event-title">${event.title}</span>
          ${event.key ? '<span class="event-badge">主要節點</span>' : ""}
        </div>
        <p class="event-detail">${event.detail}</p>
        ${event.map ? `<a class="event-link" href="${mapUrl(event.map.origin, event.map.destination)}" target="_blank" rel="noopener noreferrer">開啟地圖路線</a>` : ""}
      </div>
    </li>`).join("");
}

function renderTable(day) {
  const headers = day.table.headers.map(header => `<th scope="col">${header}</th>`).join("");
  const rows = day.table.rows.map((row, index) => `
    <tr${index === day.table.selectedRow ? ' class="is-selected"' : ""}>
      ${row.map((cell, cellIndex) => `<td>${cellIndex === 0 && index === day.table.selectedRow ? `<span class="visually-hidden">原行程班次：</span>` : ""}${cell}</td>`).join("")}
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
  const day = days[key];
  activeDay = key;
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

renderBookings();
selectDay("12-24");

try {
  const savedDay = localStorage.getItem("hokkaido-itinerary-day");
  if (savedDay && days[savedDay]) selectDay(savedDay);
} catch {
  storageAvailable = false;
  updateBookingProgress();
}