import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { allowedEmails, appName, firebaseConfig } from "./firebase-config.js";
import { requestPlaceCoordinates } from "./ai-client.js";

const people = ["高", "n"];
const categories = ["住宿", "餐費", "交通", "滑雪", "雜支"];
const state = { expenses: [], payments: [], places: [], expensePayer: "高", paymentPayer: "高", placeTagFilter: null, placeView: "list" };
const currency = new Intl.NumberFormat("zh-TW");
const isConfigured = !Object.values(firebaseConfig).some(value => value.includes("YOUR_"));
let placeMap;
let placeMarkers;
let placeMapNeedsFit = true;
let placeDialogTags = [];
let database;
let currentUser = null;

function isAllowed(email) {
  return Boolean(email) && allowedEmails.some(value => value.toLowerCase() === email.toLowerCase());
}

function amount(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function formatted(value) {
  return currency.format(amount(value));
}

function showDataError(error) {
  const message = error?.code === "permission-denied"
    ? "Firestore 拒絕存取：請確認 Rules 已發布，且登入帳號位於白名單。"
    : error?.code === "failed-precondition"
      ? "Firestore 尚未建立：請在 Firebase Console 啟用 Cloud Firestore Database。"
      : `資料操作失敗：${error?.message || "未知錯誤"}`;
  alert(message);
  console.error("Firestore error:", error);
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

function formattedDate(date) {
  const [year, month, day] = (date || "").split("-");
  return month && day ? `${Number(month)}/${Number(day)}` : "未填日期";
}

function expenseTotal(expense) {
  return categories.reduce((total, category) => total + amount(expense.items?.[category]), 0);
}

function expenseShares(expense) {
  const total = expenseTotal(expense);
  const highRatio = amount(expense.ratios?.high) || 1;
  const nRatio = amount(expense.ratios?.n) || 1;
  const high = Math.round(total * highRatio / (highRatio + nRatio));
  return { "高": high, n: total - high };
}

function calculation() {
  const paid = { "高": 0, n: 0 };
  const owed = { "高": 0, n: 0 };
  const categoryTotals = Object.fromEntries(categories.map(category => [category, { "高": 0, n: 0 }]));
  const paymentNet = { "高": 0, n: 0 };

  state.expenses.forEach(expense => {
    const shares = expenseShares(expense);
    paid[expense.payer] += expenseTotal(expense);
    people.forEach(person => { owed[person] += shares[person]; });
    categories.forEach(category => {
      const categoryValue = amount(expense.items?.[category]);
      const ratioTotal = (amount(expense.ratios?.high) || 1) + (amount(expense.ratios?.n) || 1);
      const highShare = Math.round(categoryValue * (amount(expense.ratios?.high) || 1) / ratioTotal);
      categoryTotals[category]["高"] += highShare;
      categoryTotals[category].n += categoryValue - highShare;
    });
  });

  state.payments.forEach(payment => {
    paymentNet[payment.payer] += amount(payment.amount);
    paymentNet[payment.debtor] -= amount(payment.amount);
  });
  const balance = {
    "高": paid["高"] - owed["高"] + paymentNet["高"],
    n: paid.n - owed.n + paymentNet.n
  };
  return { paid, owed, categoryTotals, paymentNet, balance };
}

function render() {
  const totals = calculation();
  renderExpenses(totals);
  renderPayments(totals);
  renderSettlement(totals);
  document.querySelector("header .text-2xl").textContent = formatted(Math.abs(totals.balance["高"]));
  document.querySelector("header .text-lg").textContent = totals.balance["高"] >= 0 ? "n -> 高" : "高 -> n";
}

function renderExpenses(totals) {
  const total = state.expenses.reduce((sum, expense) => sum + expenseTotal(expense), 0);
  const list = state.expenses.map(expense => {
    const entries = categories.filter(category => amount(expense.items?.[category])).map(category => `
      <div class="flex justify-between text-sm"><span class="text-slate-500">${category}</span><span class="font-medium text-slate-700">${formatted(expense.items[category])}</span></div>`).join("");
    return `<button class="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-sm active:scale-[0.98] transition-transform" data-expense-id="${escapeHtml(expense.id)}">
      <div class="flex items-center justify-between mb-2.5"><span class="text-sm font-medium text-slate-500">${formattedDate(expense.date)}</span><span class="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-600">${escapeHtml(expense.payer)} 付款</span></div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">${entries}</div>
      <div class="flex items-end justify-between pt-2.5 border-t border-slate-100"><div class="min-w-0 flex-1"><span class="text-xs text-slate-400">比例 ${amount(expense.ratios?.high) || 1} : ${amount(expense.ratios?.n) || 1}</span><p class="text-xs text-slate-500 mt-0.5 truncate">${escapeHtml(expense.note || "無備註")}</p></div><div class="text-right ml-3"><span class="text-lg font-bold text-slate-900">${formatted(expenseTotal(expense))}</span><span class="text-xs text-slate-400 ml-1">元</span></div></div>
    </button>`;
  }).join("") || emptyState("receipt", "尚無支出紀錄", "點右下角按鈕新增支出");
  document.getElementById("tab-expenses").innerHTML = `<div class="px-4 py-4"><div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm"><div class="flex justify-between items-end"><div><p class="text-xs text-slate-500">總支出</p><p class="text-2xl font-bold text-slate-900 mt-0.5">${formatted(total)} <span class="text-sm font-normal text-slate-400">元</span></p></div><div class="text-right"><p class="text-xs text-slate-500">筆數</p><p class="text-2xl font-bold text-slate-900 mt-0.5">${state.expenses.length}</p></div></div></div></div><div class="px-4 space-y-2.5">${list}</div><button onclick="openExpenseDialog(false)" class="fixed bottom-20 z-20 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center active:scale-95 transition-transform" style="right: max(1rem, calc(50% - 18rem + 1rem))" aria-label="新增支出"><i data-lucide="plus" class="w-6 h-6"></i></button>`;
  document.querySelectorAll("#tab-expenses [data-expense-id]").forEach(button => button.addEventListener("click", () => editExpense(button.dataset.expenseId)));
  lucide.createIcons();
}

function renderPayments(totals) {
  const total = state.payments.reduce((sum, payment) => sum + amount(payment.amount), 0);
  const list = state.payments.map(payment => `<button class="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-sm active:scale-[0.98] transition-transform" data-payment-id="${escapeHtml(payment.id)}"><div class="flex items-center justify-between"><div class="min-w-0 flex-1"><span class="text-sm font-medium text-slate-500">${formattedDate(payment.date)}</span><p class="text-base font-semibold text-slate-900 mt-0.5 truncate">${escapeHtml(payment.item)}</p><div class="flex items-center gap-1.5 mt-1.5"><span class="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-600">${escapeHtml(payment.payer)}</span><i data-lucide="arrow-right" class="w-3 h-3 text-slate-400"></i><span class="px-2 py-0.5 rounded-md text-xs font-medium bg-amber-50 text-amber-600">${escapeHtml(payment.debtor)}</span><span class="text-xs text-slate-400 ml-1">${escapeHtml(payment.debtor)} 需支付${escapeHtml(payment.payer)}</span></div></div><div class="text-right ml-3"><span class="text-lg font-bold text-slate-900">${formatted(payment.amount)}</span><span class="text-xs text-slate-400 ml-1">元</span></div></div></button>`).join("") || emptyState("repeat", "尚無代付紀錄", "點右下角按鈕新增代付");
  document.getElementById("tab-payments").innerHTML = `<div class="px-4 py-4"><div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm"><div class="flex justify-between items-end"><div><p class="text-xs text-slate-500">代付總額</p><p class="text-2xl font-bold text-slate-900 mt-0.5">${formatted(total)} <span class="text-sm font-normal text-slate-400">元</span></p></div><div class="text-right"><p class="text-xs text-slate-500">筆數</p><p class="text-2xl font-bold text-slate-900 mt-0.5">${state.payments.length}</p></div></div></div></div><div class="px-4 space-y-2.5">${list}</div><button onclick="openPaymentDialog(false)" class="fixed bottom-20 z-20 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center active:scale-95 transition-transform" style="right: max(1rem, calc(50% - 18rem + 1rem))" aria-label="新增代付"><i data-lucide="plus" class="w-6 h-6"></i></button>`;
  document.querySelectorAll("#tab-payments [data-payment-id]").forEach(button => button.addEventListener("click", () => editPayment(button.dataset.paymentId)));
  lucide.createIcons();
}

// Built-in filter for places without tags; reserved, so it can't be a real tag.
const untaggedLabel = "其他";

function placeTags(place) {
  // Legacy places only have a fixed category; treat it as their tag.
  const tags = Array.isArray(place.tags) ? place.tags : (place.category ? [place.category] : []);
  return tags.filter(tag => tag !== untaggedLabel);
}

function allPlaceTags() {
  return [...new Set(state.places.flatMap(placeTags))].sort((left, right) => left.localeCompare(right, "zh-Hant"));
}

function tagHue(tag) {
  let hue = 0;
  for (const character of tag) hue = (hue * 31 + character.codePointAt(0)) % 360;
  return hue;
}

function tagChipStyle(tag) {
  const hue = tagHue(tag);
  return `background:hsl(${hue} 85% 94%);color:hsl(${hue} 60% 32%)`;
}

function tagColor(tag) {
  return tag ? `hsl(${tagHue(tag)} 65% 45%)` : "#64748b";
}

function renderPlaces() {
  const tags = allPlaceTags();
  if (state.placeTagFilter !== untaggedLabel && !tags.includes(state.placeTagFilter)) state.placeTagFilter = null;
  const counts = Object.fromEntries(tags.map(tag => [tag, state.places.filter(place => placeTags(place).includes(tag)).length]));
  const untaggedCount = state.places.filter(place => !placeTags(place).length).length;
  const chipClass = selected => `shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${selected ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600"}`;
  const filters = `<button type="button" data-place-tag-all aria-pressed="${!state.placeTagFilter}" class="${chipClass(!state.placeTagFilter)}">全部 ${state.places.length}</button>`
    + tags.map((tag, index) => {
      const selected = state.placeTagFilter === tag;
      return `<button type="button" data-place-tag-index="${index}" aria-pressed="${selected}" class="${chipClass(selected)}"><span class="mr-1 inline-block h-2 w-2 rounded-full" style="background:${tagColor(tag)}"></span>${escapeHtml(tag)} ${counts[tag]}</button>`;
    }).join("")
    + `<button type="button" data-place-tag-untagged aria-pressed="${state.placeTagFilter === untaggedLabel}" class="${chipClass(state.placeTagFilter === untaggedLabel)}"><span class="mr-1 inline-block h-2 w-2 rounded-full" style="background:${tagColor()}"></span>${untaggedLabel} ${untaggedCount}</button>`;
  const legend = tags.map(tag => `<span class="inline-flex items-center gap-1.5 text-xs text-slate-600"><span class="h-2.5 w-2.5 rounded-full" style="background:${tagColor(tag)}"></span>${escapeHtml(tag)}</span>`).join("")
    + `<span class="inline-flex items-center gap-1.5 text-xs text-slate-600"><span class="h-2.5 w-2.5 rounded-full" style="background:${tagColor()}"></span>${untaggedLabel}</span>`;
  const viewButton = (view, icon, label) => `<button type="button" data-place-view="${view}" aria-pressed="${state.placeView === view}" class="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${state.placeView === view ? "bg-slate-900 text-white" : "text-slate-500"}"><i data-lucide="${icon}" class="h-4 w-4"></i>${label}</button>`;
  const viewToggle = `<div class="flex shrink-0 rounded-lg bg-slate-100 p-1" role="group" aria-label="地點檢視模式">${viewButton("list", "list", "清單")}${viewButton("map", "map", "地圖")}</div>`;
  document.getElementById("tab-places").innerHTML = `<div class="px-4 py-4"><div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div class="flex items-start justify-between gap-3"><div><p class="text-xs text-slate-500">待去地點</p><p class="mt-0.5 text-2xl font-bold text-slate-900">${state.places.length} <span class="text-sm font-normal text-slate-400">個</span></p></div>${viewToggle}</div><div class="mt-3 flex flex-wrap gap-2" role="group" aria-label="地點標籤篩選">${filters}</div></div></div><div class="space-y-3 px-4 pb-4"><div id="place-results" class="space-y-3"></div><section id="place-map-section" class="hidden overflow-hidden rounded-xl border border-slate-200 bg-white"><div id="place-map" class="h-[60vh] min-h-[360px] max-h-[680px] w-full"></div><div id="place-map-status" class="px-3 py-2 text-xs text-slate-500" aria-live="polite"></div></section><div id="place-map-legend" class="hidden flex-wrap gap-x-4 gap-y-2 px-1" aria-label="地圖標籤圖例">${legend}</div></div><button id="place-add-btn" onclick="openPlaceDialog(false)" class="fixed bottom-20 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition-transform active:scale-95" style="right: max(1rem, calc(50% - 18rem + 1rem))" aria-label="新增地點"><i data-lucide="plus" class="h-6 w-6"></i></button>`;
  document.querySelector("[data-place-tag-all]").addEventListener("click", () => {
    state.placeTagFilter = null;
    placeMapNeedsFit = true;
    renderPlaces();
  });
  document.querySelectorAll("[data-place-tag-index]").forEach(button => button.addEventListener("click", () => {
    const tag = tags[Number(button.dataset.placeTagIndex)];
    state.placeTagFilter = state.placeTagFilter === tag ? null : tag;
    placeMapNeedsFit = true;
    renderPlaces();
  }));
  document.querySelector("[data-place-tag-untagged]").addEventListener("click", () => {
    state.placeTagFilter = state.placeTagFilter === untaggedLabel ? null : untaggedLabel;
    placeMapNeedsFit = true;
    renderPlaces();
  });
  document.querySelectorAll("[data-place-view]").forEach(button => button.addEventListener("click", () => {
    state.placeView = button.dataset.placeView;
    placeMapNeedsFit = true;
    document.querySelectorAll("[data-place-view]").forEach(option => {
      const selected = option === button;
      option.setAttribute("aria-pressed", String(selected));
      option.classList.toggle("bg-slate-900", selected);
      option.classList.toggle("text-white", selected);
      option.classList.toggle("text-slate-500", !selected);
    });
    renderPlaceResults();
  }));
  lucide.createIcons();
  renderPlaceResults();
}

function renderPlaceResults() {
  const filteredPlaces = state.places.filter(place => !state.placeTagFilter
    || (state.placeTagFilter === untaggedLabel ? !placeTags(place).length : placeTags(place).includes(state.placeTagFilter)))
    .sort((left, right) => (left.name || "").localeCompare(right.name || "", "zh-Hant"));
  const results = document.getElementById("place-results");
  const mapSection = document.getElementById("place-map-section");
  const mapLegend = document.getElementById("place-map-legend");
  document.getElementById("place-add-btn").classList.toggle("hidden", state.placeView === "map");
  if (state.placeView === "map") {
    results.classList.add("hidden");
    mapSection.classList.remove("hidden");
    mapLegend.classList.remove("hidden");
    renderPlaceMap(filteredPlaces);
    return;
  }
  results.classList.remove("hidden");
  mapSection.classList.add("hidden");
  mapLegend.classList.add("hidden");
  const list = filteredPlaces.map(place => {
    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);
    const hasCoordinates = place.latitude != null && place.longitude != null
      && Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
    const locationQuery = hasCoordinates
      ? `${latitude},${longitude}`
      : [place.name, place.address].filter(Boolean).join(" ");
    const query = encodeURIComponent(locationQuery);
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    const embedUrl = `https://www.google.com/maps?q=${query}&output=embed${hasCoordinates ? "&z=16" : ""}`;
    const tags = placeTags(place);
    const tagChips = tags.map(tag => `<span class="rounded-md px-2 py-0.5 text-xs font-medium" style="${tagChipStyle(tag)}">${escapeHtml(tag)}</span>`).join("");
    return `<article class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div class="p-4">
        <div class="flex items-start gap-3">
          <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style="${tags.length ? tagChipStyle(tags[0]) : "background:#f1f5f9;color:#475569"}"><i data-lucide="map-pin" class="h-5 w-5"></i></span>
          <div class="min-w-0 flex-1">
            <h2 class="truncate text-base font-semibold text-slate-900">${escapeHtml(place.name)}</h2>
            ${tagChips ? `<div class="mt-1 flex flex-wrap gap-1">${tagChips}</div>` : ""}
            <p class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(place.address || "尚未填寫地址")}</p>
            ${place.note ? `<p class="mt-1.5 text-xs leading-5 text-slate-500">${escapeHtml(place.note)}</p>` : ""}
          </div>
          <button type="button" data-place-id="${escapeHtml(place.id)}" class="shrink-0 p-1 text-slate-400 hover:text-indigo-600" aria-label="編輯${escapeHtml(place.name)}"><i data-lucide="pencil" class="h-4 w-4"></i></button>
        </div>
        <div class="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          <iframe title="${escapeHtml(place.name)}地圖" src="${embedUrl}" class="block h-44 w-full" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
        </div>
        <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"><i data-lucide="external-link" class="h-3.5 w-3.5"></i>在 Google 地圖開啟</a>
      </div>
    </article>`;
  }).join("");
  const empty = state.places.length
    ? emptyState("search-x", "找不到符合的地點", "試試其他標籤")
    : emptyState("map-pin", "尚無收藏地點", "點右下角按鈕新增地點");
  results.innerHTML = list || empty;
  document.querySelectorAll("#place-results [data-place-id]").forEach(button => button.addEventListener("click", () => editPlace(button.dataset.placeId)));
  lucide.createIcons();
}

function renderPlaceMap(places) {
  const mapStatus = document.getElementById("place-map-status");
  if (!window.L) {
    mapStatus.textContent = "地圖載入失敗，請確認網路連線後重新整理。";
    return;
  }
  if (!placeMap) {
    placeMap = L.map("place-map").setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
    }).addTo(placeMap);
    placeMarkers = L.layerGroup().addTo(placeMap);
  } else {
    // renderPlaces() rebuilds the tab HTML; move the existing map container back in instead of re-creating the map.
    const placeholder = document.getElementById("place-map");
    if (placeholder && placeholder !== placeMap.getContainer()) placeholder.replaceWith(placeMap.getContainer());
  }
  placeMarkers.clearLayers();
  const bounds = [];
  const missingCoordinates = [];
  places.forEach(place => {
    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude) && (latitude !== 0 || longitude !== 0)) {
      const tags = placeTags(place);
      const color = tagColor(tags[0]);
      const tagText = tags.length ? tags.join("、") : "無標籤";
      const marker = L.marker([latitude, longitude], {
        icon: L.divIcon({
          className: "place-map-marker",
          html: `<span style="--marker-color:${color}"><i></i><b>${escapeHtml(place.name || "未命名地點")}</b></span>`,
          iconAnchor: [12, 14]
        }),
        title: `${place.name || "未命名地點"}（${tagText}）`
      }).addTo(placeMarkers);
      marker.bindPopup(`<strong>${escapeHtml(place.name || "未命名地點")}</strong><br><span>${escapeHtml(tagText)}</span>`);
      bounds.push([latitude, longitude]);
    } else {
      missingCoordinates.push(place);
    }
  });
  requestAnimationFrame(() => {
    placeMap.invalidateSize();
    if (!placeMapNeedsFit || !bounds.length) return;
    placeMapNeedsFit = false;
    if (bounds.length === 1) placeMap.setView(bounds[0], 13);
    else placeMap.fitBounds(bounds, { padding: [36, 36], maxZoom: 14 });
  });
  const located = `已定位 ${bounds.length} / ${places.length} 筆。`;
  mapStatus.textContent = missingCoordinates.length
    ? `${located}${missingCoordinates.length} 個地點尚未定位，可編輯名稱或地址後重新儲存，由 AI 再次搜尋。地圖資料 © OpenStreetMap contributors。`
    : `${located}地圖資料 © OpenStreetMap contributors。`;
}

function coordinatesFromText(text = "") {
  const match = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    || text.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/)
    || text.match(/^\s*(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)\s*$/)
    || text.match(/[?&](?:q|query|ll)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  return Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 ? { latitude, longitude } : null;
}

function coordinateSourcesMarkup(sources = []) {
  return (Array.isArray(sources) ? sources : []).slice(0, 3).map(source => {
    try {
      const url = new URL(source.url);
      if (url.protocol !== "https:") return "";
      return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800"><i data-lucide="external-link" class="h-3 w-3"></i>${escapeHtml(source.title || url.hostname)}</a>`;
    } catch {
      return "";
    }
  }).filter(Boolean).join("");
}

function emptyState(icon, title, detail) {
  return `<div class="flex flex-col items-center py-16 text-slate-400"><i data-lucide="${icon}" class="w-12 h-12 mb-3 stroke-1"></i><p class="text-sm">${title}</p><p class="text-xs mt-1">${detail}</p></div>`;
}

function renderSettlement(totals) {
  const rows = categories.map(category => `<div class="grid grid-cols-[1.1fr_1fr_1fr_1.1fr] gap-1 py-2.5 border-b border-slate-50 text-sm"><span class="text-slate-700 font-medium">${category}</span><span class="text-right tabular-nums text-slate-600">${formatted(totals.categoryTotals[category]["高"])}</span><span class="text-right tabular-nums text-slate-600">${formatted(totals.categoryTotals[category].n)}</span><span class="text-right tabular-nums font-semibold text-slate-900">${formatted(totals.categoryTotals[category]["高"] + totals.categoryTotals[category].n)}</span></div>`).join("");
  const totalExpense = state.expenses.reduce((sum, expense) => sum + expenseTotal(expense), 0);
  const highBalance = totals.balance["高"];
  const statement = highBalance === 0 ? "目前已結清" : `${highBalance > 0 ? "n 需支付 高" : "高 需支付 n"} ${formatted(Math.abs(highBalance))} 元`;
  document.getElementById("tab-settlement").innerHTML = `<div class="p-4 space-y-4"><div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"><div class="bg-emerald-600 px-4 py-3 flex items-center justify-between"><div><h3 class="text-sm font-semibold text-white">旅程花費</h3><p class="text-[11px] text-emerald-100 mt-0.5">每人各項支出統計（負擔金額）</p></div><div class="text-right"><span class="text-xl font-bold text-white">${formatted(totalExpense)}</span><span class="text-xs text-emerald-100 ml-1">元</span></div></div><div class="p-4"><div class="grid grid-cols-[1.1fr_1fr_1fr_1.1fr] gap-1 pb-2 border-b border-slate-200 text-xs font-medium text-slate-400"><span>類別</span><span class="text-right text-blue-500">高</span><span class="text-right text-amber-500">n</span><span class="text-right">合計</span></div>${rows}<div class="grid grid-cols-[1.1fr_1fr_1fr_1.1fr] gap-1 pt-3 text-sm font-bold"><span class="text-slate-900">合計</span><span class="text-right tabular-nums text-blue-600">${formatted(totals.owed["高"])}</span><span class="text-right tabular-nums text-amber-600">${formatted(totals.owed.n)}</span><span class="text-right tabular-nums text-slate-900">${formatted(totalExpense)}</span></div></div></div><div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"><div class="bg-blue-600 px-4 py-2.5 flex items-center justify-between"><h3 class="text-sm font-semibold text-white">支出統計</h3><span class="text-xs text-blue-100">總支出 ${formatted(totalExpense)} 元</span></div><div class="p-4 space-y-3"><div class="flex h-2 rounded-full overflow-hidden bg-slate-100"><div class="bg-blue-500" style="width:${totalExpense ? totals.paid["高"] / totalExpense * 100 : 50}%"></div><div class="bg-amber-500" style="width:${totalExpense ? totals.paid.n / totalExpense * 100 : 50}%"></div></div>${people.map(person => `<div class="flex items-center justify-between text-sm"><span class="font-semibold ${person === "高" ? "text-blue-600" : "text-amber-600"}">${person}</span><span class="text-slate-500">代墊 <b class="text-slate-900">${formatted(totals.paid[person])}</b> 元，負擔 <b class="text-slate-900">${formatted(totals.owed[person])}</b> 元</span></div>`).join("")}</div></div><div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"><div class="bg-orange-500 px-4 py-2.5"><h3 class="text-sm font-semibold text-white">代付統計</h3></div><div class="p-4 space-y-2.5"><div class="flex justify-between text-sm"><span class="text-slate-600">高 代付結餘</span><span class="font-semibold text-slate-900">${formatted(totals.paymentNet["高"])} 元</span></div><div class="flex justify-between text-sm"><span class="text-slate-600">n 代付結餘</span><span class="font-semibold text-slate-900">${formatted(totals.paymentNet.n)} 元</span></div></div></div><div class="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl overflow-hidden shadow-lg shadow-indigo-600/20"><div class="px-4 py-2.5 bg-white/10"><h3 class="text-sm font-semibold text-white">總結餘</h3></div><div class="p-5 text-center"><p class="text-lg font-bold text-white">${statement}</p></div></div></div>`;
}

function selectButton(buttons, selected, value) {
  buttons.forEach(button => button.classList.toggle("bg-indigo-600", button.dataset.value === selected));
  buttons.forEach(button => button.classList.toggle("text-white", button.dataset.value === selected));
  buttons.forEach(button => button.classList.toggle("bg-slate-100", button.dataset.value !== selected));
  buttons.forEach(button => button.classList.toggle("text-slate-500", button.dataset.value !== selected));
  if (value) state[value] = selected;
}

function setupDialogs() {
  const expenseDialog = document.getElementById("expense-dialog");
  const paymentDialog = document.getElementById("payment-dialog");
  const expensePayerButtons = [...expenseDialog.querySelectorAll(".grid.grid-cols-2 button")];
  expensePayerButtons.forEach((button, index) => {
    button.dataset.value = people[index];
    button.addEventListener("click", () => selectButton(expensePayerButtons, button.dataset.value, "expensePayer"));
  });
  const setPaymentPayer = payer => {
    state.paymentPayer = payer;
    directionButtons.forEach(option => option.classList.toggle("border-indigo-500", option.dataset.value === payer));
    directionButtons.forEach(option => option.classList.toggle("bg-indigo-50", option.dataset.value === payer));
    directionButtons.forEach(option => option.classList.toggle("border-slate-200", option.dataset.value !== payer));
    directionButtons.forEach(option => option.classList.toggle("bg-white", option.dataset.value !== payer));
  };
  const directionButtons = [...paymentDialog.querySelectorAll(".space-y-2 > button")];
  directionButtons.forEach((button, index) => {
    button.dataset.value = people[index];
    button.addEventListener("click", () => setPaymentPayer(button.dataset.value));
  });
  expenseDialog.querySelector(".btn-primary").addEventListener("click", saveExpense);
  paymentDialog.querySelector(".btn-primary").addEventListener("click", savePayment);
  document.getElementById("expense-delete-btn").addEventListener("click", () => removeEntry("expenses", expenseDialog.dataset.id));
  document.getElementById("payment-delete-btn").addEventListener("click", () => removeEntry("payments", paymentDialog.dataset.id));
  setupPlaceDialog();
}

function setupPlaceDialog() {
  const dialog = document.getElementById("place-dialog");
  const tagInput = dialog.querySelector("#place-tag-input");
  const addTypedTag = () => {
    addPlaceDialogTag(tagInput.value);
    tagInput.value = "";
    tagInput.focus();
  };
  dialog.querySelector("#place-tag-add").addEventListener("click", addTypedTag);
  tagInput.addEventListener("keydown", event => {
    // Skip Enter while an IME (e.g. 注音) is still composing.
    if (event.key !== "Enter" || event.isComposing) return;
    event.preventDefault();
    addTypedTag();
  });
  dialog.querySelector("#place-tags-selected").addEventListener("click", event => {
    const button = event.target.closest("[data-remove-tag-index]");
    if (!button) return;
    placeDialogTags.splice(Number(button.dataset.removeTagIndex), 1);
    renderPlaceDialogTags();
  });
  dialog.querySelector("#place-tags-existing").addEventListener("click", event => {
    const button = event.target.closest("[data-existing-tag]");
    if (button) addPlaceDialogTag(button.dataset.existingTag);
  });
  dialog.querySelector("#place-coordinates").addEventListener("input", () => {
    dialog.dataset.coordinatesEdited = "true";
  });
  dialog.querySelector(".btn-primary").addEventListener("click", savePlace);
  document.getElementById("place-delete-btn").addEventListener("click", () => removeEntry("places", dialog.dataset.id));
}

function addPlaceDialogTag(value) {
  const tag = value.trim().replace(/\s+/g, " ").slice(0, 20);
  if (!tag || placeDialogTags.includes(tag)) return;
  if (tag === untaggedLabel) return alert(`「${untaggedLabel}」是內建標籤，沒有標籤的地點會自動歸在這裡。`);
  if (placeDialogTags.length >= 10) return alert("每個地點最多 10 個標籤。");
  placeDialogTags.push(tag);
  renderPlaceDialogTags();
}

function renderPlaceDialogTags() {
  const selected = document.getElementById("place-tags-selected");
  selected.innerHTML = placeDialogTags.length
    ? placeDialogTags.map((tag, index) => `<span class="inline-flex items-center gap-1 rounded-full py-1 pl-3 pr-1 text-xs font-medium" style="${tagChipStyle(tag)}">${escapeHtml(tag)}<button type="button" data-remove-tag-index="${index}" class="rounded-full p-0.5 hover:bg-black/10" aria-label="移除 ${escapeHtml(tag)}"><i data-lucide="x" class="h-3 w-3"></i></button></span>`).join("")
    : `<span class="text-xs text-slate-400">尚未加入標籤</span>`;
  const existing = allPlaceTags().filter(tag => !placeDialogTags.includes(tag));
  document.getElementById("place-tags-existing").innerHTML = existing
    .map(tag => `<button type="button" data-existing-tag="${escapeHtml(tag)}" class="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 hover:border-indigo-400 hover:text-indigo-600"><i data-lucide="plus" class="h-3 w-3"></i>${escapeHtml(tag)}</button>`).join("");
  lucide.createIcons();
}

window.openExpenseDialog = isEdit => {
  const dialog = document.getElementById("expense-dialog");
  dialog.dataset.id = isEdit ? dialog.dataset.id : "";
  if (!isEdit) {
    dialog.querySelectorAll('input[type="number"]').forEach(input => { input.value = input.closest(".space-y-1") ? "" : "1"; });
    [...dialog.querySelectorAll('input[type="number"]')].slice(-2).forEach(input => { input.value = "1"; });
    dialog.querySelector("textarea").value = "";
    dialog.querySelector("#expense-date").value = new Date().toISOString().slice(0, 10);
    state.expensePayer = "高";
  }
  document.getElementById("expense-dialog-title").textContent = isEdit ? "編輯支出" : "新增支出";
  document.getElementById("expense-delete-btn").classList.toggle("hidden", !isEdit);
  selectButton([...dialog.querySelectorAll(".grid.grid-cols-2 button")], state.expensePayer);
  dialog.classList.add("open");
};

window.openPaymentDialog = isEdit => {
  const dialog = document.getElementById("payment-dialog");
  dialog.dataset.id = isEdit ? dialog.dataset.id : "";
  if (!isEdit) {
    dialog.querySelector("#payment-date").value = new Date().toISOString().slice(0, 10);
    dialog.querySelector('input[type="text"]').value = "";
    dialog.querySelector('input[type="number"]').value = "";
    state.paymentPayer = "高";
  }
  const payerButton = [...dialog.querySelectorAll(".space-y-2 > button")].find(button => button.dataset.value === state.paymentPayer);
  payerButton?.click();
  document.getElementById("payment-dialog-title").textContent = isEdit ? "編輯代付" : "新增代付";
  document.getElementById("payment-delete-btn").classList.toggle("hidden", !isEdit);
  dialog.classList.add("open");
};

window.openPlaceDialog = isEdit => {
  const dialog = document.getElementById("place-dialog");
  dialog.dataset.id = isEdit ? dialog.dataset.id : "";
  dialog.dataset.coordinatesEdited = "false";
  dialog.querySelector("#place-name-display").classList.toggle("hidden", !isEdit);
  dialog.querySelector("#place-coordinates-field").classList.toggle("hidden", !isEdit);
  if (!isEdit) {
    dialog.querySelector("#place-name-value").textContent = "";
    dialog.querySelector("#place-maps-link").value = "";
    dialog.querySelector("#place-coordinates").value = "";
    dialog.querySelector("#place-coordinate-sources").innerHTML = "";
    dialog.querySelector("#place-note").value = "";
    placeDialogTags = [];
  }
  dialog.querySelector("#place-tag-input").value = "";
  dialog.querySelector("#place-dialog-title").textContent = isEdit ? "編輯地點" : "新增地點";
  document.getElementById("place-delete-btn").classList.toggle("hidden", !isEdit);
  renderPlaceDialogTags();
  dialog.classList.add("open");
};

window.editPlace = id => {
  const place = state.places.find(entry => entry.id === id);
  if (!place) return;
  const dialog = document.getElementById("place-dialog");
  dialog.dataset.id = id;
  dialog.querySelector("#place-name-value").textContent = place.name || "";
  const hasCoordinates = place.latitude != null && place.longitude != null;
  const mapsUrl = place.mapsUrl || (hasCoordinates
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${place.latitude},${place.longitude}`)}`
    : "");
  dialog.querySelector("#place-maps-link").value = mapsUrl;
  dialog.querySelector("#place-coordinates").value = hasCoordinates ? `${place.latitude}, ${place.longitude}` : "";
  dialog.querySelector("#place-coordinate-sources").innerHTML = coordinateSourcesMarkup(place.coordinateSources);
  dialog.querySelector("#place-note").value = place.note || "";
  placeDialogTags = [...placeTags(place)];
  window.openPlaceDialog(true);
};

window.editExpense = id => {
  const expense = state.expenses.find(entry => entry.id === id);
  if (!expense) return;
  const dialog = document.getElementById("expense-dialog");
  dialog.dataset.id = id;
  dialog.querySelector("#expense-date").value = expense.date;
  const numberInputs = [...dialog.querySelectorAll('input[type="number"]')];
  categories.forEach((category, index) => { numberInputs[index].value = amount(expense.items?.[category]) || ""; });
  numberInputs[5].value = expense.ratios.high;
  numberInputs[6].value = expense.ratios.n;
  dialog.querySelector("textarea").value = expense.note || "";
  state.expensePayer = expense.payer;
  window.openExpenseDialog(true);
};

window.editPayment = id => {
  const payment = state.payments.find(entry => entry.id === id);
  if (!payment) return;
  const dialog = document.getElementById("payment-dialog");
  dialog.dataset.id = id;
  dialog.querySelector("#payment-date").value = payment.date;
  dialog.querySelector('input[type="text"]').value = payment.item;
  dialog.querySelector('input[type="number"]').value = payment.amount;
  state.paymentPayer = payment.payer;
  window.openPaymentDialog(true);
};

async function saveExpense() {
  const dialog = document.getElementById("expense-dialog");
  const inputs = [...dialog.querySelectorAll('input[type="number"]')];
  const items = Object.fromEntries(categories.map((category, index) => [category, amount(inputs[index].value)]));
  if (!expenseTotal({ items })) return alert("請輸入至少一項支出金額。");
  const entry = { date: dialog.querySelector("#expense-date").value, items, payer: state.expensePayer, ratios: { high: Math.max(1, amount(inputs[5].value)), n: Math.max(1, amount(inputs[6].value)) }, note: dialog.querySelector("textarea").value.trim(), updatedAt: Date.now() };
  try {
    await saveEntry("expenses", dialog.dataset.id, entry);
    closeDialog("expense-dialog");
  } catch (error) {
    showDataError(error);
  }
}

async function savePayment() {
  const dialog = document.getElementById("payment-dialog");
  const entry = { date: dialog.querySelector("#payment-date").value, item: dialog.querySelector('input[type="text"]').value.trim(), amount: amount(dialog.querySelector('input[type="number"]').value), payer: state.paymentPayer, debtor: state.paymentPayer === "高" ? "n" : "高", updatedAt: Date.now() };
  if (!entry.item || !entry.amount) return alert("請填寫品項與金額。");
  try {
    await saveEntry("payments", dialog.dataset.id, entry);
    closeDialog("payment-dialog");
  } catch (error) {
    showDataError(error);
  }
}

async function savePlace() {
  const dialog = document.getElementById("place-dialog");
  const existing = state.places.find(place => place.id === dialog.dataset.id);
  const mapsUrl = dialog.querySelector("#place-maps-link").value.trim();
  if (!mapsUrl) return alert("請貼上 Google Maps 分享連結。");
  let name = existing?.name || "";
  const address = existing?.address || "";
  const coordinatesWereEdited = dialog.dataset.id && dialog.dataset.coordinatesEdited === "true";
  const coordinatesText = coordinatesWereEdited
    ? dialog.querySelector("#place-coordinates").value.trim()
    : "";
  let coordinates = coordinatesText ? coordinatesFromText(coordinatesText) : null;
  if (coordinatesText && !coordinates) return alert("經緯度格式錯誤，請輸入「緯度, 經度」，例如 43.7706, 142.3650，或貼上 Google 地圖網址。");
  let coordinateSources = [];
  let coordinateScope = null;
  let coordinateMethod = null;
  let coordinateLabel = "";
  if (coordinates && existing && coordinates.latitude === Number(existing.latitude) && coordinates.longitude === Number(existing.longitude)) {
    coordinateSources = existing.coordinateSources || [];
    coordinateScope = existing.coordinateScope || null;
    coordinateMethod = existing.coordinateMethod || "cached";
    coordinateLabel = existing.coordinateLabel || "";
  } else if (coordinates) {
    coordinateMethod = "manual";
  } else if (!coordinates && existing && !coordinatesWereEdited
    && mapsUrl === (existing.mapsUrl || "")
    && existing.latitude != null && existing.longitude != null
    && Number.isFinite(Number(existing.latitude)) && Number.isFinite(Number(existing.longitude))) {
    coordinates = { latitude: Number(existing.latitude), longitude: Number(existing.longitude) };
    coordinateSources = existing.coordinateSources || [];
    coordinateScope = existing.coordinateScope || null;
    coordinateMethod = existing.coordinateMethod || "cached";
    coordinateLabel = existing.coordinateLabel || "";
  }
  const saveButton = dialog.querySelector(".btn-primary");
  saveButton.disabled = true;
  let lookupError = null;
  if (!coordinates) {
    saveButton.textContent = "解析地圖連結／辨識地點中…";
    try {
      const result = await requestPlaceCoordinates({ user: currentUser, name, address, mapsUrl });
      name = result.identifiedPlaceName || result.suggestedName || name;
      if (result.found) {
        coordinates = { latitude: result.latitude, longitude: result.longitude };
        coordinateSources = result.sources;
        coordinateScope = result.scope;
        coordinateMethod = result.method || "nominatim";
        coordinateLabel = result.identifiedPlaceName || result.resolvedName || "";
      }
    } catch (error) {
      lookupError = error;
      console.warn(`Unable to identify and geocode place: ${name}`, error);
    }
  }
  if (!name) {
    saveButton.disabled = false;
    saveButton.textContent = "儲存";
    return alert("無法從分享連結取得地點名稱，請補上地點名稱後再儲存。");
  }
  const entry = {
    name,
    tags: [...placeDialogTags],
    address,
    mapsUrl,
    note: dialog.querySelector("#place-note").value.trim(),
    latitude: coordinates?.latitude ?? null,
    longitude: coordinates?.longitude ?? null,
    coordinateSources,
    coordinateScope,
    coordinateMethod,
    coordinateLabel,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  saveButton.textContent = "儲存中…";
  try {
    await saveEntry("places", dialog.dataset.id, entry);
    closeDialog("place-dialog");
    alert(coordinatesText
      ? "已儲存，使用人工輸入的經緯度。"
      : coordinateMethod === "google_maps_link"
        ? `已使用 Google Maps 分享連結定位（${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}）。`
      : coordinateMethod === "nominatim"
        ? `已儲存，AI 辨識為「${coordinateLabel || name}」，由 OpenStreetMap 定位（${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}）。`
        : coordinates
          ? `已儲存座標（${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}）。`
        : lookupError
          ? "地點辨識或定位服務暫時無法使用，已儲存但座標留空；可稍後編輯地點再試。"
          : "找不到可確認的北海道地點，已儲存但座標留空；可補充地址後再試。");
  } catch (error) {
    showDataError(error);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "儲存";
  }
}

async function saveEntry(type, id, entry) {
  const entries = collection(database, "ledgers", appName, type);
  if (id) await updateDoc(doc(entries, id), entry);
  else await addDoc(entries, entry);
}

async function removeEntry(type, id) {
  if (!id || !confirm("確定要刪除這筆紀錄嗎？")) return;
  try {
    await deleteDoc(doc(database, "ledgers", appName, type, id));
    closeDialog({ expenses: "expense-dialog", payments: "payment-dialog", places: "place-dialog" }[type]);
  } catch (error) {
    showDataError(error);
  }
}

if (!isConfigured) {
  window.location.replace("login.html");
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  database = getFirestore(app);
  setupDialogs();
  document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));
  onAuthStateChanged(auth, user => {
    currentUser = null;
    if (!user || !isAllowed(user.email)) {
      if (user) signOut(auth);
      window.location.replace("login.html");
      return;
    }
    currentUser = user;
    onSnapshot(query(collection(database, "ledgers", appName, "expenses"), orderBy("date", "desc")), snapshot => {
      state.expenses = snapshot.docs.map(entry => ({ id: entry.id, ...entry.data() }));
      render();
    }, showDataError);
    onSnapshot(query(collection(database, "ledgers", appName, "payments"), orderBy("date", "desc")), snapshot => {
      state.payments = snapshot.docs.map(entry => ({ id: entry.id, ...entry.data() }));
      render();
    }, showDataError);
    onSnapshot(collection(database, "ledgers", appName, "places"), snapshot => {
      state.places = snapshot.docs.map(entry => ({ id: entry.id, ...entry.data() }));
      renderPlaces();
    }, showDataError);
  });
}