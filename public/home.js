import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteField,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  writeBatch,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { allowedEmails, appName, firebaseConfig, googleMapsApiKey } from "./firebase-config.js";
import { renderIcons } from "./icons.js";
import { requestJpyTwdRate, requestPlaceCoordinates, requestProductBarcodeAnalysis, requestReceiptDraft, requestTravelImageAnalysis } from "./ai-client.js";
import { calculateLedger, normalizeAmount, remapMemberId, remapSplitWeights, settlementTransfers } from "./ledger-math.js";

const legacyMembers = [
  { id: "legacy-high", name: "高", legacyName: "高", legacyRatioKey: "high" },
  { id: "legacy-n", name: "n", legacyName: "n", legacyRatioKey: "n" }
];
const legacyAccountIds = {
  "legacy-high": "zzdanny781024@gmail.com",
  "legacy-n": "ben155373@gmail.com"
};
let members = legacyMembers;
const categories = ["住宿", "餐費", "交通", "滑雪", "雜支"];
const state = { expenses: [], payments: [], places: [], imageAnalyses: [], imageAnalysisMode: "menu", imageAnalysisBusyMode: "", imageAnalysisStatus: "", imageAnalysisStatusTone: "text-slate-600", imageAnalysisStatusMode: "menu", expensePayerId: legacyMembers[0].id, paymentPayerId: legacyMembers[0].id, paymentDebtorId: legacyMembers[1].id, placeTagFilter: null, placeView: "list", settlementDirty: true };
const googlePlaceCoordinateLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const currency = new Intl.NumberFormat("zh-TW");
const isConfigured = !Object.values(firebaseConfig).some(value => value.includes("YOUR_"));
let placeMap;
let placeMarkers = [];
let placeMapInfoWindow;
let placeMapNeedsFit = true;
let placeMapRenderGeneration = 0;
let googleMapsApiPromise;
let placeExpiryTimer;
let placeDialogTags = [];
let database;
let currentUser = null;
const activeTripId = new URLSearchParams(window.location.search).get("trip");
let pendingTravelImageFile = null;
let pendingTravelImagePreviewUrl = "";
let pendingProductBarcode = "";
let barcodeScannerControls = null;
let imageAnalysisBusy = false;
let imageAnalysisStatus = "";
let imageAnalysisStatusTone = "text-slate-600";
let imageAnalysisRequested = false;
let imageAnalysisSubscribed = false;
let dialogsReady = false;
let imageViewerScale = 1;
let imageViewerOffsetX = 0;
let imageViewerOffsetY = 0;
const imageViewerPointers = new Map();
let imageViewerGesture = null;
let placesListenerRequested = false;
let placesListenerStarted = false;
const refreshingGooglePlaces = new Set();
const imageAnalysisThumbnailCache = new Map();
const loadingImageAnalysisThumbnails = new Set();
const jpyTwdRateCacheKey = "sharepay-jpy-twd-rate";
let calculatorYen = "0";
let calculatorExchange = null;
let calculatorRateLoading = false;

function tripCollection(type) {
  return collection(database, "ledgers", appName, "trips", activeTripId, type);
}

function tripDocument(type, id, ...segments) {
  return doc(database, "ledgers", appName, "trips", activeTripId, type, id, ...segments);
}

function cachedJpyTwdRate() {
  try {
    const cached = JSON.parse(localStorage.getItem(jpyTwdRateCacheKey));
    return Number.isFinite(cached?.rate) && cached.rate > 0 && typeof cached.date === "string" ? cached : null;
  } catch {
    return null;
  }
}

function renderCurrencyCalculator() {
  const yenOutput = document.getElementById("currency-jpy-amount");
  const twdOutput = document.getElementById("currency-twd-amount");
  const rateStatus = document.getElementById("currency-rate-status");
  if (!yenOutput || !twdOutput || !rateStatus) return;
  const yen = Number(calculatorYen);
  yenOutput.textContent = currency.format(yen);
  yenOutput.dataset.digits = String(calculatorYen.length);
  twdOutput.textContent = calculatorExchange ? currency.format(Math.round(yen * calculatorExchange.rate)) : "—";
  twdOutput.dataset.digits = String(twdOutput.textContent.length);
  if (calculatorRateLoading) {
    rateStatus.textContent = calculatorExchange ? "正在確認最新匯率…" : "正在取得最新匯率…";
    rateStatus.dataset.tone = "loading";
  } else if (calculatorExchange) {
    const prefix = calculatorExchange.cached ? "使用上次匯率" : "匯率更新";
    rateStatus.textContent = `${prefix} ${calculatorExchange.date} · ¥1 = NT$${calculatorExchange.rate.toFixed(4)}`;
    rateStatus.dataset.tone = calculatorExchange.cached ? "warning" : "ready";
  }
}

async function loadJpyTwdRate({ force = false } = {}) {
  if (calculatorRateLoading || calculatorExchange && !force && !calculatorExchange.cached) return;
  const cached = cachedJpyTwdRate();
  if (!calculatorExchange && cached) calculatorExchange = { ...cached, cached: true };
  calculatorRateLoading = true;
  renderCurrencyCalculator();
  try {
    const exchange = await requestJpyTwdRate({ user: currentUser });
    calculatorExchange = { ...exchange, cached: false };
    localStorage.setItem(jpyTwdRateCacheKey, JSON.stringify(exchange));
  } catch (error) {
    calculatorExchange = calculatorExchange || (cached ? { ...cached, cached: true } : null);
    const rateStatus = document.getElementById("currency-rate-status");
    if (!calculatorExchange && rateStatus) {
      rateStatus.textContent = error.message || "日圓匯率暫時無法取得，請稍後重試。";
      rateStatus.dataset.tone = "error";
    }
  } finally {
    calculatorRateLoading = false;
    renderCurrencyCalculator();
  }
}

function updateCalculatorInput(action, value = "") {
  if (action === "clear") calculatorYen = "0";
  if (action === "backspace") calculatorYen = calculatorYen.length > 1 ? calculatorYen.slice(0, -1) : "0";
  if (action === "append") {
    const next = calculatorYen === "0" ? value.replace(/^0+/, "") || "0" : `${calculatorYen}${value}`;
    calculatorYen = next.slice(0, 10);
  }
  renderCurrencyCalculator();
}

function setupCurrencyCalculator() {
  const dialog = document.getElementById("currency-calculator-dialog");
  const trigger = document.getElementById("currency-calculator-open");
  if (!dialog || !trigger) return;
  trigger.addEventListener("click", () => {
    dialog.showModal();
    renderCurrencyCalculator();
    loadJpyTwdRate();
  });
  dialog.querySelector("[data-currency-close]").addEventListener("click", () => dialog.close());
  dialog.querySelector("[data-currency-refresh]").addEventListener("click", () => loadJpyTwdRate({ force: true }));
  dialog.querySelectorAll("[data-currency-key]").forEach(button => button.addEventListener("click", () => {
    updateCalculatorInput(button.dataset.action, button.dataset.value);
  }));
  document.addEventListener("keydown", event => {
    if (!dialog.open) return;
    if (/^\d$/.test(event.key)) updateCalculatorInput("append", event.key);
    else if (event.key === "Backspace") updateCalculatorInput("backspace");
    else if (event.key === "Delete") updateCalculatorInput("clear");
    else return;
    event.preventDefault();
  });
}

function validTripMembers(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const normalized = value.map(member => ({ ...member, id: String(member?.id || "").trim(), name: String(member?.name || "").trim() }));
  if (normalized.some(member => !member.id || !member.name)) return null;
  if (new Set(normalized.map(member => member.id)).size !== normalized.length) return null;
  return normalized;
}

async function commitMigrationUpdates(updates) {
  for (let offset = 0; offset < updates.length; offset += 450) {
    const batch = writeBatch(database);
    updates.slice(offset, offset + 450).forEach(({ reference, fields }) => batch.update(reference, fields));
    await batch.commit();
  }
}

async function migrateTripLedger(tripReference, tripSnapshot) {
  const tripData = tripSnapshot.data();
  members = validTripMembers(tripData.members) || legacyMembers.map(member => ({ ...member }));
  const [expenseSnapshot, paymentSnapshot, profileSnapshot] = await Promise.all([
    getDocs(tripCollection("expenses")),
    getDocs(tripCollection("payments")),
    getDocs(collection(database, "ledgers", appName, "users"))
  ]);
  const profiles = new Map(profileSnapshot.docs.map(profileDocument => {
    const profile = profileDocument.data();
    return [String(profile.email || profileDocument.id).toLowerCase(), profile];
  }));
  members = members.map(member => {
    const mappedId = remapMemberId(member.id, legacyAccountIds);
    const email = String(member.email || (String(mappedId).includes("@") ? mappedId : "")).toLowerCase();
    const profile = profiles.get(email);
    if (!profile && mappedId === member.id) return member;
    return {
      ...member,
      id: mappedId,
      email,
      name: profile?.displayName?.trim() || (mappedId !== member.id ? email.replace(/@gmail\.com$/i, "") : member.name),
      photoURL: profile?.photoURL || member.photoURL || ""
    };
  });
  const updates = [];
  expenseSnapshot.docs.forEach(expenseDocument => {
    const entry = expenseDocument.data();
    const remappedEntry = {
      ...entry,
      payerId: remapMemberId(entry.payerId, legacyAccountIds),
      splitWeights: remapSplitWeights(entry.splitWeights, legacyAccountIds)
    };
    const normalized = normalizeExpense(remappedEntry);
    const fields = {};
    if (entry.payerId !== normalized.payerId) fields.payerId = normalized.payerId;
    const hasLegacySplitWeights = Object.keys(entry.splitWeights || {}).some(memberId => legacyAccountIds[memberId]);
    if (!entry.splitWeights || hasLegacySplitWeights || !members.some(member => Number(entry.splitWeights[member.id]) > 0)) fields.splitWeights = normalized.splitWeights;
    if (Object.keys(fields).length) updates.push({ reference: expenseDocument.ref, fields });
  });
  paymentSnapshot.docs.forEach(paymentDocument => {
    const entry = paymentDocument.data();
    const normalized = normalizePayment({
      ...entry,
      payerId: remapMemberId(entry.payerId, legacyAccountIds),
      debtorId: remapMemberId(entry.debtorId, legacyAccountIds)
    });
    const fields = {};
    if (entry.payerId !== normalized.payerId) fields.payerId = normalized.payerId;
    if (entry.debtorId !== normalized.debtorId) fields.debtorId = normalized.debtorId;
    if (Object.keys(fields).length) updates.push({ reference: paymentDocument.ref, fields });
  });
  await commitMigrationUpdates(updates);
  await setDoc(tripReference, {
    members,
    schemaVersion: Math.max(2, Number(tripData.schemaVersion) || 0),
    memberMigrationVersion: 1,
    legacyAccountMigrationVersion: 1
  }, { merge: true });
}

function isAllowed(email) {
  return Boolean(email) && allowedEmails.some(value => value.toLowerCase() === email.toLowerCase());
}

function amount(value) {
  return normalizeAmount(value);
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

function memberName(memberId) {
  const name = members.find(member => member.id === memberId)?.name || "未知成員";
  return name.replace(/@gmail\.com$/i, "");
}

function memberAvatar(memberId, sizeClasses = "h-7 w-7 text-xs") {
  const member = members.find(candidate => candidate.id === memberId);
  const name = memberName(memberId);
  const memberIndex = Math.max(0, members.findIndex(candidate => candidate.id === memberId));
  const content = member?.photoURL
    ? `<img src="${escapeHtml(member.photoURL)}" alt="" referrerpolicy="no-referrer" class="h-full w-full object-cover" />`
    : escapeHtml(name.slice(0, 1).toUpperCase());
  return `<span class="${sizeClasses} inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white ring-1 ring-white/80" style="background:${memberAccent(memberIndex)}" aria-hidden="true">${content}</span>`;
}

function memberIdentity(memberId, sizeClasses = "h-7 w-7 text-xs") {
  return `<span class="inline-flex min-w-0 items-center gap-2">${memberAvatar(memberId, sizeClasses)}<span class="truncate">${escapeHtml(memberName(memberId))}</span></span>`;
}

function legacyMemberId(name) {
  return members.find(member => member.legacyName === name || member.name === name)?.id || null;
}

function normalizedSplitWeights(expense) {
  if (expense.splitWeights && members.some(member => Number(expense.splitWeights[member.id]) > 0)) {
    return Object.fromEntries(members.map(member => [member.id, Math.max(0, Number(expense.splitWeights[member.id]) || 0)]));
  }
  if (expense.ratios && members.length === 2) {
    return {
      [members[0].id]: Math.max(1, amount(expense.ratios.high)),
      [members[1].id]: Math.max(1, amount(expense.ratios.n))
    };
  }
  return Object.fromEntries(members.map(member => [member.id, 1]));
}

function normalizeExpense(entry) {
  const payerId = members.some(member => member.id === entry.payerId)
    ? entry.payerId
    : legacyMemberId(entry.payer) || members[0].id;
  return {
    ...entry,
    payerId,
    splitWeights: normalizedSplitWeights(entry)
  };
}

function normalizePayment(entry) {
  const payerId = members.some(member => member.id === entry.payerId)
    ? entry.payerId
    : legacyMemberId(entry.payer) || members[0].id;
  const debtorId = members.some(member => member.id === entry.debtorId)
    ? entry.debtorId
    : legacyMemberId(entry.debtor) || members.find(member => member.id !== payerId)?.id || members[0].id;
  return { ...entry, payerId, debtorId };
}

function updateExpenseTotalPreview() {
  const dialog = document.getElementById("expense-dialog");
  const itemInputs = [...dialog.querySelectorAll('input[type="number"]')].slice(0, categories.length);
  const total = itemInputs.reduce((sum, input) => sum + amount(input.value), 0);
  document.getElementById("expense-total-preview").textContent = formatted(total);
}

function calculation() {
  return calculateLedger({ members, expenses: state.expenses, payments: state.payments, categories });
}

function render({ expenses = true, payments = true } = {}) {
  const totals = calculation();
  if (expenses) renderExpenses(totals);
  if (payments) renderPayments(totals);
  const ledgerApp = document.getElementById("ledger-app");
  const settlementTab = document.getElementById("tab-settlement");
  if (!ledgerApp.classList.contains("hidden") && !settlementTab.classList.contains("hidden")) {
    renderSettlement(totals);
    state.settlementDirty = false;
  } else {
    state.settlementDirty = true;
  }
  const transfers = settlementTransfers(totals.balance, members);
  const settlementAmount = transfers.reduce((sum, transfer) => sum + transfer.amount, 0);
  document.querySelector("header .text-2xl").textContent = formatted(settlementAmount);
  document.querySelector("header .text-lg").textContent = transfers.length === 0
    ? "目前已結清"
    : transfers.length === 1
      ? `${memberName(transfers[0].fromId)} → ${memberName(transfers[0].toId)}`
      : `${transfers.length} 筆待結算`;
}

function splitSummary(expense) {
  const entries = members.map(member => [memberName(member.id), amount(expense.splitWeights?.[member.id])]).filter(([, weight]) => weight > 0);
  if (entries.length === members.length && entries.every(([, weight]) => weight === entries[0][1])) return `${members.length} 人平均分攤`;
  return entries.map(([name, weight]) => `${name} ${weight}`).join(" : ");
}

function renderExpenses(totals) {
  const total = state.expenses.reduce((sum, expense) => sum + expenseTotal(expense), 0);
  const list = state.expenses.map(expense => {
    const entries = categories.filter(category => amount(expense.items?.[category])).map(category => `
      <div class="flex justify-between text-sm"><span class="text-slate-500">${category}</span><span class="font-medium text-slate-700">${formatted(expense.items[category])}</span></div>`).join("");
    return `<button class="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-sm active:scale-[0.98] transition-transform" data-expense-id="${escapeHtml(expense.id)}">
      <div class="flex items-center justify-between mb-2.5"><span class="text-sm font-medium text-slate-500">${formattedDate(expense.date)}</span><span class="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 py-1 pl-1 pr-2.5 text-xs font-semibold text-indigo-700">${memberAvatar(expense.payerId, "h-5 w-5 text-[10px]")}<span>${escapeHtml(memberName(expense.payerId))} 付款</span></span></div>
      <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">${entries}</div>
      <div class="flex items-end justify-between pt-2.5 border-t border-slate-100"><div class="min-w-0 flex-1"><span class="text-xs text-slate-400">${escapeHtml(splitSummary(expense))}</span><p class="text-xs text-slate-500 mt-0.5 truncate">${escapeHtml(expense.note || "無備註")}</p></div><div class="text-right ml-3"><span class="text-lg font-bold text-slate-900">${formatted(expenseTotal(expense))}</span><span class="text-xs text-slate-400 ml-1">元</span></div></div>
    </button>`;
  }).join("") || emptyState("receipt", "尚無支出紀錄", "點右下角按鈕新增支出");
  document.getElementById("tab-expenses").innerHTML = `<div class="px-4 py-4"><div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm"><div class="flex justify-between items-end"><div><p class="text-xs text-slate-500">總支出</p><p class="text-2xl font-bold text-slate-900 mt-0.5">${formatted(total)} <span class="text-sm font-normal text-slate-400">元</span></p></div><div class="text-right"><p class="text-xs text-slate-500">筆數</p><p class="text-2xl font-bold text-slate-900 mt-0.5">${state.expenses.length}</p></div></div></div></div><div class="px-4 space-y-2.5">${list}</div><button onclick="openExpenseDialog(false)" class="fixed bottom-20 z-20 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center active:scale-95 transition-transform" style="right: max(1rem, calc(50% - 18rem + 1rem))" aria-label="新增支出"><i data-lucide="plus" class="w-6 h-6"></i></button>`;
  document.querySelectorAll("#tab-expenses [data-expense-id]").forEach(button => button.addEventListener("click", () => editExpense(button.dataset.expenseId)));
  renderIcons(document.getElementById("tab-expenses"));
}

function renderPayments(totals) {
  const total = state.payments.reduce((sum, payment) => sum + amount(payment.amount), 0);
  const list = state.payments.map(payment => `<button class="w-full text-left bg-white rounded-2xl border border-slate-200 p-4 shadow-sm active:scale-[0.98] transition-transform" data-payment-id="${escapeHtml(payment.id)}"><div class="flex items-center justify-between"><div class="min-w-0 flex-1"><span class="text-sm font-medium text-slate-500">${formattedDate(payment.date)}</span><p class="text-base font-semibold text-slate-900 mt-0.5 truncate">${escapeHtml(payment.item)}</p><div class="mt-2 flex items-center gap-2 text-xs font-medium text-slate-700">${memberIdentity(payment.debtorId, "h-6 w-6 text-[10px]")}<i data-lucide="arrow-right" class="h-3.5 w-3.5 shrink-0 text-slate-400"></i>${memberIdentity(payment.payerId, "h-6 w-6 text-[10px]")}</div><p class="mt-1 text-xs text-slate-400">${escapeHtml(memberName(payment.debtorId))} 需支付 ${escapeHtml(memberName(payment.payerId))}</p></div><div class="text-right ml-3"><span class="text-lg font-bold text-slate-900">${formatted(payment.amount)}</span><span class="text-xs text-slate-400 ml-1">元</span></div></div></button>`).join("") || emptyState("repeat", "尚無代付紀錄", "點右下角按鈕新增代付");
  document.getElementById("tab-payments").innerHTML = `<div class="px-4 py-4"><div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm"><div class="flex justify-between items-end"><div><p class="text-xs text-slate-500">代付總額</p><p class="text-2xl font-bold text-slate-900 mt-0.5">${formatted(total)} <span class="text-sm font-normal text-slate-400">元</span></p></div><div class="text-right"><p class="text-xs text-slate-500">筆數</p><p class="text-2xl font-bold text-slate-900 mt-0.5">${state.payments.length}</p></div></div></div></div><div class="px-4 space-y-2.5">${list}</div><button onclick="openPaymentDialog(false)" class="fixed bottom-20 z-20 w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 flex items-center justify-center active:scale-95 transition-transform" style="right: max(1rem, calc(50% - 18rem + 1rem))" aria-label="新增代付"><i data-lucide="plus" class="w-6 h-6"></i></button>`;
  document.querySelectorAll("#tab-payments [data-payment-id]").forEach(button => button.addEventListener("click", () => editPayment(button.dataset.paymentId)));
  renderIcons(document.getElementById("tab-payments"));
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

function renderImageAnalysisPanel() {
  const mode = state.imageAnalysisMode;
  const modeLabel = mode === "menu" ? "菜單" : "商品";
  const modeDescription = mode === "menu"
    ? "拍攝菜單，查看日文翻譯、價格與原圖中文覆蓋。"
    : "辨識商品並查證產地、特色、價格與旭川購買點。";
  const modeButton = (value, label, icon) => {
    const count = state.imageAnalyses.filter(analysis => analysis.type === value).length;
    return `<button type="button" role="tab" id="image-analysis-tab-${value}" aria-controls="image-analysis-panel" aria-selected="${mode === value}" tabindex="${mode === value ? "0" : "-1"}" data-image-analysis-mode="${value}" class="image-analysis-mode flex min-h-11 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"><i data-lucide="${icon}" class="h-4 w-4"></i><span>${label}</span>${count ? `<span class="image-analysis-count">${count}</span>` : ""}</button>`;
  };
  const records = state.imageAnalyses.filter(analysis => analysis.type === mode).map(analysis => {
    const title = analysis.type === "menu"
      ? analysis.title || "菜單辨識"
      : analysis.productName || analysis.title || "商品辨識";
    const detailId = `image-analysis-detail-${escapeHtml(analysis.id)}`;
    const date = Number.isFinite(analysis.createdAt) ? formattedDate(new Date(analysis.createdAt).toISOString().slice(0, 10)) : "";
    const thumbnail = analysis.identificationMethod === "barcode" && !analysis.hasImage
      ? `<span class="grid h-12 w-12 shrink-0 place-items-center rounded-md border border-emerald-200 bg-emerald-50"><i data-lucide="barcode" class="h-5 w-5 text-emerald-700"></i></span>`
      : `<span class="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md border border-slate-200 bg-slate-50" data-image-analysis-thumbnail="${escapeHtml(analysis.id)}" data-thumbnail-alt="${escapeHtml(title)}縮圖"><i data-lucide="${analysis.type === "menu" ? "book-open" : "package"}" class="h-5 w-5 text-slate-400" data-thumbnail-placeholder></i></span>`;
    return `<article class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div class="flex items-start gap-2"><button type="button" data-open-image-analysis="${escapeHtml(analysis.id)}" aria-expanded="false" aria-controls="${detailId}" class="min-w-0 flex-1 text-left"><span class="flex items-center gap-3">${thumbnail}<span class="min-w-0 flex-1"><span class="block truncate text-sm font-semibold text-slate-900">${escapeHtml(title)}</span><span class="mt-1 block text-xs text-slate-500">${analysis.type === "menu" ? `菜單 · ${analysis.menuItems?.length || 0} 項` : `商品 · ${escapeHtml(analysis.brand || "品牌未辨識")}`} ${date ? `· ${date}` : ""}</span></span></span></button><button type="button" data-delete-image-analysis="${escapeHtml(analysis.id)}" class="shrink-0 rounded-md p-2 text-slate-400 hover:bg-slate-100 hover:text-rose-700" aria-label="刪除${escapeHtml(title)}"><i data-lucide="trash-2" class="h-4 w-4"></i></button></div><div id="${detailId}" class="hidden mt-3 border-t border-slate-100 pt-3" data-image-analysis-detail></div></article>`;
  });

  const selectedImage = pendingTravelImageFile
    ? `<div class="mt-3 flex min-h-16 min-w-0 items-center gap-3 rounded-lg bg-slate-50 px-2"><img src="${escapeHtml(pendingTravelImagePreviewUrl)}" alt="已選圖片預覽" class="h-12 w-12 shrink-0 rounded-md border border-slate-200 object-cover"><span id="travel-image-name" class="min-w-0 flex-1 truncate text-left text-sm text-slate-700">${escapeHtml(pendingTravelImageFile.name)}</span></div>`
    : `<p id="travel-image-name" class="mt-2 text-center text-xs text-slate-500">支援 JPEG、PNG、WebP</p>`;
  imageAnalysisStatus = state.imageAnalysisStatus;
  imageAnalysisStatusTone = state.imageAnalysisStatusTone;
  const statusIsCurrent = imageAnalysisStatus && state.imageAnalysisStatusMode === mode;
  const busyNotice = imageAnalysisBusy && state.imageAnalysisBusyMode !== mode
    ? `<p class="mt-3 text-sm text-slate-600" role="status">正在辨識${state.imageAnalysisBusyMode === "menu" ? "菜單" : "商品"}；目前可先瀏覽此頁籤。</p>`
    : "";
  const emptyTitle = mode === "menu" ? "尚無菜單翻譯" : "尚無商品搜尋結果";
  const emptyDetail = mode === "menu" ? "選擇一張菜單照片開始翻譯。" : "選擇一張商品照片開始查證。";
  return `<section class="px-4 pb-4 pt-2" aria-label="圖片辨識"><div class="image-analysis-sticky"><div class="grid grid-cols-2 rounded-lg bg-white p-1" role="tablist" aria-label="切換辨識類型">${modeButton("menu", "菜單", "book-open")}${modeButton("product", "商品", "package")}</div><div class="pt-3"><h2 id="image-analysis-heading" class="text-base font-semibold text-slate-900">${modeLabel}辨識</h2><p class="mt-1 text-xs leading-5 text-slate-600">${modeDescription}</p></div></div><div id="image-analysis-panel" role="tabpanel" aria-labelledby="image-analysis-tab-${mode}" class="pt-4"><input id="travel-image-input" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" class="sr-only" aria-label="選擇或拍攝${modeLabel}圖片"><button id="travel-image-choose" type="button" class="${pendingTravelImageFile ? "btn-outline" : "image-analysis-primary"} btn-flex min-h-11 w-full justify-center rounded-md"><i data-lucide="camera" class="mr-1 h-4 w-4"></i>${pendingTravelImageFile ? "更換圖片" : `選擇${modeLabel}圖片`}</button>${selectedImage}${pendingTravelImageFile ? `<button id="travel-image-analyze" type="button" class="image-analysis-primary btn-flex mt-3 min-h-11 w-full justify-center rounded-md" ${imageAnalysisBusy ? "disabled" : ""}>${imageAnalysisBusy ? `正在辨識${state.imageAnalysisBusyMode === "menu" ? "菜單" : "商品"}…` : mode === "menu" ? "開始翻譯菜單" : "搜尋商品資訊"}</button>` : ""}${busyNotice}<p class="mt-3 text-xs leading-5 text-slate-500">圖片先壓縮再送交 AI；辨識結果與壓縮圖會儲存在 Firebase，請核對內容。</p><p id="travel-image-status" class="${statusIsCurrent ? "" : "hidden"} mt-3 text-sm leading-5 ${imageAnalysisStatusTone}" aria-live="polite">${escapeHtml(statusIsCurrent ? imageAnalysisStatus : "")}</p><div class="mt-6"><div class="mb-2 flex items-center justify-between"><h3 class="text-sm font-semibold text-slate-800">${mode === "menu" ? "菜單翻譯紀錄" : "商品搜尋紀錄"}</h3><span class="text-xs text-slate-500">${records.length} 筆</span></div><div class="space-y-2.5">${records.join("") || `<div class="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center"><p class="text-sm font-medium text-slate-700">${emptyTitle}</p><p class="mt-1 text-xs text-slate-500">${emptyDetail}</p></div>`}</div></div></div></section>`;
}

async function compressTravelImage(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size > 15_000_000) {
    throw new Error("請選擇 JPEG、PNG 或 WebP 圖片，原始檔需小於 15MB。");
  }
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("無法讀取圖片，請換一張再試。"));
      element.src = objectUrl;
    });
    for (const [maxDimension, quality] of [[1400, 0.78], [1050, 0.68], [850, 0.58]]) {
      const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("無法處理圖片，請換一張再試。");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob || blob.size > 500_000) continue;
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve({ dataUrl: reader.result, size: blob.size });
        reader.onerror = () => reject(new Error("讀取圖片失敗，請再試一次。"));
        reader.readAsDataURL(blob);
      });
    }
    throw new Error("圖片太大，請裁切後再試。");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function renderProductResearch(analysis) {
  const researchStatusMessages = {
    completed: "已搜尋商品來源；下方資訊僅列出可查證內容。",
    not_found: "已搜尋，但目前沒有找到足以引用的可靠商品資料。",
    not_searched: "商品名稱信心不足，未使用猜測名稱搜尋。",
    search_unavailable: "商品已辨識，但網路搜尋暫時不可用。"
  };
  const researchStatusMessage = researchStatusMessages[analysis.researchStatus]
    || "此筆紀錄尚無網路查證狀態，以下為圖片辨識結果。";
  const limitedLabels = {
    asahikawa: "旭川限定",
    hokkaido: "北海道限定",
    japan: "日本限定",
    not_limited: "來源未標示限定",
    unknown: "限定資訊未查證"
  };
  const tags = [...new Set([...(analysis.tags || []), ...(analysis.limitedScope && analysis.limitedScope !== "unknown" && analysis.limitedScope !== "not_limited" ? [limitedLabels[analysis.limitedScope]] : [])])];
  const origin = analysis.originStatus === "verified" && analysis.origin
    ? `產地：${escapeHtml(analysis.origin)}`
    : "產地尚未查得可靠來源";
  const limited = limitedLabels[analysis.limitedScope] || limitedLabels.unknown;
  const features = (analysis.features || []).filter(Boolean).slice(0, 5);
  const referencePriceMin = Number(analysis.referencePriceMin) || 0;
  const referencePriceMax = Number(analysis.referencePriceMax) || 0;
  const referencePriceCurrency = analysis.referencePriceCurrency || "UNKNOWN";
  const formatPrice = value => `${referencePriceCurrency === "JPY" ? "¥" : referencePriceCurrency === "TWD" ? "NT$ " : `${referencePriceCurrency} `}${currency.format(value)}`;
  const referencePrice = referencePriceMin && referencePriceMax
    ? referencePriceMin === referencePriceMax
      ? formatPrice(referencePriceMin)
      : `${formatPrice(referencePriceMin)}–${formatPrice(referencePriceMax)}`
    : "尚未查得可信參考價格";
  const twdPrice = Number.isFinite(analysis.referencePriceTwdMin) && Number.isFinite(analysis.referencePriceTwdMax)
    ? analysis.referencePriceTwdMin === analysis.referencePriceTwdMax
      ? `約 NT$ ${currency.format(analysis.referencePriceTwdMin)}`
      : `約 NT$ ${currency.format(analysis.referencePriceTwdMin)}–${currency.format(analysis.referencePriceTwdMax)}`
    : "";
  const sourceLinks = (analysis.sources || []).slice(0, 3).map(source => {
    try {
      const url = new URL(source.url);
      if (url.protocol !== "https:") return "";
      return `<a href="${escapeHtml(url.href)}" target="_blank" rel="noopener noreferrer" class="text-sm font-medium text-emerald-800 underline underline-offset-2">${escapeHtml(source.title || "資料來源")}</a>`;
    } catch {
      return "";
    }
  }).filter(Boolean);
  const areaLabels = { asahikawa: "旭川", hokkaido_other: "北海道其他地區", unknown: "區域未確認" };
  const availabilityLabels = {
    product_listed: "來源列有此商品；門市庫存未確認",
    store_confirmed: "來源提及此門市販售；當日庫存仍需確認",
    unknown: "商品與門市供應狀況未確認"
  };
  const purchaseOptions = (analysis.purchaseOptions || []).slice(0, 4).map(option => {
    const query = encodeURIComponent([option.name, option.address].filter(Boolean).join(" "));
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
    return `<li class="py-2.5 first:pt-0 last:pb-0"><div class="flex items-start justify-between gap-3"><div class="min-w-0"><p class="text-sm font-semibold text-slate-900">${escapeHtml(option.name)}</p><p class="mt-0.5 text-xs text-slate-600">${escapeHtml(option.address || areaLabels[option.area] || "")}</p><p class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(option.reason || "來源提及此購買點")}</p><p class="mt-1 text-xs text-amber-800">${escapeHtml(availabilityLabels[option.availability] || availabilityLabels.unknown)}</p></div><a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="shrink-0 text-xs font-medium text-emerald-800 underline underline-offset-2" aria-label="在地圖查看${escapeHtml(option.name)}">地圖</a></div></li>`;
  });
  const purchaseContent = purchaseOptions.length
    ? `<ul class="divide-y divide-slate-100">${purchaseOptions.join("")}</ul><p class="mt-2 text-xs leading-5 text-slate-500">購買點依網路來源整理，未確認即時庫存；出發前請向店家確認。</p>`
    : `<p class="text-sm text-slate-600">${analysis.researchStatus === "not_searched" ? "商品名稱未確認，因此沒有搜尋旭川購買點。" : analysis.researchStatus === "search_unavailable" ? "網路搜尋暫時不可用，尚未確認購買點。" : "目前找不到來源明確的旭川實體購買點。"}</p>`;
  const visiblePrice = analysis.priceText
    ? `<p class="mt-2 text-xs text-slate-600">包裝可見標價：${escapeHtml(analysis.priceText)}${analysis.currency && analysis.currency !== "UNKNOWN" ? ` ${escapeHtml(analysis.currency)}` : ""}</p>`
    : "";
  const priceNote = analysis.referencePriceCheckedAt
    ? `<p class="mt-1 text-xs leading-5 text-slate-500">查詢日期 ${escapeHtml(analysis.referencePriceCheckedAt)}${analysis.referencePriceNote ? `；${escapeHtml(analysis.referencePriceNote)}` : ""}${analysis.referenceExchangeRateDate ? `；台幣換算採 ${escapeHtml(analysis.referenceExchangeRateDate)} 匯率` : ""}</p>`
    : "";

  return `<div class="mt-3 space-y-4"><section><h3 class="text-lg font-semibold text-slate-900">${escapeHtml(analysis.productName || "商品名稱未確認")}</h3>${analysis.brand ? `<p class="mt-0.5 text-sm text-slate-600">${escapeHtml(analysis.brand)}</p>` : ""}<p class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(researchStatusMessage)}</p><div class="mt-2 flex flex-wrap gap-1.5">${tags.map(tag => `<span class="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900">${escapeHtml(tag)}</span>`).join("") || `<span class="text-xs text-slate-500">尚無來源支持的推薦標籤</span>`}</div><p class="mt-3 text-sm font-medium leading-6 text-slate-800">${escapeHtml(analysis.oneLineFeature || features[0] || analysis.description || "尚未辨識到明確特色")}</p>${features.length > 1 ? `<ul class="mt-1 list-disc space-y-1 pl-5 text-sm leading-5 text-slate-600">${features.slice(1).map(feature => `<li>${escapeHtml(feature)}</li>`).join("")}</ul>` : ""}</section><section class="border-t border-slate-100 pt-3"><h4 class="text-sm font-semibold text-slate-900">產地與限定</h4><p class="mt-1 text-sm text-slate-700">${origin}</p><p class="mt-1 text-sm text-slate-700">${escapeHtml(limited)}</p>${analysis.limitedEvidence ? `<p class="mt-1 text-xs leading-5 text-slate-500">${escapeHtml(analysis.limitedEvidence)}</p>` : ""}</section><section class="border-t border-slate-100 pt-3"><h4 class="text-sm font-semibold text-slate-900">推薦理由</h4><p class="mt-1 text-sm leading-6 text-slate-700">${escapeHtml(analysis.recommendationReason || "目前沒有足夠可靠來源說明購買價值")}</p></section><section class="border-t border-slate-100 pt-3"><h4 class="text-sm font-semibold text-slate-900">參考價格</h4><p class="mt-1 text-base font-semibold text-slate-900">${escapeHtml(referencePrice)}</p>${twdPrice ? `<p class="mt-0.5 text-sm font-medium text-emerald-800">${escapeHtml(twdPrice)}</p>` : ""}${visiblePrice}${priceNote}</section><section class="border-t border-slate-100 pt-3"><h4 class="text-sm font-semibold text-slate-900">哪裡買</h4><p class="mb-2 mt-1 text-xs text-slate-500">優先整理旭川附近的實體通路</p>${purchaseContent}</section>${sourceLinks.length ? `<section class="border-t border-slate-100 pt-3"><h4 class="text-sm font-semibold text-slate-900">查證來源</h4><ul class="mt-1 space-y-1">${sourceLinks.map(link => `<li>${link}</li>`).join("")}</ul></section>` : `<p class="border-t border-slate-100 pt-3 text-xs text-slate-500">商品資料尚無可列出的網路來源。</p>`}</div>`;
}

function renderImageAnalysisDetail(analysis, dataUrl) {
  const menuRows = (analysis.menuItems || []).map(item => {
    const printedPrice = item.priceText || (item.priceAmount > 0 ? `${currency.format(item.priceAmount)} ${item.currency}` : "");
    const twdPrice = Number.isFinite(item.twdPrice)
      ? `<span class="block text-xs font-semibold text-emerald-700">NT$ ${currency.format(item.twdPrice)}</span>`
      : item.currency === "JPY" && item.priceAmount > 0 ? `<span class="block text-[11px] text-amber-700">匯率暫不可用</span>` : "";
    return `<tr class="border-t border-slate-100 align-top"><td class="py-2 pr-3 text-sm text-slate-500">${escapeHtml(item.originalText)}</td><td class="py-2 pr-3 text-sm font-medium text-slate-900">${escapeHtml(item.translatedText)}</td><td class="py-2 text-right text-sm text-slate-600"><span>${escapeHtml(printedPrice)}</span>${twdPrice}</td></tr>`;
  }).join("");
  const menuRateNote = analysis.exchangeRateDate
    ? `<p class="mt-2 text-xs text-slate-500">日圓換算採 ${escapeHtml(analysis.exchangeRateDate)} 最新匯率（${escapeHtml(analysis.exchangeRateSource || "匯率服務")}），僅供參考。</p>`
    : (analysis.menuItems || []).some(item => item.currency === "JPY" && item.priceAmount > 0 && !Number.isFinite(item.twdPrice))
      ? `<p class="mt-2 text-xs text-amber-700">目前無法取得日圓匯率，原價仍保留。</p>`
      : "";
  const overlays = (analysis.menuItems || []).filter(item => item.translatedText).map(item => `<span class="absolute overflow-hidden rounded bg-white/95 px-1 py-0.5 text-[10px] font-semibold leading-tight text-slate-900 shadow" style="left:${item.x * 100}%;top:${item.y * 100}%;width:${Math.max(8, item.width * 100)}%;min-height:${Math.max(3, item.height * 100)}%">${escapeHtml(item.translatedText)}</span>`).join("");
  const imageAlt = analysis.title || analysis.productName || "辨識圖片";
  const image = `<div class="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"><button type="button" data-expand-image aria-label="放大${escapeHtml(imageAlt)}" title="點擊放大圖片" class="relative block w-full cursor-zoom-in p-0 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600 focus-visible:outline-offset-2"><img src="${escapeHtml(dataUrl)}" alt="${escapeHtml(imageAlt)}" class="block h-auto w-full" loading="lazy"><span class="absolute bottom-2 right-2 grid h-9 w-9 place-items-center rounded-full bg-white/95 text-slate-700 shadow" aria-hidden="true"><i data-lucide="maximize-2" class="h-4 w-4"></i></span></button>${analysis.type === "menu" ? `<div class="pointer-events-none absolute inset-0 hidden" data-menu-translation-overlay>${overlays}</div>` : ""}</div>`;
  const overlayToggle = analysis.type === "menu"
    ? `<div class="mb-2 flex items-center justify-between"><span class="text-xs font-medium text-slate-600">原圖中文覆蓋</span><button type="button" data-toggle-menu-overlay aria-pressed="false" class="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700">疊加中文</button></div>`
    : "";
  const menu = analysis.type === "menu"
    ? `<div class="mt-3 overflow-x-auto"><table class="w-full text-left"><thead><tr class="text-xs text-slate-400"><th class="pb-2 pr-3 font-medium">日文</th><th class="pb-2 pr-3 font-medium">繁體中文</th><th class="pb-2 text-right font-medium">原價／TWD</th></tr></thead><tbody>${menuRows}</tbody></table>${menuRateNote}</div>`
    : renderProductResearch(analysis);
  return `<div>${overlayToggle}${image}${menu}</div>`;
}

async function openImageAnalysisDetail(analysisId, button) {
  const detail = button.closest("article")?.querySelector("[data-image-analysis-detail]");
  if (!detail) return;
  if (!detail.classList.contains("hidden")) {
    detail.classList.add("hidden");
    button.setAttribute("aria-expanded", "false");
    return;
  }
  detail.classList.remove("hidden");
  button.setAttribute("aria-expanded", "true");
  if (detail.dataset.loaded === "true") return;
  detail.textContent = "載入圖片…";
  try {
    const analysis = state.imageAnalyses.find(item => item.id === analysisId);
    if (analysis?.identificationMethod === "barcode") {
      const asset = analysis.hasImage
        ? await getDoc(tripDocument("imageAnalyses", analysisId, "assets", "original"))
        : null;
      detail.innerHTML = `<p class="mb-3 text-xs font-medium text-emerald-800">條碼 ${escapeHtml(analysis.barcode || "")}</p>${asset?.exists() ? renderImageAnalysisDetail(analysis, asset.data().dataUrl) : renderProductResearch(analysis)}`;
      detail.dataset.loaded = "true";
      renderIcons(detail);
      detail.querySelector("[data-expand-image]")?.addEventListener("click", () => {
        const viewer = document.getElementById("image-viewer-dialog");
        const sourceImage = detail.querySelector("[data-expand-image] img");
        const viewerImage = document.createElement("img");
        viewerImage.id = "image-viewer-image";
        viewerImage.src = sourceImage.src;
        viewerImage.alt = sourceImage.alt;
        viewerImage.draggable = false;
        document.getElementById("image-viewer-stage").replaceChildren(viewerImage);
        resetImageViewer();
        viewer.showModal();
      });
      return;
    }
    const asset = await getDoc(tripDocument("imageAnalyses", analysisId, "assets", "original"));
    if (!asset.exists()) throw new Error("找不到辨識圖片。");
    detail.innerHTML = renderImageAnalysisDetail(analysis, asset.data().dataUrl);
    detail.dataset.loaded = "true";
    renderIcons(detail);
    detail.querySelector("[data-expand-image]")?.addEventListener("click", () => {
      const viewer = document.getElementById("image-viewer-dialog");
      const sourceImage = detail.querySelector("[data-expand-image] img");
      const viewerImage = document.createElement("img");
      viewerImage.id = "image-viewer-image";
      viewerImage.src = sourceImage.src;
      viewerImage.alt = sourceImage.alt;
      viewerImage.draggable = false;
      document.getElementById("image-viewer-stage").replaceChildren(viewerImage);
      resetImageViewer();
      viewer.showModal();
    });
    const overlay = detail.querySelector("[data-menu-translation-overlay]");
    detail.querySelector("[data-toggle-menu-overlay]")?.addEventListener("click", event => {
      const visible = event.currentTarget.getAttribute("aria-pressed") !== "true";
      event.currentTarget.setAttribute("aria-pressed", String(visible));
      event.currentTarget.textContent = visible ? "顯示原圖" : "疊加中文";
      overlay?.classList.toggle("hidden", !visible);
    });
  } catch (error) {
    detail.textContent = error.message || "載入辨識圖片失敗。";
  }
}

async function deleteImageAnalysis(analysisId) {
  const analysis = state.imageAnalyses.find(item => item.id === analysisId);
  const title = analysis?.title || analysis?.productName || "這筆辨識紀錄";
  if (!confirm(`確定刪除「${title}」與圖片嗎？`)) return;
  try {
    const batch = writeBatch(database);
    batch.delete(tripDocument("imageAnalyses", analysisId, "assets", "original"));
    batch.delete(tripDocument("imageAnalyses", analysisId));
    await batch.commit();
    imageAnalysisThumbnailCache.delete(analysisId);
  } catch (error) {
    showDataError(error);
  }
}

function setImageAnalysisStatus(message, tone = "text-slate-600") {
  state.imageAnalysisStatus = message;
  state.imageAnalysisStatusTone = tone;
  state.imageAnalysisStatusMode = state.imageAnalysisMode;
  const status = document.getElementById("travel-image-status");
  if (!status) return;
  status.textContent = message;
  status.className = `${message ? "" : "hidden"} mt-2 text-sm leading-5 ${tone}`;
}

async function analyzeAndSaveImage() {
  if (!pendingTravelImageFile || imageAnalysisBusy || !currentUser) return;
  const file = pendingTravelImageFile;
  const analysisMode = state.imageAnalysisMode;
  imageAnalysisBusy = true;
  state.imageAnalysisBusyMode = analysisMode;
  state.imageAnalysisStatusMode = analysisMode;
  state.imageAnalysisStatus = analysisMode === "menu" ? "正在翻譯菜單…" : "正在辨識商品並搜尋查證資料…";
  renderImageAnalysisPage();
  try {
    const image = await compressTravelImage(file);
    const analysis = await requestTravelImageAnalysis({
      user: currentUser,
      imageDataUrl: image.dataUrl,
      analysisType: analysisMode
    });
    const analysisRef = doc(tripCollection("imageAnalyses"));
    const createdAt = Date.now();
    const record = {
      ...analysis,
      identificationMethod: "image",
      title: analysis.type === "menu" ? analysis.title || file.name : analysis.productName || analysis.title || file.name,
      originalFileName: file.name.slice(0, 180),
      imageType: "image/jpeg",
      imageBytes: image.size,
      createdAt
    };
    const batch = writeBatch(database);
    batch.set(analysisRef, record);
    batch.set(doc(analysisRef, "assets", "original"), {
      dataUrl: image.dataUrl,
      imageType: "image/jpeg",
      createdAt
    });
    await batch.commit();
    pendingTravelImageFile = null;
    state.imageAnalysisStatus = analysisMode === "menu"
      ? "菜單翻譯已儲存，可展開查看或刪除。"
      : "商品辨識與搜尋結果已儲存，可展開查看或刪除。";
    state.imageAnalysisStatusMode = analysisMode;
    state.imageAnalysisStatusTone = "text-emerald-700";
  } catch (error) {
    state.imageAnalysisStatus = error.message || "辨識或儲存失敗，請重試。";
    state.imageAnalysisStatusTone = "text-rose-700";
  } finally {
    imageAnalysisBusy = false;
    state.imageAnalysisBusyMode = "";
    if (!pendingTravelImageFile) {
      URL.revokeObjectURL(pendingTravelImagePreviewUrl);
      pendingTravelImagePreviewUrl = "";
    }
    renderImageAnalysisPage();
  }
}

async function analyzeAndSaveBarcode() {
  if (!pendingProductBarcode || imageAnalysisBusy || !currentUser) return;
  const barcode = pendingProductBarcode;
  imageAnalysisBusy = true;
  state.imageAnalysisBusyMode = "product";
  state.imageAnalysisStatusMode = "product";
  state.imageAnalysisStatus = `正在搜尋條碼 ${barcode}…`;
  renderImageAnalysisPage();
  try {
    const analysis = await requestProductBarcodeAnalysis({ user: currentUser, barcode });
    const analysisRef = doc(tripCollection("imageAnalyses"));
    const createdAt = Date.now();
    await setDoc(analysisRef, {
      ...analysis,
      title: analysis.productName || analysis.title || barcode,
      identificationMethod: "barcode",
      barcode,
      hasImage: false,
      imageType: "",
      imageBytes: 0,
      imageSource: "",
      createdAt
    });
    pendingProductBarcode = "";
    state.imageAnalysisStatus = "條碼商品資訊已儲存，可展開查看或刪除。";
    state.imageAnalysisStatusTone = "text-emerald-700";
  } catch (error) {
    state.imageAnalysisStatus = error.message || "條碼商品搜尋失敗，請重試。";
    state.imageAnalysisStatusTone = "text-rose-700";
  } finally {
    imageAnalysisBusy = false;
    state.imageAnalysisBusyMode = "";
    renderImageAnalysisPage();
  }
}

function stopBarcodeScanner() {
  barcodeScannerControls?.stop();
  barcodeScannerControls = null;
  const video = document.getElementById("barcode-scanner-video");
  if (video?.srcObject) {
    video.srcObject.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
}

async function openBarcodeScanner() {
  pendingTravelImageFile = null;
  URL.revokeObjectURL(pendingTravelImagePreviewUrl);
  pendingTravelImagePreviewUrl = "";
  const dialog = document.getElementById("barcode-scanner-dialog");
  const video = document.getElementById("barcode-scanner-video");
  const status = document.getElementById("barcode-scanner-status");
  status.textContent = "正在開啟相機…";
  dialog.showModal();
  try {
    const { BrowserMultiFormatOneDReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatOneDReader(undefined, { delayBetweenScanAttempts: 180 });
    barcodeScannerControls = await reader.decodeFromConstraints({
      audio: false,
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
    }, video, result => {
      if (!result) return;
      const barcode = result.getText().replace(/\D/g, "");
      if (!/^\d+$/.test(barcode) || ![8, 12, 13, 14].includes(barcode.length)) {
        status.textContent = "這不是可用的 JAN／EAN 商品條碼，請重新對準。";
        return;
      }
      pendingProductBarcode = barcode;
      stopBarcodeScanner();
      dialog.close();
      state.imageAnalysisStatus = `已讀取條碼 ${barcode}，可以開始搜尋。`;
      state.imageAnalysisStatusTone = "text-emerald-700";
      state.imageAnalysisStatusMode = "product";
      renderImageAnalysisPage();
    });
    if (!dialog.open) {
      stopBarcodeScanner();
      return;
    }
    status.textContent = "將商品條碼置於框線內。";
  } catch (error) {
    console.error("Barcode camera unavailable:", error);
    status.textContent = "無法使用相機，請確認已允許相機權限並使用 HTTPS。";
  }
}

function renderImageAnalysisPage() {
  const root = document.getElementById("tab-image-analysis");
  if (!root) return;
  root.innerHTML = renderImageAnalysisPanel();
  renderIcons(root);
  setupImageAnalysisPanel();
}

function showImageAnalysisThumbnail(container, dataUrl) {
  if (!container || !dataUrl) return;
  let image = container.querySelector("img");
  if (!image) {
    image = document.createElement("img");
    image.alt = container.dataset.thumbnailAlt || "商品縮圖";
    image.className = "absolute inset-0 h-full w-full object-cover";
    image.loading = "lazy";
    container.append(image);
  }
  image.src = dataUrl;
  container.querySelector("[data-thumbnail-placeholder]")?.classList.add("hidden");
}

function loadProductAnalysisThumbnails() {
  document.querySelectorAll("[data-image-analysis-thumbnail]").forEach(container => {
    const analysisId = container.dataset.imageAnalysisThumbnail;
    const cachedDataUrl = imageAnalysisThumbnailCache.get(analysisId);
    if (cachedDataUrl) {
      showImageAnalysisThumbnail(container, cachedDataUrl);
      return;
    }
    if (loadingImageAnalysisThumbnails.has(analysisId)) return;
    loadingImageAnalysisThumbnails.add(analysisId);
    getDoc(tripDocument("imageAnalyses", analysisId, "assets", "original"))
      .then(asset => {
        const dataUrl = asset.data()?.dataUrl;
        if (!asset.exists() || typeof dataUrl !== "string") return;
        imageAnalysisThumbnailCache.set(analysisId, dataUrl);
        document.querySelectorAll("[data-image-analysis-thumbnail]").forEach(currentContainer => {
          if (currentContainer.dataset.imageAnalysisThumbnail === analysisId) showImageAnalysisThumbnail(currentContainer, dataUrl);
        });
      })
      .catch(error => console.warn("Unable to load product thumbnail:", error))
      .finally(() => loadingImageAnalysisThumbnails.delete(analysisId));
  });
}

function loadImageAnalyses() {
  imageAnalysisRequested = true;
  if (!currentUser || imageAnalysisSubscribed) return;
  imageAnalysisSubscribed = true;
  onSnapshot(query(tripCollection("imageAnalyses"), orderBy("createdAt", "desc"), limit(30)), snapshot => {
    state.imageAnalyses = snapshot.docs.map(entry => ({ id: entry.id, ...entry.data() }));
    renderImageAnalysisPage();
  }, showDataError);
}

function setupImageAnalysisPanel() {
  const imageName = document.getElementById("travel-image-name");
  const chooseButton = document.getElementById("travel-image-choose");
  imageName.textContent = pendingTravelImageFile?.name || "支援 JPEG、PNG、WebP";
  chooseButton.title = pendingTravelImageFile ? "更換圖片" : "選擇圖片";
  chooseButton.setAttribute("aria-label", chooseButton.title);
  chooseButton.innerHTML = `<i data-lucide="${pendingTravelImageFile ? "refresh-cw" : "camera"}" class="mr-1 h-4 w-4"></i>${chooseButton.title}`;
  if (state.imageAnalysisMode === "product") {
    const choiceGroup = document.createElement("div");
    choiceGroup.className = "grid grid-cols-2 gap-2";
    chooseButton.before(choiceGroup);
    choiceGroup.append(chooseButton);
    chooseButton.classList.remove("w-full");
    if (pendingProductBarcode) {
      chooseButton.classList.remove("image-analysis-primary");
      chooseButton.classList.add("btn-outline");
    }
    const barcodeButton = document.createElement("button");
    barcodeButton.type = "button";
    barcodeButton.id = "product-barcode-scan";
    barcodeButton.className = `${pendingProductBarcode ? "image-analysis-primary" : "btn-outline"} btn-flex min-h-11 justify-center rounded-md`;
    barcodeButton.innerHTML = `<i data-lucide="scan-line" class="mr-1 h-4 w-4"></i>${pendingProductBarcode ? "重新掃描" : "條碼辨識"}`;
    barcodeButton.addEventListener("click", () => void openBarcodeScanner());
    choiceGroup.append(barcodeButton);
    if (pendingProductBarcode) {
      const barcodeResult = document.createElement("div");
      barcodeResult.className = "mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3";
      barcodeResult.innerHTML = `<div class="flex items-center justify-between gap-3"><div><p class="text-xs font-medium text-emerald-800">已掃描商品條碼</p><p class="mt-0.5 font-mono text-base font-semibold tracking-normal text-emerald-950">${escapeHtml(pendingProductBarcode)}</p></div><i data-lucide="barcode" class="h-6 w-6 shrink-0 text-emerald-700"></i></div><button id="product-barcode-analyze" type="button" class="image-analysis-primary btn-flex mt-3 min-h-11 w-full justify-center rounded-md" ${imageAnalysisBusy ? "disabled" : ""}>${imageAnalysisBusy ? "正在搜尋條碼商品…" : "搜尋條碼商品"}</button>`;
      choiceGroup.after(barcodeResult);
      document.getElementById("travel-image-name").classList.add("hidden");
      document.getElementById("product-barcode-analyze").addEventListener("click", () => void analyzeAndSaveBarcode());
      document.getElementById("travel-image-status").previousElementSibling.textContent = "條碼只用於搜尋商品資料；搜尋結果會儲存在 Firebase，請核對內容。";
    }
  }
  document.querySelectorAll("[data-image-analysis-mode]").forEach(button => button.addEventListener("click", () => {
    const mode = button.dataset.imageAnalysisMode;
    if (mode === state.imageAnalysisMode) return;
    state.imageAnalysisMode = mode;
    renderImageAnalysisPage();
  }));
  const modeButtons = [...document.querySelectorAll('[role="tab"][data-image-analysis-mode]')];
  modeButtons.forEach((button, index) => button.addEventListener("keydown", event => {
    let nextIndex = index;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % modeButtons.length;
    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + modeButtons.length) % modeButtons.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = modeButtons.length - 1;
    else return;
    event.preventDefault();
    const nextMode = modeButtons[nextIndex].dataset.imageAnalysisMode;
    state.imageAnalysisMode = nextMode;
    renderImageAnalysisPage();
    document.querySelector(`[data-image-analysis-mode="${nextMode}"]`)?.focus();
  }));
  const input = document.getElementById("travel-image-input");
  document.getElementById("travel-image-choose").addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    URL.revokeObjectURL(pendingTravelImagePreviewUrl);
    pendingTravelImageFile = input.files?.[0] || null;
    if (pendingTravelImageFile) pendingProductBarcode = "";
    pendingTravelImagePreviewUrl = pendingTravelImageFile ? URL.createObjectURL(pendingTravelImageFile) : "";
    state.imageAnalysisStatus = pendingTravelImageFile ? "圖片已選取，辨識前會先壓縮。" : "";
    state.imageAnalysisStatusTone = "text-slate-600";
    state.imageAnalysisStatusMode = state.imageAnalysisMode;
    renderImageAnalysisPage();
  });
  document.getElementById("travel-image-analyze")?.addEventListener("click", () => void analyzeAndSaveImage());
  document.querySelectorAll("[data-open-image-analysis]").forEach(button => button.addEventListener("click", () => {
    void openImageAnalysisDetail(button.dataset.openImageAnalysis, button);
  }));
  document.querySelectorAll("[data-delete-image-analysis]").forEach(button => button.addEventListener("click", () => {
    void deleteImageAnalysis(button.dataset.deleteImageAnalysis);
  }));
  renderIcons(document.getElementById("tab-image-analysis"));
  loadProductAnalysisThumbnails();
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
  document.getElementById("tab-places").innerHTML = `<div class="px-4 py-4"><div class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div class="flex items-start justify-between gap-3"><div><p class="text-xs text-slate-500">待去地點</p><p class="mt-0.5 text-2xl font-bold text-slate-900">${state.places.length} <span class="text-sm font-normal text-slate-400">個</span></p></div>${viewToggle}</div><div class="mt-3 flex flex-wrap gap-2" role="group" aria-label="地點標籤篩選">${filters}</div></div></div><div class="space-y-3 px-4 pb-4"><div id="place-results" class="space-y-3"></div><section id="place-map-section" class="hidden overflow-hidden rounded-xl border border-slate-200 bg-white"><div id="place-map" class="h-[60vh] min-h-[360px] max-h-[680px] w-full"></div><div id="place-map-status" class="px-3 py-2 text-xs text-slate-500" aria-live="polite"></div><div id="place-map-unlocated" class="hidden border-t border-slate-100 p-3"><h3 id="place-map-unlocated-heading" class="text-sm font-semibold text-slate-700"></h3><div id="place-map-unlocated-list" class="mt-2 divide-y divide-slate-100"></div></div></section><div id="place-map-legend" class="hidden flex-wrap gap-x-4 gap-y-2 px-1" aria-label="地圖標籤圖例">${legend}</div></div><button id="place-add-btn" onclick="openPlaceDialog(false)" class="fixed bottom-20 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 transition-transform active:scale-95" style="right: max(1rem, calc(50% - 18rem + 1rem))" aria-label="新增地點"><i data-lucide="plus" class="h-6 w-6"></i></button>`;
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
  renderIcons(document.getElementById("tab-places"));
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
            ${placeIntroductionMarkup(place.aiIntroduction) || `<p class="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">尚無繁體中文 AI 景點介紹；編輯並儲存可重新查詢。</p>`}
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
  renderIcons(document.getElementById("tab-places"));
}

function placeGoogleMapsUrl(place) {
  try {
    const url = new URL(place.mapsUrl);
    if (url.protocol === "https:" && ["maps.app.goo.gl", "goo.gl", "www.google.com", "google.com", "maps.google.com"].includes(url.hostname.toLowerCase())) {
      return url.href;
    }
  } catch {
  }
  const query = encodeURIComponent([place.name, place.address].filter(Boolean).join(" "));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function renderPlaceMap(places) {
  const renderGeneration = ++placeMapRenderGeneration;
  const mapStatus = document.getElementById("place-map-status");
  const unlocatedPanel = document.getElementById("place-map-unlocated");
  const unlocatedHeading = document.getElementById("place-map-unlocated-heading");
  const unlocatedList = document.getElementById("place-map-unlocated-list");
  if (!googleMapsApiKey?.trim()) {
    mapStatus.textContent = "請在 public/firebase-config.js 設定 googleMapsApiKey，並啟用 Maps JavaScript API。";
    return;
  }
  void updateGooglePlaceMap(places, renderGeneration, mapStatus, unlocatedPanel, unlocatedHeading, unlocatedList);
}

async function loadGoogleMapsLibrary() {
  if (!googleMapsApiKey?.trim()) throw new Error("google_maps_key_missing");
  if (!window.google?.maps?.importLibrary) {
    if (!googleMapsApiPromise) {
      googleMapsApiPromise = new Promise((resolve, reject) => {
        const callbackName = `__sharePayMapsReady${Date.now()}`;
        const timeoutId = setTimeout(() => finish(reject, new Error("google_maps_load_timeout")), 15_000);
        const finish = (callback, value) => {
          clearTimeout(timeoutId);
          delete window[callbackName];
          callback(value);
        };
        window[callbackName] = () => finish(resolve);
        const script = document.createElement("script");
        script.async = true;
        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(googleMapsApiKey)}&loading=async&callback=${callbackName}&language=zh-TW&region=JP&v=weekly`;
        script.onerror = () => finish(reject, new Error("google_maps_load_failed"));
        document.head.append(script);
      }).catch(error => {
        googleMapsApiPromise = null;
        throw error;
      });
    }
    await googleMapsApiPromise;
  }
  const { Map, InfoWindow, OverlayView } = await window.google.maps.importLibrary("maps");
  return { Map, InfoWindow, Marker: window.google.maps.Marker, OverlayView };
}

async function updateGooglePlaceMap(places, renderGeneration, mapStatus, unlocatedPanel, unlocatedHeading, unlocatedList) {
  let googleMaps;
  try {
    googleMaps = await loadGoogleMapsLibrary();
  } catch (error) {
    const errorMessage = String(error?.message || error || "Unknown error");
    const safeErrorMessage = googleMapsApiKey ? errorMessage.replaceAll(googleMapsApiKey, "[redacted]") : errorMessage;
    console.error("Google Maps JavaScript API failed to load", { name: error?.name || "Error", message: safeErrorMessage });
    if (renderGeneration === placeMapRenderGeneration) {
      mapStatus.textContent = `Google Maps 載入失敗：${safeErrorMessage}`;
    }
    return;
  }
  if (renderGeneration !== placeMapRenderGeneration || state.placeView !== "map") return;

  const mapElement = document.getElementById("place-map");
  if (!placeMap) {
    placeMap = new googleMaps.Map(mapElement, {
      center: { lat: 43.77, lng: 142.36 },
      zoom: 8,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true
    });
    placeMapInfoWindow = new googleMaps.InfoWindow();
  } else if (mapElement && mapElement !== placeMap.getDiv()) {
    mapElement.replaceWith(placeMap.getDiv());
  }
  placeMarkers.forEach(({ marker, labelOverlay }) => {
    marker.setMap(null);
    labelOverlay.setMap(null);
  });
  placeMarkers = [];

  const bounds = new google.maps.LatLngBounds();
  const missingCoordinates = [];
  let locatedCount = 0;
  places.forEach(place => {
    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);
    const hasCoordinates = place.latitude != null && place.longitude != null
      && Number.isFinite(latitude) && Number.isFinite(longitude)
      && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      && (latitude !== 0 || longitude !== 0);
    const cacheIsFresh = place.coordinateMethod !== "google_places"
      || Number(place.googleCoordinatesExpireAt) > Date.now();
    if (cacheIsFresh && hasCoordinates) {
      const position = { lat: latitude, lng: longitude };
      const marker = new googleMaps.Marker({
        map: placeMap,
        position,
        title: place.name || "未命名地點",
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#EA580C",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2
        }
      });
      const labelOverlay = new googleMaps.OverlayView();
      labelOverlay.onAdd = function () {
        const label = document.createElement("span");
        const name = document.createElement("span");
        name.textContent = place.name || "未命名地點";
        Object.assign(name.style, { overflow: "hidden", textOverflow: "ellipsis" });
        label.setAttribute("aria-label", place.name || "未命名地點");
        label.append(name);
        Object.assign(label.style, {
          display: "inline-flex",
          position: "absolute",
          transform: "translate(12px, -50%)",
          alignItems: "center",
          gap: "4px",
          padding: "2px 6px",
          border: "1px solid #bfdbfe",
          borderRadius: "4px",
          background: "rgba(255, 255, 255, 0.96)",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.2)",
          color: "#111827",
          fontSize: "12px",
          fontWeight: "600",
          lineHeight: "16px",
          maxWidth: "180px",
          overflow: "hidden",
          pointerEvents: "none",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap"
        });
        this.labelElement = label;
        this.getPanes().overlayMouseTarget.appendChild(label);
      };
      labelOverlay.draw = function () {
        if (!this.labelElement) return;
        const point = this.getProjection().fromLatLngToDivPixel(new google.maps.LatLng(position));
        if (!point) return;
        this.labelElement.style.left = `${point.x}px`;
        this.labelElement.style.top = `${point.y}px`;
      };
      labelOverlay.onRemove = function () {
        this.labelElement?.remove();
        this.labelElement = null;
      };
      labelOverlay.setMap(placeMap);
      marker.addListener("click", () => {
        const content = document.createElement("div");
        const heading = document.createElement("strong");
        heading.textContent = place.name || "未命名地點";
        heading.style.color = "#2563eb";
        const tagLabel = document.createElement("p");
        tagLabel.textContent = placeTags(place).join("、") || "無標籤";
        const link = document.createElement("a");
        link.href = placeGoogleMapsUrl(place);
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Google Maps";
        content.append(heading, tagLabel, link);
        placeMapInfoWindow.setContent(content);
        placeMapInfoWindow.open({ map: placeMap, anchor: marker });
      });
      placeMarkers.push({ marker, labelOverlay });
      bounds.extend(position);
      locatedCount += 1;
    } else {
      missingCoordinates.push(place);
    }
  });
  if (placeMapNeedsFit && locatedCount) {
    if (locatedCount === 1) {
      const position = placeMarkers[0].marker.getPosition();
      placeMap.setCenter(position);
      placeMap.setZoom(13);
    } else {
      placeMap.fitBounds(bounds, { padding: 36, maxZoom: 14 });
    }
    placeMapNeedsFit = false;
  }
  mapStatus.textContent = missingCoordinates.length
    ? `已定位 ${locatedCount} / ${places.length} 筆；未定位地點列於下方。`
    : `已定位 ${locatedCount} / ${places.length} 筆。`;
  unlocatedPanel.classList.toggle("hidden", !missingCoordinates.length);
  unlocatedHeading.textContent = `尚未定位（${missingCoordinates.length}）`;
  unlocatedList.innerHTML = missingCoordinates.map(place => {
    const tags = placeTags(place);
    const tagText = tags.length ? tags.join("、") : "無標籤";
    const mapsUrl = placeGoogleMapsUrl(place);
    const refreshMessage = place.coordinateRefreshError === "daily_limit"
      ? "今日更新額度已用完"
      : place.coordinateRefreshError === "refreshing" ? "定位更新中…" : "座標尚未更新";
    const retryButton = place.coordinateMethod === "google_places"
      ? `<button type="button" data-refresh-place-id="${escapeHtml(place.id)}" class="p-1 text-xs text-slate-500 hover:text-slate-900" ${refreshingGooglePlaces.has(place.id) ? "disabled" : ""}>重試</button>`
      : "";
    return `<article class="flex flex-wrap items-center justify-between gap-2 py-2.5"><div class="min-w-0"><p class="truncate text-sm font-medium text-slate-800">${escapeHtml(place.name || "未命名地點")}</p><p class="mt-0.5 text-xs text-slate-500">${escapeHtml(place.address || tagText)} · ${refreshMessage}</p></div><div class="flex shrink-0 items-center gap-3"><a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs font-medium text-indigo-600"><i data-lucide="external-link" class="h-3.5 w-3.5"></i>Google Maps</a>${retryButton}<button type="button" data-unlocated-place-id="${escapeHtml(place.id)}" class="p-1 text-xs text-slate-500 hover:text-slate-900">編輯</button></div></article>`;
  }).join("");
  unlocatedList.querySelectorAll("[data-refresh-place-id]").forEach(button => {
    button.addEventListener("click", () => {
      const place = state.places.find(entry => entry.id === button.dataset.refreshPlaceId);
      if (place) void refreshGooglePlaceCoordinates(place);
    });
  });
  unlocatedList.querySelectorAll("[data-unlocated-place-id]").forEach(button => {
    button.addEventListener("click", () => editPlace(button.dataset.unlocatedPlaceId));
  });
  renderIcons(document.getElementById("tab-places"));
}

function placeGoogleLocationRef(placeId) {
  return tripDocument("places", placeId, "googleLocations", "places-api");
}

function updatePlaceState(placeId, changes, shouldRender = true) {
  state.places = state.places.map(place => place.id === placeId ? { ...place, ...changes } : place);
  if (shouldRender) renderPlaceResults();
}

async function refreshGooglePlaceCoordinates(place, user = currentUser, shouldRender = true) {
  if (!user || place.coordinateMethod !== "google_places" || refreshingGooglePlaces.has(place.id)) return;
  refreshingGooglePlaces.add(place.id);
  updatePlaceState(place.id, { coordinateRefreshError: "refreshing" }, shouldRender);
  try {
    const locationRef = placeGoogleLocationRef(place.id);
    const locationSnapshot = await getDoc(locationRef);
    const cachedLocation = locationSnapshot.exists() ? locationSnapshot.data() : null;
    const expiresAt = cachedLocation?.expiresAt?.toDate?.() || cachedLocation?.expiresAt || null;
    const latitude = Number(cachedLocation?.latitude);
    const longitude = Number(cachedLocation?.longitude);
    const cachedCoordinatesAreValid = Number.isFinite(latitude) && Number.isFinite(longitude)
      && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
      && (latitude !== 0 || longitude !== 0);
    if (expiresAt instanceof Date && expiresAt.getTime() > Date.now() && cachedCoordinatesAreValid) {
      updatePlaceState(place.id, {
        latitude,
        longitude,
        googleCoordinatesExpireAt: expiresAt.getTime(),
        coordinateRefreshError: ""
      }, shouldRender);
      return;
    }

    updatePlaceState(place.id, { latitude: null, longitude: null, googleCoordinatesExpireAt: 0 }, shouldRender);
    if (locationSnapshot.exists()) await deleteDoc(locationRef);
    const result = await requestPlaceCoordinates({
      user,
      name: place.name,
      address: place.address,
      mapsUrl: place.mapsUrl,
      placeId: place.placeId
    });
    if (!result.found || result.method !== "google_places" || !result.placeId) {
      updatePlaceState(place.id, { coordinateRefreshError: result.failureReason || "not_verified" }, shouldRender);
      return;
    }

    const newExpiry = new Date(Date.now() + googlePlaceCoordinateLifetimeMs);
    if (result.placeId !== place.placeId) {
      await updateDoc(tripDocument("places", place.id), { placeId: result.placeId });
    }
    await setDoc(locationRef, {
      latitude: result.latitude,
      longitude: result.longitude,
      expiresAt: newExpiry
    });
    updatePlaceState(place.id, {
      placeId: result.placeId,
      latitude: result.latitude,
      longitude: result.longitude,
      googleCoordinatesExpireAt: newExpiry.getTime(),
      coordinateRefreshError: ""
    }, shouldRender);
  } catch (error) {
    updatePlaceState(place.id, { coordinateRefreshError: error.failureReason || "location_service_unavailable" }, shouldRender);
  } finally {
    refreshingGooglePlaces.delete(place.id);
    scheduleGooglePlaceExpiry(user);
  }
}

function scheduleGooglePlaceExpiry(user = currentUser) {
  clearTimeout(placeExpiryTimer);
  const expiries = state.places
    .filter(place => place.coordinateMethod === "google_places" && Number(place.googleCoordinatesExpireAt) > 0)
    .map(place => Number(place.googleCoordinatesExpireAt));
  if (!user || !expiries.length) return;
  const nextExpiry = Math.min(...expiries);
  const delay = nextExpiry - Date.now();
  if (delay > 2_147_000_000) {
    placeExpiryTimer = setTimeout(() => scheduleGooglePlaceExpiry(user), 2_147_000_000);
    return;
  }
  placeExpiryTimer = setTimeout(() => {
    const expiredPlaces = state.places.filter(place => place.coordinateMethod === "google_places"
      && Number(place.googleCoordinatesExpireAt) > 0
      && Number(place.googleCoordinatesExpireAt) <= Date.now());
    expiredPlaces.forEach(place => updatePlaceState(place.id, {
      latitude: null,
      longitude: null,
      googleCoordinatesExpireAt: 0
    }, false));
    if (expiredPlaces.length) renderPlaceResults();
    void Promise.all(expiredPlaces.map(place => refreshGooglePlaceCoordinates(place, user, false)))
      .then(() => {
        if (expiredPlaces.length) renderPlaceResults();
      });
    scheduleGooglePlaceExpiry(user);
  }, Math.max(0, delay));
}

async function refreshExpiredGooglePlaces(user = currentUser) {
  if (!user) return;
  const now = Date.now();
  const placesToRefresh = state.places.filter(place => {
    if (place.coordinateMethod !== "google_places") return false;
    const expiresAt = Number(place.googleCoordinatesExpireAt);
    return !Number.isFinite(expiresAt) || expiresAt <= now;
  });
  if (placesToRefresh.length) {
    const placesToRefreshIds = new Set(placesToRefresh.map(place => place.id));
    state.places = state.places.map(place => placesToRefreshIds.has(place.id)
      ? { ...place, coordinateRefreshError: "refreshing" }
      : place);
    renderPlaceResults();
    await Promise.all(placesToRefresh.map(place => refreshGooglePlaceCoordinates(place, user, false)));
    renderPlaceResults();
  }
  scheduleGooglePlaceExpiry(user);
}

function isPlacesTabActive() {
  const journeyApp = document.getElementById("journey-app");
  const placesButton = document.querySelector('[data-journey-tab="places"]');
  return Boolean(journeyApp && !journeyApp.classList.contains("hidden")
    && placesButton?.getAttribute("aria-current") === "page");
}

function startPlacesListener() {
  if (!isPlacesTabActive()) return;
  placesListenerRequested = true;
  if (!currentUser || placesListenerStarted) return;
  placesListenerStarted = true;
  const root = document.getElementById("tab-places");
  root.innerHTML = `<p class="px-4 py-8 text-center text-sm text-slate-500" role="status">載入景點…</p>`;
  const user = currentUser;
  onSnapshot(tripCollection("places"), snapshot => {
    const previousPlaces = new Map(state.places.map(place => [place.id, place]));
    state.places = snapshot.docs.map(entry => {
      const place = { id: entry.id, ...entry.data() };
      if (place.coordinateMethod !== "google_places") return place;
      const previousPlace = previousPlaces.get(place.id);
      const samePlaceId = previousPlace?.placeId === place.placeId;
      return {
        ...place,
        latitude: null,
        longitude: null,
        googleCoordinatesExpireAt: samePlaceId ? previousPlace.googleCoordinatesExpireAt : 0
      };
    });
    placeMapNeedsFit = true;
    renderPlaces();
    void refreshExpiredGooglePlaces(user);
  }, showDataError);
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

function placeIntroductionMarkup(introduction) {
  if (!introduction || typeof introduction !== "object" || introduction.language !== "zh-Hant") return "";
  const typeLabels = {
    restaurant: "餐廳",
    attraction: "景點",
    park: "公園",
    museum: "博物館",
    shop: "店家",
    hotel: "住宿",
    other: "地點"
  };
  const details = [];
  if (introduction.placeType === "restaurant") {
    if (introduction.cuisineType) details.push(["料理類型", introduction.cuisineType]);
    if (introduction.signatureDishes?.length) details.push(["招牌菜色", introduction.signatureDishes.join("、")]);
  }
  if (introduction.keyFeatures?.length) details.push(["主要特色", introduction.keyFeatures.join("、")]);
  if (introduction.visitReason) details.push(["值得造訪", introduction.visitReason]);
  const recommendationStars = Number.isInteger(introduction.recommendationStars)
    && introduction.recommendationStars >= 1 && introduction.recommendationStars <= 5
    ? introduction.recommendationStars
    : 0;
  if (!details.length && !recommendationStars) return "";
  const recommendation = recommendationStars
    ? `<div class="mb-1.5 flex items-center gap-2"><span class="text-xs font-medium text-slate-700">AI 推薦度</span><span class="inline-flex items-center gap-0.5" role="img" aria-label="${recommendationStars} 顆星">${Array.from({ length: 5 }, (_, index) => `<i data-lucide="star" class="h-3.5 w-3.5 ${index < recommendationStars ? "fill-amber-400 text-amber-500" : "text-slate-300"}"></i>`).join("")}</span><span class="text-xs tabular-nums text-slate-500">${recommendationStars}/5</span></div>${introduction.recommendationReason ? `<p class="mb-1.5 text-xs leading-5 text-slate-600">${escapeHtml(introduction.recommendationReason)}</p>` : ""}`
    : "";
  const rows = details.map(([label, value]) => `<p class="text-xs leading-5 text-slate-600"><span class="font-medium text-slate-800">${escapeHtml(label)}：</span>${escapeHtml(value)}</p>`).join("");
  const sources = coordinateSourcesMarkup(introduction.sources || []);
  return `<section class="mt-3 border-t border-slate-100 pt-3"><h3 class="mb-1 text-xs font-semibold text-slate-700">AI 景點介紹 · ${escapeHtml(typeLabels[introduction.placeType] || "地點")}</h3>${recommendation}<div class="space-y-0.5">${rows}</div>${sources ? `<div class="mt-2 flex flex-wrap gap-x-3 gap-y-1">${sources}</div>` : ""}</section>`;
}

function hasPlaceIntroduction(introduction) {
  if (!introduction || typeof introduction !== "object" || introduction.language !== "zh-Hant") return false;
  if (!Number.isInteger(introduction.recommendationStars)
    || introduction.recommendationStars < 0 || introduction.recommendationStars > 5) return false;
  return Boolean(
    (introduction.placeType === "restaurant" && (introduction.cuisineType?.trim() || introduction.signatureDishes?.length))
    || introduction.keyFeatures?.length
    || introduction.visitReason?.trim()
    || (introduction.recommendationStars >= 1 && introduction.recommendationStars <= 5 && introduction.recommendationReason?.trim())
  );
}

function emptyState(icon, title, detail) {
  return `<div class="flex flex-col items-center py-16 text-slate-400"><i data-lucide="${icon}" class="w-12 h-12 mb-3 stroke-1"></i><p class="text-sm">${title}</p><p class="text-xs mt-1">${detail}</p></div>`;
}

function memberAccent(index) {
  return ["#1c6945", "#b45309", "#2563eb", "#9b3b49", "#7c3aed", "#0f766e", "#be123c", "#4d7c0f", "#0369a1", "#a16207"][index % 10];
}

function renderSettlement(totals) {
  const totalExpense = state.expenses.reduce((sum, expense) => sum + expenseTotal(expense), 0);
  const transfers = settlementTransfers(totals.balance, members);
  const gridTemplate = `minmax(5.5rem, 1.2fr) repeat(${members.length}, minmax(5rem, 1fr)) minmax(5rem, 1fr)`;
  const memberHeaders = members.map((member, index) => `<span class="text-right font-semibold" style="color:${memberAccent(index)}">${escapeHtml(memberName(member.id))}</span>`).join("");
  const categoryRows = categories.map(category => {
    const memberValues = members.map(member => `<span class="text-right tabular-nums text-slate-600">${formatted(totals.categoryTotals[category][member.id])}</span>`).join("");
    const categoryTotal = members.reduce((sum, member) => sum + totals.categoryTotals[category][member.id], 0);
    return `<div class="grid gap-2 border-b border-slate-100 py-2.5 text-sm" style="grid-template-columns:${gridTemplate}"><span class="font-medium text-slate-700">${escapeHtml(category)}</span>${memberValues}<span class="text-right font-semibold tabular-nums text-slate-900">${formatted(categoryTotal)}</span></div>`;
  }).join("");
  const owedTotals = members.map(member => `<span class="text-right tabular-nums" style="color:${memberAccent(members.indexOf(member))}">${formatted(totals.owed[member.id])}</span>`).join("");
  const paidRows = members.map((member, index) => {
    const balance = totals.balance[member.id];
    return `<div class="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-b border-slate-100 py-2.5 text-sm last:border-0"><span class="min-w-0 font-semibold" style="color:${memberAccent(index)}">${memberIdentity(member.id, "h-8 w-8 text-xs")}</span><span class="text-right text-slate-500"><small class="block text-[10px]">實付</small>${formatted(totals.paid[member.id])}</span><span class="text-right text-slate-500"><small class="block text-[10px]">應付</small>${formatted(totals.owed[member.id])}</span><span class="min-w-20 text-right font-bold ${balance >= 0 ? "text-emerald-700" : "text-rose-700"}"><small class="block text-[10px] font-medium">淨額</small>${balance >= 0 ? "+" : "−"}${formatted(Math.abs(balance))}</span></div>`;
  }).join("");
  const transferRows = transfers.length
    ? transfers.map(transfer => `<li class="flex items-center justify-between gap-3 border-b border-slate-100 py-3 last:border-0"><span class="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">${memberIdentity(transfer.fromId, "h-7 w-7 text-[10px]")}<i data-lucide="arrow-right" class="h-4 w-4 shrink-0 text-slate-400"></i>${memberIdentity(transfer.toId, "h-7 w-7 text-[10px]")}</span><span class="shrink-0 font-bold tabular-nums text-slate-900">${formatted(transfer.amount)} 元</span></li>`).join("")
    : '<li class="py-5 text-center text-sm font-medium text-emerald-700">目前已結清</li>';

  document.getElementById("tab-settlement").innerHTML = `<div class="space-y-4 p-4"><section class="overflow-hidden rounded-2xl bg-white shadow-sm"><div class="flex items-center justify-between bg-emerald-700 px-4 py-3 text-white"><div><h3 class="text-sm font-semibold">旅程花費</h3><p class="mt-0.5 text-[11px] text-emerald-50">依各筆權重計算的負擔金額</p></div><div class="text-right"><span class="text-xl font-bold">${formatted(totalExpense)}</span><span class="ml-1 text-xs text-emerald-50">元</span></div></div><div class="overflow-x-auto p-4"><div class="min-w-max"><div class="grid gap-2 border-b border-slate-200 pb-2 text-xs font-medium text-slate-400" style="grid-template-columns:${gridTemplate}"><span>類別</span>${memberHeaders}<span class="text-right">合計</span></div>${categoryRows}<div class="grid gap-2 pt-3 text-sm font-bold" style="grid-template-columns:${gridTemplate}"><span>合計</span>${owedTotals}<span class="text-right tabular-nums">${formatted(totalExpense)}</span></div></div></div></section><section class="overflow-hidden rounded-2xl bg-white shadow-sm"><div class="bg-slate-800 px-4 py-2.5 text-white"><h3 class="text-sm font-semibold">每人成本</h3></div><div class="px-4">${paidRows}</div></section><section class="overflow-hidden rounded-2xl bg-white shadow-sm"><div class="flex items-center justify-between bg-emerald-700 px-4 py-2.5 text-white"><h3 class="text-sm font-semibold">建議結算</h3><span class="text-xs text-emerald-50">${transfers.length} 筆轉帳</span></div><ul class="px-4">${transferRows}</ul></section></div>`;
  renderIcons(document.getElementById("tab-settlement"));
}

/* Obsolete renderer retained only as migration reference; remove after schema v2 adoption is complete.
function renderLegacySettlement(totals) {
  const rows = categories.map(category => `<div class="grid grid-cols-[1.1fr_1fr_1fr_1.1fr] gap-1 py-2.5 border-b border-slate-50 text-sm"><span class="text-slate-700 font-medium">${category}</span><span class="text-right tabular-nums text-slate-600">${formatted(totals.categoryTotals[category]["高"])}</span><span class="text-right tabular-nums text-slate-600">${formatted(totals.categoryTotals[category].n)}</span><span class="text-right tabular-nums font-semibold text-slate-900">${formatted(totals.categoryTotals[category]["高"] + totals.categoryTotals[category].n)}</span></div>`).join("");
  const totalExpense = state.expenses.reduce((sum, expense) => sum + expenseTotal(expense), 0);
  const highBalance = totals.balance["高"];
  const statement = highBalance === 0 ? "目前已結清" : `${highBalance > 0 ? "n 需支付 高" : "高 需支付 n"} ${formatted(Math.abs(highBalance))} 元`;
  document.getElementById("tab-settlement").innerHTML = `<div class="p-4 space-y-4"><div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"><div class="bg-emerald-600 px-4 py-3 flex items-center justify-between"><div><h3 class="text-sm font-semibold text-white">旅程花費</h3><p class="text-[11px] text-emerald-100 mt-0.5">每人各項支出統計（負擔金額）</p></div><div class="text-right"><span class="text-xl font-bold text-white">${formatted(totalExpense)}</span><span class="text-xs text-emerald-100 ml-1">元</span></div></div><div class="p-4"><div class="grid grid-cols-[1.1fr_1fr_1fr_1.1fr] gap-1 pb-2 border-b border-slate-200 text-xs font-medium text-slate-400"><span>類別</span><span class="text-right text-blue-500">高</span><span class="text-right text-amber-500">n</span><span class="text-right">合計</span></div>${rows}<div class="grid grid-cols-[1.1fr_1fr_1fr_1.1fr] gap-1 pt-3 text-sm font-bold"><span class="text-slate-900">合計</span><span class="text-right tabular-nums text-blue-600">${formatted(totals.owed["高"])}</span><span class="text-right tabular-nums text-amber-600">${formatted(totals.owed.n)}</span><span class="text-right tabular-nums text-slate-900">${formatted(totalExpense)}</span></div></div></div><div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"><div class="bg-blue-600 px-4 py-2.5 flex items-center justify-between"><h3 class="text-sm font-semibold text-white">支出統計</h3><span class="text-xs text-blue-100">總支出 ${formatted(totalExpense)} 元</span></div><div class="p-4 space-y-3"><div class="flex h-2 rounded-full overflow-hidden bg-slate-100"><div class="bg-blue-500" style="width:${totalExpense ? totals.paid["高"] / totalExpense * 100 : 50}%"></div><div class="bg-amber-500" style="width:${totalExpense ? totals.paid.n / totalExpense * 100 : 50}%"></div></div>${people.map(person => `<div class="flex items-center justify-between text-sm"><span class="font-semibold ${person === "高" ? "text-blue-600" : "text-amber-600"}">${person}</span><span class="text-slate-500">代墊 <b class="text-slate-900">${formatted(totals.paid[person])}</b> 元，負擔 <b class="text-slate-900">${formatted(totals.owed[person])}</b> 元</span></div>`).join("")}</div></div><div class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm"><div class="bg-orange-500 px-4 py-2.5"><h3 class="text-sm font-semibold text-white">代付統計</h3></div><div class="p-4 space-y-2.5"><div class="flex justify-between text-sm"><span class="text-slate-600">高 代付結餘</span><span class="font-semibold text-slate-900">${formatted(totals.paymentNet["高"])} 元</span></div><div class="flex justify-between text-sm"><span class="text-slate-600">n 代付結餘</span><span class="font-semibold text-slate-900">${formatted(totals.paymentNet.n)} 元</span></div></div></div><div class="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl overflow-hidden shadow-lg shadow-indigo-600/20"><div class="px-4 py-2.5 bg-white/10"><h3 class="text-sm font-semibold text-white">總結餘</h3></div><div class="p-5 text-center"><p class="text-lg font-bold text-white">${statement}</p></div></div></div>`;
}
*/

function selectButton(buttons, selected, value) {
  buttons.forEach(button => button.classList.toggle("bg-indigo-600", (button.dataset.memberId || button.dataset.value) === selected));
  buttons.forEach(button => button.classList.toggle("text-white", (button.dataset.memberId || button.dataset.value) === selected));
  buttons.forEach(button => button.classList.toggle("bg-slate-100", (button.dataset.memberId || button.dataset.value) !== selected));
  buttons.forEach(button => button.classList.toggle("text-slate-500", (button.dataset.memberId || button.dataset.value) !== selected));
  if (value) state[value] = selected;
}

function clampImageViewerOffset() {
  const dialog = document.getElementById("image-viewer-dialog");
  const image = document.getElementById("image-viewer-image");
  if (!image) return;
  const style = window.getComputedStyle(dialog);
  const availableWidth = dialog.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const availableHeight = dialog.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
  const maxOffsetX = Math.max(0, (image.offsetWidth * imageViewerScale - availableWidth) / 2);
  const maxOffsetY = Math.max(0, (image.offsetHeight * imageViewerScale - availableHeight) / 2);
  imageViewerOffsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, imageViewerOffsetX));
  imageViewerOffsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, imageViewerOffsetY));
}

function renderImageViewerState() {
  const image = document.getElementById("image-viewer-image");
  if (image) {
    image.style.transform = `translate(${imageViewerOffsetX}px, ${imageViewerOffsetY}px) scale(${imageViewerScale})`;
    image.style.cursor = imageViewerScale > 1 ? "grab" : "default";
  }
  document.getElementById("image-viewer-zoom").textContent = `${Math.round(imageViewerScale * 100)}%`;
  document.getElementById("image-viewer-zoom-out").disabled = imageViewerScale <= 1;
  document.getElementById("image-viewer-zoom-in").disabled = imageViewerScale >= 4;
  document.getElementById("image-viewer-zoom-reset").disabled = imageViewerScale === 1;
}

function setImageViewerScale(scale) {
  imageViewerScale = Math.max(1, Math.min(4, Math.round(scale * 100) / 100));
  if (imageViewerScale === 1) {
    imageViewerOffsetX = 0;
    imageViewerOffsetY = 0;
  }
  clampImageViewerOffset();
  renderImageViewerState();
}

function resetImageViewer() {
  imageViewerScale = 1;
  imageViewerOffsetX = 0;
  imageViewerOffsetY = 0;
  imageViewerPointers.clear();
  imageViewerGesture = null;
  renderImageViewerState();
}

function pointerDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function setupImageViewerControls(dialog) {
  dialog.querySelector("[data-image-viewer-zoom-out]").addEventListener("click", () => setImageViewerScale(imageViewerScale - 0.5));
  dialog.querySelector("[data-image-viewer-zoom-in]").addEventListener("click", () => setImageViewerScale(imageViewerScale + 0.5));
  dialog.querySelector("[data-image-viewer-zoom-reset]").addEventListener("click", resetImageViewer);
  dialog.addEventListener("wheel", event => {
    if (!event.target.closest?.("#image-viewer-image")) return;
    event.preventDefault();
    setImageViewerScale(imageViewerScale + (event.deltaY < 0 ? 0.25 : -0.25));
  }, { passive: false });
  dialog.addEventListener("keydown", event => {
    if (event.key === "+" || event.key === "=") setImageViewerScale(imageViewerScale + 0.5);
    else if (event.key === "-") setImageViewerScale(imageViewerScale - 0.5);
    else if (event.key === "0") resetImageViewer();
  });
  dialog.addEventListener("pointerdown", event => {
    const image = event.target.closest?.("#image-viewer-image");
    if (!image) return;
    if (event.pointerType !== "touch" && imageViewerScale <= 1) return;
    event.preventDefault();
    image.setPointerCapture(event.pointerId);
    imageViewerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (imageViewerPointers.size === 1) {
      imageViewerGesture = imageViewerScale > 1
        ? { type: "pan", startX: event.clientX, startY: event.clientY, offsetX: imageViewerOffsetX, offsetY: imageViewerOffsetY }
        : null;
    } else if (imageViewerPointers.size === 2) {
      const [first, second] = [...imageViewerPointers.values()];
      imageViewerGesture = { type: "pinch", distance: pointerDistance(first, second), scale: imageViewerScale };
    }
  });
  dialog.addEventListener("pointermove", event => {
    if (!event.target.closest?.("#image-viewer-image")) return;
    if (!imageViewerPointers.has(event.pointerId)) return;
    imageViewerPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (imageViewerPointers.size >= 2 && imageViewerGesture?.type === "pinch") {
      const [first, second] = [...imageViewerPointers.values()];
      const distance = pointerDistance(first, second);
      if (imageViewerGesture.distance > 0) setImageViewerScale(imageViewerGesture.scale * distance / imageViewerGesture.distance);
    } else if (imageViewerPointers.size === 1 && imageViewerGesture?.type === "pan") {
      imageViewerOffsetX = imageViewerGesture.offsetX + event.clientX - imageViewerGesture.startX;
      imageViewerOffsetY = imageViewerGesture.offsetY + event.clientY - imageViewerGesture.startY;
      clampImageViewerOffset();
      renderImageViewerState();
    }
  });
  const finishPointer = event => {
    if (!imageViewerPointers.has(event.pointerId)) return;
    imageViewerPointers.delete(event.pointerId);
    if (imageViewerPointers.size === 1 && imageViewerScale > 1) {
      const [point] = imageViewerPointers.values();
      imageViewerGesture = { type: "pan", startX: point.x, startY: point.y, offsetX: imageViewerOffsetX, offsetY: imageViewerOffsetY };
    } else if (imageViewerPointers.size >= 2) {
      const [first, second] = [...imageViewerPointers.values()];
      imageViewerGesture = { type: "pinch", distance: pointerDistance(first, second), scale: imageViewerScale };
    } else {
      imageViewerGesture = null;
    }
  };
  dialog.addEventListener("pointerup", finishPointer);
  dialog.addEventListener("pointercancel", finishPointer);
  dialog.addEventListener("close", () => {
    resetImageViewer();
    document.getElementById("image-viewer-stage").replaceChildren();
  });
}

function setupDialogs() {
  const expenseDialog = document.getElementById("expense-dialog");
  const paymentDialog = document.getElementById("payment-dialog");
  const imageViewer = document.getElementById("image-viewer-dialog");
  const barcodeScanner = document.getElementById("barcode-scanner-dialog");
  renderIcons();
  setupImageViewerControls(imageViewer);
  imageViewer.addEventListener("click", event => {
    if (event.target === imageViewer) imageViewer.close();
  });
  barcodeScanner.addEventListener("close", stopBarcodeScanner);
  barcodeScanner.addEventListener("click", event => {
    if (event.target === barcodeScanner) barcodeScanner.close();
  });
  const receiptInput = document.getElementById("expense-receipt-image");
  document.getElementById("expense-receipt-scan").addEventListener("click", () => receiptInput.click());
  receiptInput.addEventListener("change", async () => {
    const file = receiptInput.files?.[0];
    if (file) await scanExpenseReceipt(file);
    receiptInput.value = "";
  });
  [...expenseDialog.querySelectorAll('input[type="number"]')].slice(0, categories.length)
    .forEach(input => input.addEventListener("input", updateExpenseTotalPreview));
  const payerOptions = document.getElementById("expense-payer-options");
  payerOptions.innerHTML = members.map(member => `<button type="button" data-member-id="${escapeHtml(member.id)}" class="flex min-h-12 items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-2 text-sm font-semibold text-slate-600 transition-colors">${memberAvatar(member.id, "h-7 w-7 text-[10px]")}<span class="truncate">${escapeHtml(memberName(member.id))}</span></button>`).join("");
  payerOptions.addEventListener("click", event => {
    const button = event.target.closest("[data-member-id]");
    if (!button) return;
    state.expensePayerId = button.dataset.memberId;
    selectButton([...payerOptions.querySelectorAll("button")], state.expensePayerId);
  });
  document.getElementById("expense-split-options").innerHTML = members.map(member => `
    <label class="split-weight-row">
      ${memberAvatar(member.id, "h-7 w-7 shrink-0 text-[10px]")}
      <span class="split-weight-name">${escapeHtml(memberName(member.id))}</span>
      <input type="number" min="0" step="1" inputmode="numeric" value="1" data-split-member="${escapeHtml(member.id)}" aria-label="${escapeHtml(memberName(member.id))}分攤權重" class="input-field split-weight-input tabular-nums" />
    </label>`).join("");

  const paymentPayer = document.getElementById("payment-payer");
  const paymentDebtor = document.getElementById("payment-debtor");
  const memberOptions = members.map(member => `<option value="${escapeHtml(member.id)}">${escapeHtml(memberName(member.id))}</option>`).join("");
  paymentPayer.innerHTML = memberOptions;
  paymentDebtor.innerHTML = memberOptions;
  const updatePaymentDirection = changedSelect => {
    if (paymentPayer.value === paymentDebtor.value) {
      const replacement = members.find(member => member.id !== changedSelect.value);
      if (changedSelect === paymentPayer) paymentDebtor.value = replacement?.id || paymentDebtor.value;
      else paymentPayer.value = replacement?.id || paymentPayer.value;
    }
    state.paymentPayerId = paymentPayer.value;
    state.paymentDebtorId = paymentDebtor.value;
    document.getElementById("payment-direction-summary").innerHTML = `${memberIdentity(state.paymentDebtorId, "h-6 w-6 text-[10px]")}<span>需支付</span>${memberIdentity(state.paymentPayerId, "h-6 w-6 text-[10px]")}`;
  };
  paymentPayer.addEventListener("change", () => updatePaymentDirection(paymentPayer));
  paymentDebtor.addEventListener("change", () => updatePaymentDirection(paymentDebtor));
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
  renderIcons(document.getElementById("place-dialog"));
}

window.openExpenseDialog = isEdit => {
  const dialog = document.getElementById("expense-dialog");
  const receiptStatus = document.getElementById("expense-receipt-status");
  receiptStatus.classList.add("hidden");
  receiptStatus.textContent = "";
  document.getElementById("expense-receipt-image").value = "";
  dialog.dataset.id = isEdit ? dialog.dataset.id : "";
  if (!isEdit) {
    [...dialog.querySelectorAll('input[type="number"]')].slice(0, categories.length).forEach(input => { input.value = ""; });
    dialog.querySelectorAll("[data-split-member]").forEach(input => { input.value = "1"; });
    dialog.querySelector("textarea").value = "";
    dialog.querySelector("#expense-date").value = new Date().toISOString().slice(0, 10);
    state.expensePayerId = members[0].id;
  }
  updateExpenseTotalPreview();
  document.getElementById("expense-dialog-title").textContent = isEdit ? "編輯支出" : "新增支出";
  document.getElementById("expense-delete-btn").classList.toggle("hidden", !isEdit);
  selectButton([...document.querySelectorAll("#expense-payer-options button")], state.expensePayerId);
  dialog.classList.add("open");
};

async function imageFileToDataUrl(file) {
  if (!/^image\/(jpeg|png|webp)$/i.test(file.type) || file.size > 15_000_000) {
    throw new Error("請選擇 JPEG、PNG 或 WebP 圖片，原始檔需小於 15MB。");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const encode = async (maxDimension, quality) => {
      const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("無法處理這張圖片，請換一張再試。");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", quality));
    };

    let blob = await encode(1600, 0.82);
    if (!blob || blob.size > 1_300_000) blob = await encode(1100, 0.72);
    if (!blob || blob.size > 1_500_000) throw new Error("圖片仍太大，請裁切收據後再試。");
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("無法讀取收據圖片，請再試一次。"));
      reader.readAsDataURL(blob);
    });
  } finally {
    bitmap.close();
  }
}

async function scanExpenseReceipt(file) {
  const button = document.getElementById("expense-receipt-scan");
  const status = document.getElementById("expense-receipt-status");
  const expenseDialog = document.getElementById("expense-dialog");
  const showStatus = (message, tone = "text-slate-600") => {
    status.textContent = message;
    status.className = `text-sm leading-5 ${tone}`;
  };

  button.disabled = true;
  status.classList.remove("hidden");
  showStatus("正在整理收據圖片…");
  try {
    const imageDataUrl = await imageFileToDataUrl(file);
    showStatus("AI 正在辨識，完成後會填入草稿…");
    const draft = await requestReceiptDraft({ user: currentUser, imageDataUrl });
    if (!expenseDialog.classList.contains("open")) return;

    const dateInput = expenseDialog.querySelector("#expense-date");
    if (draft.date) dateInput.value = draft.date;
    const categoryIndex = categories.indexOf(draft.category);
    const itemInputs = [...expenseDialog.querySelectorAll('input[type="number"]')].slice(0, categories.length);
    const twdTotal = draft.currency === "TWD"
      ? draft.total
      : draft.currency === "JPY" && Number.isFinite(draft.twdTotal) ? draft.twdTotal : null;
    if (categoryIndex >= 0 && Number.isFinite(twdTotal) && twdTotal > 0) itemInputs[categoryIndex].value = String(twdTotal);
    updateExpenseTotalPreview();

    const noteInput = expenseDialog.querySelector("textarea");
    const existingNotes = noteInput.value.split(/\r?\n/).map(line => line.trim())
      .filter(line => line && !line.startsWith("[收據辨識]"));
    const receiptDetails = [draft.merchant, draft.note].filter(Boolean);
    if (draft.currency === "JPY" && Number.isFinite(draft.twdTotal) && Number.isFinite(draft.exchangeRate)) {
      receiptDetails.push(`原幣 JPY ${currency.format(draft.total)} × ${draft.exchangeRate} (${draft.exchangeRateDate}, ${draft.exchangeRateSource}) = TWD ${currency.format(draft.twdTotal)}`);
    } else if (draft.total > 0 && draft.currency !== "TWD") {
      receiptDetails.push(`原幣 ${draft.currency} ${currency.format(draft.total)}，請換算為新台幣後手動輸入金額`);
    }
    if (receiptDetails.length) existingNotes.push(`[收據辨識] ${receiptDetails.join("；")}`);
    noteInput.value = existingNotes.join("\n");

    if (draft.currency === "JPY" && Number.isFinite(draft.twdTotal) && draft.exchangeRateDate) {
      showStatus(`已按 ${draft.exchangeRateDate} 日匯率換算填入 TWD ${currency.format(draft.twdTotal)}；原幣與匯率已附在備註，請確認後儲存。`, "text-emerald-700");
    } else if (draft.currency === "JPY" && draft.total > 0) {
      showStatus(`已辨識 JPY ${currency.format(draft.total)}，但目前無法取得匯率；未填入台幣金額，請手動換算。`, "text-amber-700");
    } else if (draft.currency !== "TWD" && draft.total > 0) {
      showStatus(`已辨識原幣 ${draft.currency} ${currency.format(draft.total)}，未自動換匯；請換算成新台幣並確認分類。`, "text-amber-700");
    } else if (draft.total > 0) {
      const confidenceNote = draft.confidence === "low" ? "辨識信心較低，請仔細核對。" : "請核對後再儲存。";
      showStatus(`草稿已填入${draft.merchant ? `「${draft.merchant}」` : "收據資料"}，金額歸入「${draft.category}」。${confidenceNote}`, draft.confidence === "low" ? "text-amber-700" : "text-emerald-700");
    } else {
      showStatus("已填入可辨識欄位，金額不清楚；請檢查收據後手動輸入。", "text-amber-700");
    }
  } catch (error) {
    if (expenseDialog.classList.contains("open")) showStatus(error.message || "收據辨識失敗，請重試。", "text-rose-700");
  } finally {
    button.disabled = false;
  }
}

window.openPaymentDialog = isEdit => {
  const dialog = document.getElementById("payment-dialog");
  dialog.dataset.id = isEdit ? dialog.dataset.id : "";
  if (!isEdit) {
    dialog.querySelector("#payment-date").value = new Date().toISOString().slice(0, 10);
    dialog.querySelector('input[type="text"]').value = "";
    dialog.querySelector('input[type="number"]').value = "";
    state.paymentPayerId = members[0].id;
    state.paymentDebtorId = members[1]?.id || members[0].id;
  }
  const payerSelect = document.getElementById("payment-payer");
  const debtorSelect = document.getElementById("payment-debtor");
  payerSelect.value = state.paymentPayerId;
  debtorSelect.value = state.paymentDebtorId;
  document.getElementById("payment-direction-summary").innerHTML = `${memberIdentity(state.paymentDebtorId, "h-6 w-6 text-[10px]")}<span>需支付</span>${memberIdentity(state.paymentPayerId, "h-6 w-6 text-[10px]")}`;
  document.getElementById("payment-dialog-title").textContent = isEdit ? "編輯代付" : "新增代付";
  document.getElementById("payment-delete-btn").classList.toggle("hidden", !isEdit);
  dialog.classList.add("open");
};

window.openPlaceDialog = isEdit => {
  const dialog = document.getElementById("place-dialog");
  dialog.dataset.id = isEdit ? dialog.dataset.id : "";
  dialog.dataset.coordinatesEdited = "false";
  dialog.querySelector("#place-name-display").classList.toggle("hidden", !isEdit);
  dialog.querySelector("#place-ai-introduction-panel").classList.toggle("hidden", !isEdit);
  dialog.querySelector("#place-coordinates-field").classList.toggle("hidden", !isEdit);
  if (!isEdit) {
    dialog.querySelector("#place-name-value").textContent = "";
    dialog.querySelector("#place-ai-introduction-content").innerHTML = "";
    dialog.querySelector("#place-ai-introduction-empty").classList.add("hidden");
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
  const introductionMarkup = placeIntroductionMarkup(place.aiIntroduction);
  dialog.querySelector("#place-ai-introduction-content").innerHTML = introductionMarkup;
  const introductionEmpty = dialog.querySelector("#place-ai-introduction-empty");
  introductionEmpty.textContent = place.aiIntroduction && !hasPlaceIntroduction(place.aiIntroduction)
    ? "既有介紹不是繁體中文；儲存時會重新查詢並更新。"
    : "尚未生成繁體中文介紹；儲存時會查詢有來源支持的資料，若找不到可靠來源就不會補猜。";
  introductionEmpty.classList.toggle("hidden", Boolean(introductionMarkup));
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
  dialog.querySelectorAll("[data-split-member]").forEach(input => { input.value = String(expense.splitWeights[input.dataset.splitMember] || 0); });
  updateExpenseTotalPreview();
  dialog.querySelector("textarea").value = expense.note || "";
  state.expensePayerId = expense.payerId;
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
  state.paymentPayerId = payment.payerId;
  state.paymentDebtorId = payment.debtorId;
  window.openPaymentDialog(true);
};

async function saveExpense() {
  const dialog = document.getElementById("expense-dialog");
  const inputs = [...dialog.querySelectorAll('input[type="number"]')];
  const items = Object.fromEntries(categories.map((category, index) => [category, amount(inputs[index].value)]));
  if (!expenseTotal({ items })) return alert("請輸入至少一項支出金額。");
  const splitWeights = Object.fromEntries([...dialog.querySelectorAll("[data-split-member]")].map(input => [input.dataset.splitMember, amount(input.value)]));
  if (!Object.values(splitWeights).some(Boolean)) return alert("至少一位成員的分攤權重需大於 0。");
  const entry = { date: dialog.querySelector("#expense-date").value, items, payerId: state.expensePayerId, payer: memberName(state.expensePayerId), splitWeights, note: dialog.querySelector("textarea").value.trim(), updatedAt: Date.now() };
  try {
    await saveEntry("expenses", dialog.dataset.id, entry);
    closeDialog("expense-dialog");
  } catch (error) {
    showDataError(error);
  }
}

async function savePayment() {
  const dialog = document.getElementById("payment-dialog");
  const payerId = document.getElementById("payment-payer").value;
  const debtorId = document.getElementById("payment-debtor").value;
  const entry = { date: dialog.querySelector("#payment-date").value, item: dialog.querySelector('input[type="text"]').value.trim(), amount: amount(dialog.querySelector('input[type="number"]').value), payerId, debtorId, payer: memberName(payerId), debtor: memberName(debtorId), updatedAt: Date.now() };
  if (!entry.item || !entry.amount) return alert("請填寫品項與金額。");
  if (payerId === debtorId) return alert("付款人與應付款人不能是同一人。");
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
  let address = existing?.address || "";
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
  let placeId = existing?.placeId || "";
  let googleCoordinatesExpireAt = Number(existing?.googleCoordinatesExpireAt) || 0;
  let aiIntroduction = existing?.aiIntroduction || null;
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
  let introductionUnavailable = false;
  if (!coordinates || !hasPlaceIntroduction(aiIntroduction)) {
    saveButton.textContent = "解析地圖連結／辨識地點中…";
    try {
      const result = await requestPlaceCoordinates({
        user: currentUser,
        name,
        address,
        mapsUrl,
        placeId: existing?.coordinateMethod === "google_places" ? placeId : ""
      });
      name = result.identifiedPlaceName || result.suggestedName || name;
      const failureMessages = {
        ai_unavailable: "AI 服務暫時無法使用，已儲存地點名稱與連結，座標留空；可稍後編輯重試。",
        daily_limit: "今日地點查詢額度已用完，已儲存地點名稱與連結，座標留空；明天可再試。",
        location_service_unavailable: "地點查詢服務暫時無法使用，已儲存地點名稱與連結，座標留空；可稍後重試。",
        maps_link_unavailable: "無法展開 Google Maps 分享連結；名稱與連結仍會儲存，請確認連結可開啟。",
        not_verified: "Google Places 找不到可確認的地點，已儲存地點名稱與連結，座標留空。",
        outside_hokkaido: "此地點不在北海道範圍內，已儲存地點名稱與連結，座標留空。"
      };
      if (result.failureReason) lookupError = new Error(failureMessages[result.failureReason] || "地點查詢失敗，名稱與連結仍會儲存。");
      aiIntroduction = hasPlaceIntroduction(result.introduction) ? result.introduction : null;
      if (!aiIntroduction) introductionUnavailable = true;
      if (result.sources?.length) coordinateSources = result.sources;
      if (result.found) {
        if (!coordinatesText) coordinates = { latitude: result.latitude, longitude: result.longitude };
        coordinateScope = result.scope;
        if (!coordinatesText) coordinateMethod = result.method || "google_places";
        if (result.method === "google_places") {
          placeId = result.placeId || placeId;
          googleCoordinatesExpireAt = Date.now() + googlePlaceCoordinateLifetimeMs;
        }
        coordinateLabel = result.identifiedPlaceName || result.resolvedName || "";
      }
    } catch (error) {
      lookupError = error;
      name = error.suggestedName || name;
      introductionUnavailable = true;
      console.warn(`Unable to identify and geocode place: ${name}`, error);
    }
  }
  if (!name) {
    saveButton.disabled = false;
    saveButton.textContent = "儲存";
    return alert(lookupError
      ? `Google Maps 查詢失敗：${lookupError.message}。請確認分享連結可開啟後再試。`
      : "分享連結沒有可辨識的地點名稱；請確認連結指向 Google Maps 地點頁，再儲存。");
  }
  const entry = {
    name,
    tags: [...placeDialogTags],
    address,
    mapsUrl,
    note: dialog.querySelector("#place-note").value.trim(),
    coordinateSources,
    coordinateScope,
    coordinateMethod,
    coordinateLabel,
    aiIntroduction,
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  if (placeId) entry.placeId = placeId;
  else if (existing) entry.placeId = deleteField();
  if (coordinateMethod === "google_places") {
    if (existing) {
      entry.latitude = deleteField();
      entry.longitude = deleteField();
    }
  } else {
    entry.latitude = coordinates?.latitude ?? null;
    entry.longitude = coordinates?.longitude ?? null;
  }
  saveButton.textContent = "儲存中…";
  try {
    const placeEntries = tripCollection("places");
    const placeRef = existing ? doc(placeEntries, existing.id) : doc(placeEntries);
    const locationRef = placeGoogleLocationRef(placeRef.id);
    const batch = writeBatch(database);
    if (coordinateMethod === "google_places" && coordinates && placeId) {
      batch.set(locationRef, {
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        expiresAt: new Date(googleCoordinatesExpireAt || Date.now() + googlePlaceCoordinateLifetimeMs)
      });
    } else if (existing?.coordinateMethod === "google_places") {
      batch.delete(locationRef);
    }
    if (existing) batch.update(placeRef, entry);
    else batch.set(placeRef, entry);
    await batch.commit();
    closeDialog("place-dialog");
    alert(introductionUnavailable && coordinates
      ? "地點與座標已儲存，但沒有取得足夠來源支持的 AI 介紹；可稍後編輯再試。"
      : coordinatesText
      ? "已儲存，使用人工輸入的經緯度。"
      : coordinateMethod === "google_maps_link"
        ? `已使用 Google Maps 分享連結定位（${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}）。`
      : coordinateMethod === "google_places"
        ? `已使用 Google Places 定位（${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}）。`
        : coordinates
          ? `已儲存座標（${coordinates.latitude.toFixed(5)}, ${coordinates.longitude.toFixed(5)}）。`
          : aiIntroduction
            ? "地點介紹已儲存，但目前無法定位座標；可稍後編輯重試。"
        : lookupError
          ? lookupError.message
          : "找不到可確認的北海道地點，已儲存但座標留空；可補充地址後再試。");
  } catch (error) {
    showDataError(error);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "儲存";
  }
}

async function saveEntry(type, id, entry) {
  const entries = tripCollection(type);
  if (id) {
    await updateDoc(doc(entries, id), entry);
    return id;
  }
  const result = await addDoc(entries, entry);
  return result.id;
}

async function removeEntry(type, id) {
  if (!id || !confirm("確定要刪除這筆紀錄嗎？")) return;
  try {
    if (type === "places") await deleteDoc(placeGoogleLocationRef(id));
    await deleteDoc(tripDocument(type, id));
    closeDialog({ expenses: "expense-dialog", payments: "payment-dialog", places: "place-dialog" }[type]);
  } catch (error) {
    showDataError(error);
  }
}

setupCurrencyCalculator();

if (!isConfigured) {
  window.location.replace("login.html");
} else if (!activeTripId) {
  window.location.replace("trips.html");
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  database = getFirestore(app);
  document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));
  document.querySelector('[data-tab="settlement"]')?.addEventListener("click", () => {
    if (!state.settlementDirty) return;
    renderSettlement(calculation());
    state.settlementDirty = false;
  });
  onAuthStateChanged(auth, async user => {
    clearTimeout(placeExpiryTimer);
    refreshingGooglePlaces.clear();
    currentUser = null;
    if (!user || !isAllowed(user.email)) {
      if (user) signOut(auth);
      window.location.replace("login.html");
      return;
    }
    currentUser = user;
    try {
      const tripReference = doc(database, "ledgers", appName, "trips", activeTripId);
      const tripSnapshot = await getDoc(tripReference);
      if (!tripSnapshot.exists()) {
        window.location.replace("trips.html");
        return;
      }
      await migrateTripLedger(tripReference, tripSnapshot);
      const tripName = tripSnapshot.data().name || "未命名行程";
      document.getElementById("header-trip-name").textContent = tripName;
      localStorage.setItem("active-trip-name", tripName);
      if (!dialogsReady) {
        setupDialogs();
        dialogsReady = true;
      }
    } catch (error) {
      showDataError(error);
      return;
    }
    if (placesListenerRequested || isPlacesTabActive()) startPlacesListener();
    if (imageAnalysisRequested) loadImageAnalyses();
    onSnapshot(query(tripCollection("expenses"), orderBy("date", "desc")), snapshot => {
      state.expenses = snapshot.docs.map(entry => normalizeExpense({ id: entry.id, ...entry.data() }));
      render({ payments: false });
    }, showDataError);
    onSnapshot(query(tripCollection("payments"), orderBy("date", "desc")), snapshot => {
      state.payments = snapshot.docs.map(entry => normalizePayment({ id: entry.id, ...entry.data() }));
      render({ expenses: false });
    }, showDataError);
  });
  document.querySelector('[data-tab="journey"]')?.addEventListener("click", startPlacesListener);
  document.querySelector('[data-journey-tab="places"]')?.addEventListener("click", startPlacesListener);
  document.querySelector('[data-journey-tab="image-analysis"]')?.addEventListener("click", loadImageAnalyses);
}