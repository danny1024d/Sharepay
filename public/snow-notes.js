import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { allowedEmails, appName, firebaseConfig } from "./firebase-config.js";

const isConfigured = !Object.values(firebaseConfig).some(value => value.includes("YOUR_"));

function isAllowed(email) {
  return Boolean(email) && allowedEmails.some(value => value.toLowerCase() === email.toLowerCase());
}
import {
  extractYouTubeId,
  getYouTubeThumbnailUrl,
  fetchYouTubeOEmbed,
  requestSnowboardAnalysis
} from "./ai-client.js";

// Storage Keys
const LOCAL_STORAGE_KEY = "hokkaido-snow-notes-cache-v1";

// Default Categories
const CATEGORIES = [
  "身體姿勢與平衡",
  "板刃控制與換刃",
  "轉彎與速度控制",
  "壓力控制與刻滑進階"
];

// Sample Initial Notes
const DEFAULT_SAMPLE_NOTES = [
  {
    id: "sample-1",
    createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
    completed: true,
    youtubeUrl: "https://www.youtube.com/watch?v=kYv_8J3Mv3Q",
    videoId: "kYv_8J3Mv3Q",
    videoTitle: "單板基礎站姿與中性重心調整（Neutral Stance）",
    videoThumbnail: "https://img.youtube.com/vi/kYv_8J3Mv3Q/hqdefault.jpg",
    category: "身體姿勢與平衡",
    technique: "基本滑行站姿與重心居中",
    secondaryTags: ["中性站姿", "膝蓋微蹲", "視線水平"],
    coreConcept: "滑雪的核心在於重心始終維持在雪板有效邊刃正上方。上半身放鬆對齊雪板軸心，避免過早傾斜或骨盆後坐。",
    actionSteps: [
      {
        stepName: "靜態中性站姿設定",
        movement: "雙腳微屈，脛骨微靠雪鞋鞋舌，胸椎自然挺直，骨盆微收不後坐，雙手自然環抱兩側。",
        bodyAndBoardChange: "雪板平貼雪面無立刃，重心平均落於兩腳足弓中心，板頭板尾壓力比 50:50。",
        purpose: "建立不耗力的關節緩衝支撐，使雪板在全平狀態下能維持穩定直線滑行。",
        mistakesAndCorrections: "彎腰低頭且屁股往後坐；修正為直立胸腔，透過腳踝微屈輕壓鞋舌。"
      },
      {
        stepName: "垂直微彈跳重心檢核",
        movement: "在平地或極緩坡進行 5-10 次小幅度垂直蹲起彈跳，確認落地時由踝、膝、髖關節協同吸收震動。",
        bodyAndBoardChange: "垂直方向微動，雪板仍保持平貼，重心不左右偏移。",
        purpose: "確認全身關節處於放鬆有彈性的動態平衡狀態，非僵硬鎖死。",
        mistakesAndCorrections: "落地時後腳單側受力；修正為雙腳同時著地，眼睛看向水平前方。"
      },
      {
        stepName: "動態緩坡直滑降滑行",
        movement: "放開邊刃讓板子沿滾落線自然加速，維持中性站姿滑行 15 秒，不主動轉向或左右換刃。",
        bodyAndBoardChange: "板底全平高速滑行，視線看遠，感受兩腳受雪面反饋力量一致。",
        purpose: "建立對速度與板底滑動的穩定感，避免速度微增時驚慌後仰。",
        mistakesAndCorrections: "因恐懼導致身體轉向面對山下；修正為雙肩保持與雪板長軸平行。"
      }
    ],
    cautions: [
      "不可養成彎腰後坐（蹲馬桶式）的壞習慣，應是踝關節與膝關節協同微曲。",
      "雙肩自然平行於雪板行進軸線，避免盲目旋轉上半身。",
      "視線永遠看向行進遠方，不要盯著板頭。"
    ],
    commonMistakes: [
      {
        mistake: "過度彎腰低頭，骨盆往後掉，重心落在後腳腳後跟",
        correction: "挺直胸腔骨盆微收，脛骨輕壓鞋舌，讓重心均勻分布在雙腳足弓中間。"
      },
      {
        mistake: "手臂隨意擺動拉扯重心",
        correction: "雙臂自然微屈放於身體兩側視線可及範圍，像環抱大樹般保持穩定。"
      }
    ],
    practiceDrills: [
      { step: "步驟一", detail: "在平地練習中性站姿垂直上下微彈跳 10 次，感受脛骨壓鞋舌的感覺。" },
      { step: "步驟二", detail: "綠線平緩坡直滑降 10 公尺，滑行中保持放鬆站姿，感受板底全平滑行。" }
    ],
    completionCriteria: "在綠線緩坡直滑降及斜滑降時，能在無多餘上半身晃動下平穩維持 15 秒以上。",
    analysisBasis: "依據影片逐字稿中教練示範之靜態站姿與動態滑降要點整理。",
    formattedText: `- 主要分類：身體姿勢與平衡\n- 技術項目：基本滑行站姿與重心居中\n- 次要標籤：中性站姿、膝蓋微蹲、視線水平\n- 影片核心觀念：滑雪的核心在於重心始終維持在雪板有效邊刃正上方。上半身放鬆對齊雪板軸心，避免過早傾斜或骨盆後坐。\n- 動作分解步驟：\n  1. 【靜態中性站姿設定】\n     - 具體動作：雙腳微屈，脛骨微靠雪鞋鞋舌，胸椎挺直，雙手環抱。\n     - 身體與雪板的變化：板面全平無立刃，重心平均落於兩腳足弓中心。\n     - 動作目的：建立不耗力的關節緩衝支撐，平穩滑行。\n     - 常見錯誤與修正：彎腰低頭屁股後坐；修正為直立胸腔輕壓鞋舌。\n  2. 【動態緩坡直滑降】\n     - 具體動作：放開邊刃讓板子沿滾落線加速，維持站姿滑行 15 秒。\n     - 身體與雪板的變化：板底全平高速滑行，視線看遠。\n     - 動作目的：建立對速度與板底滑動的穩定感。\n     - 常見錯誤與修正：恐懼後仰；修正為雙肩平行雪板長軸。\n- 練習注意事項（最多 3 點）：1. 不可蹲馬桶式後坐 2. 雙肩自然平行板身 3. 視線看向前進遠方\n- 常見錯誤與修正：彎腰後坐修正為脛骨輕壓鞋舌、重心均勻分布於兩腳足弓。\n- 建議練習方式：平地站姿微彈跳、綠線直滑降感受中性平衡。\n- 完成標準：在綠線緩坡直滑降及斜滑降時平穩維持 15 秒以上。\n- 分析依據：依據影片教學內容分析。`,
    rawTranscript: "示範中性站姿：雙腳微曲，脛骨輕微靠在雪鞋前面，肩膀放鬆，視線往前看，感受板底與雪面的接觸..."
  },
  {
    id: "sample-2",
    createdAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    completed: false,
    youtubeUrl: "https://www.youtube.com/watch?v=9g0H2gLwL6Y",
    videoId: "9g0H2gLwL6Y",
    videoTitle: "後刃換前刃（Heelside to Toeside）視線與重心引導技巧",
    videoThumbnail: "https://img.youtube.com/vi/9g0H2gLwL6Y/hqdefault.jpg",
    category: "板刃控制與換刃",
    technique: "後刃轉前刃的重心引導與滾邊過渡",
    secondaryTags: ["Toe-side 換刃", "視線引導", "落葉飄進階"],
    coreConcept: "換前刃不是硬用後腳踢板或猛轉肩膀，而是在板頭指向滾落線的瞬間，將重心藉由視線與膝蓋順暢地從後刃滾至前刃。",
    actionSteps: [
      {
        stepName: "後刃穩定橫越與降速",
        movement: "在後刃橫越坡道滑行中微屈雙膝，重心在前腳 55-60%，視線穩定看向斜前方。",
        bodyAndBoardChange: "雪板維持後刃咬雪滑行，速度受控在舒適範圍。",
        purpose: "為換刃累積足夠的穩定速度與平衡，避免失速或失控勉強換刃。",
        mistakesAndCorrections: "重心全部留在後腳；修正為肩膀平行雪板，前膝微收。"
      },
      {
        stepName: "板底放平與過渡滾落線",
        movement: "逐漸放鬆腳踝將後刃放平，視線轉向山下並讓前腳膝蓋順著板頭方向自然前推。",
        bodyAndBoardChange: "雪板邊刃完全放平，板頭受重力帶動順暢旋轉指向滾落線（Fall line）。",
        purpose: "完成邊刃釋放，讓雪板零阻力順暢通過滾落線。",
        mistakesAndCorrections: "害怕面對山下而過早把身體往後仰；修正為給予雪板 0.5 秒板底全平滑向滾落線的時間。"
      },
      {
        stepName: "前刃切入與視線出彎",
        movement: "板頭通過滾落線瞬間，雙膝向前下方微推，小腿脛骨輕壓前鞋舌，腳尖與腳掌球部溫和下壓前刃。",
        bodyAndBoardChange: "前刃溫和切入雪面，雪板從滾落線轉向橫越坡道，形成圓弧 Toe-side 彎道。",
        purpose: "安全順暢建立前刃支撐，完成換刃弧線。",
        mistakesAndCorrections: "急躁用後腳向外猛踢板尾甩尾；修正為由前膝推進引導，讓前刃自然刻入雪面帶動轉向。"
      }
    ],
    cautions: [
      "換刃關鍵期千萬不可提早後仰或急著煞車，要給板子 0.5 秒通過滾落線的時間。",
      "先在綠線將換刃半徑放大（大 S-turn），切忌急躁追求小半徑快速轉彎。",
      "換前刃時前膝往前推，用腳尖和小腿主動壓向雪面。"
    ],
    commonMistakes: [
      {
        mistake: "害怕面對山下而過早把重心往後腳退，導致前腳失去轉向抓地力卡刃",
        correction: "入彎時保持前腳 60% 重心，視線堅定看向彎道出彎點，讓雪板自然轉動。"
      },
      {
        mistake: "上半身猛力甩動帶動下半身",
        correction: "肩膀與骨盆保持平行，透過腳踝與膝蓋微屈做刃的角度轉換。"
      }
    ],
    practiceDrills: [
      { step: "步驟一", detail: "綠線練習單邊落葉飄，在滑行停止前輕輕放平雪板，體會板子順坡轉向。" },
      { step: "步驟二", detail: "練習 C-turn：後刃出發，放平板底滑向滾落線，溫和切換至前刃煞停。" },
      { step: "步驟三", detail: "將 C-turn 串連為連續寬闊的 S-turn。" }
    ],
    completionCriteria: "在綠線至紅線交界坡，能連續完成 5 次平穩順暢的後刃切換前刃，沒有卡刃驚慌感。",
    analysisBasis: "依據教練逐字稿之換刃力學示範解析。",
    formattedText: `- 主要分類：板刃控制與換刃\n- 技術項目：後刃轉前刃的重心引導與滾邊過渡\n- 次要標籤：Toe-side 換刃、視線引導、落葉飄進階\n- 影片核心觀念：換前刃不是硬用後腳踢板，而是在板頭通過滾落線瞬間，透過膝蓋微蹲推進將邊刃順利翻轉。\n- 動作分解步驟：\n  1. 【後刃穩定橫越與降速】\n     - 具體動作：微屈雙膝，重心前腳 60%，視線看斜前方。\n     - 身體與雪板的變化：雪板維持後刃咬雪滑行，速度受控。\n     - 動作目的：累積足夠穩定速度與平衡。\n     - 常見錯誤與修正：重心退到後腳；修正為前膝微收。\n  2. 【板底放平與過渡滾落線】\n     - 具體動作：放平腳踝，視線轉山下，前膝順板頭前推。\n     - 身體與雪板的變化：邊刃完全放平，板頭順重力轉向滾落線。\n     - 動作目的：邊刃釋放，零阻力通過滾落線。\n     - 常見錯誤與修正：害怕山下過早後仰；修正為給板子 0.5 秒全平時間。\n  3. 【前刃切入與視線出彎】\n     - 具體動作：雙膝向前下微推，小腿輕壓鞋舌，腳尖溫和下壓前刃。\n     - 身體與雪板的變化：前刃溫和切入雪面，轉向橫越坡道形成圓弧。\n     - 動作目的：安全順暢建立前刃支撐，完成換刃。\n     - 常見錯誤與修正：後腳甩尾；修正為前膝推進引導前刃切入。\n- 練習注意事項（最多 3 點）：1. 不可提早後仰急煞 2. 先放大轉彎半徑 3. 前膝往前推壓前刃\n- 常見錯誤與修正：重心後退導致卡刃，應維持前腳 60% 重心與視線帶動。\n- 建議練習方式：落葉飄過渡、單次 C-turn 練習、再串連大 S-turn。\n- 完成標準：連續完成 5 次平順換刃無卡刃。\n- 分析依據：依據影片逐字稿動作示範分析。`,
    rawTranscript: "後刃切換到前刃是很多初學者在紅線的惡夢。記住口訣：重心先過渡到板底中央，視線看向出口，前膝往前下壓..."
  }
];

// App State
let notes = [];
let activeNoteId = null;
let activeCategory = "all";
let activeFilter = "all"; // "all" | "pending" | "done"
let searchQuery = "";
let currentUser = null;
let firestoreDb = null;
let unsubscribeFirestore = null;

// DOM Elements
const folderListEl = document.getElementById("category-folder-list");
const notesStackEl = document.getElementById("notes-stack");
const searchInputEl = document.getElementById("search-input");
const searchClearBtnEl = document.getElementById("search-clear-btn");
const filterTabsEl = document.querySelectorAll(".mac-filter-tab");
const detailColEl = document.getElementById("mac-detail-col");
const detailToolbarEl = document.getElementById("detail-toolbar");
const emptySelectionViewEl = document.getElementById("empty-selection-view");
const noteArticleEl = document.getElementById("note-article");
const mobileBackBtnEl = document.getElementById("mobile-back-btn");

// Detail Elements
const detailDateEl = document.getElementById("detail-date");
const detailTitleEl = document.getElementById("detail-title");
const detailCategoryTagEl = document.getElementById("detail-category-tag");
const detailSecondaryTagsEl = document.getElementById("detail-secondary-tags");
const detailYtThumbEl = document.getElementById("detail-yt-thumb");
const detailYtPlayLinkEl = document.getElementById("detail-yt-play-link");
const detailYtTitleEl = document.getElementById("detail-yt-title");
const detailYtUrlLinkEl = document.getElementById("detail-yt-url-link");
const detailYtWrapEl = document.querySelector(".mac-yt-thumb-wrap");
let currentPlayVideoId = null;

function resetInlinePlayer() {
  const frame = detailYtWrapEl && detailYtWrapEl.querySelector("iframe");
  if (frame) frame.remove();
  detailYtThumbEl.style.display = "";
  detailYtPlayLinkEl.style.display = "";
}

function startInlinePlayer() {
  if (!currentPlayVideoId) return;
  const frame = document.createElement("iframe");
  frame.className = "mac-yt-frame";
  frame.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(currentPlayVideoId)}?autoplay=1&rel=0&playsinline=1`;
  frame.title = "YouTube 影片播放器";
  frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";
  frame.allowFullscreen = true;
  detailYtThumbEl.style.display = "none";
  detailYtPlayLinkEl.style.display = "none";
  detailYtWrapEl.appendChild(frame);
}
const detailCoreConceptEl = document.getElementById("detail-core-concept");
const detailActionStepsSectionEl = document.getElementById("detail-action-steps-section");
const detailActionStepsListEl = document.getElementById("detail-action-steps-list");
const detailSuitabilitySectionEl = document.getElementById("detail-suitability-section");
const detailSuitabilityBadgeEl = document.getElementById("detail-suitability-badge");
const detailSuitabilityDescEl = document.getElementById("detail-suitability-desc");
const detailCautionsSectionEl = document.getElementById("detail-cautions-section");
const detailCautionsListEl = document.getElementById("detail-cautions-list");
const detailMistakesTableEl = document.getElementById("detail-mistakes-table");
const detailDrillsSectionEl = document.getElementById("detail-drills-section");
const detailDrillsListEl = document.getElementById("detail-drills-list");
const detailCompletionCriteriaEl = document.getElementById("detail-completion-criteria");
const detailAnalysisBasisEl = document.getElementById("detail-analysis-basis");
const btnReEvaluateEl = document.getElementById("btn-re-evaluate");
const reEvaluateBtnLabelEl = document.getElementById("re-evaluate-btn-label");
const reEvaluateIconEl = document.getElementById("re-evaluate-icon");
const btnToggleCompleteEl = document.getElementById("btn-toggle-complete");
const completeBtnLabelEl = document.getElementById("complete-btn-label");
const btnDeleteNoteEl = document.getElementById("btn-delete-note");
const btnToggleRawEl = document.getElementById("btn-toggle-raw");
const rawTranscriptBoxEl = document.getElementById("raw-transcript-box");

// Modal Elements
const addModalEl = document.getElementById("add-modal");
const btnOpenAddModalEl = document.getElementById("btn-open-add-modal");
const btnEmptyAddEl = document.getElementById("btn-empty-add");
const btnCloseModalEl = document.getElementById("btn-close-modal");
const btnCancelModalEl = document.getElementById("btn-cancel-modal");
const addNoteFormEl = document.getElementById("add-note-form");
const inputYtUrlEl = document.getElementById("input-yt-url");
const inputTitleEl = document.getElementById("input-title");
const inputTranscriptEl = document.getElementById("input-transcript");
const inputSrtFileEl = document.getElementById("input-srt-file");
const btnFillDemoSrtEl = document.getElementById("btn-fill-demo-srt");
const ytModalPreviewEl = document.getElementById("yt-modal-preview");
const ytModalThumbEl = document.getElementById("yt-modal-thumb");
const ytModalTitlePreviewEl = document.getElementById("yt-modal-title-preview");
const btnSubmitNoteEl = document.getElementById("btn-submit-note");
const submitSpinnerEl = document.getElementById("submit-spinner");
const submitLabelEl = document.getElementById("submit-label");
const toastEl = document.getElementById("mac-toast");

// Helpers
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function formatDate(isoStr) {
  try {
    const d = new Date(isoStr);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return isoStr || "";
  }
}

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("is-show");
  setTimeout(() => toastEl.classList.remove("is-show"), 2600);
}

function parseActionStepsFromText(text) {
  if (!text || typeof text !== "string") return [];
  const match = text.match(/動作分解步驟[：:]([\s\S]*?)(?=\n- (?:常見錯誤與修正|常見錯誤|完成標準|分析依據|練習注意事項|建議練習方式)[：:]|$)/);
  if (!match) return [];
  const block = match[1];
  const items = block.split(/\n\s*\d+\.\s*/).filter(item => item.trim());
  return items.map(item => {
    const titleMatch = item.match(/^(?:【([^】]+)】|([^\n]+))/);
    const stepName = titleMatch ? (titleMatch[1] || titleMatch[2]).trim() : "動作步驟";
    const movementMatch = item.match(/(?:具體動作|動作)[：:]\s*([^\n]+)/);
    const changeMatch = item.match(/(?:身體與雪板的變化|身體與雪板變化|身體變化|雪板變化)[：:]\s*([^\n]+)/);
    const purposeMatch = item.match(/(?:動作目的|目的)[：:]\s*([^\n]+)/);
    const fixMatch = item.match(/(?:常見錯誤與修正|錯誤與修正|注意事項)[：:]\s*([^\n]+)/);
    return {
      stepName,
      movement: movementMatch ? movementMatch[1].trim() : "",
      bodyAndBoardChange: changeMatch ? changeMatch[1].trim() : "",
      purpose: purposeMatch ? purposeMatch[1].trim() : "",
      mistakesAndCorrections: fixMatch ? fixMatch[1].trim() : ""
    };
  });
}

// Local Storage Loading / Saving
function loadLocalNotes() {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn("Error reading local snow notes", e);
  }
  return DEFAULT_SAMPLE_NOTES;
}

function saveLocalNotes(notesList) {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(notesList));
  } catch (e) {
    console.warn("Error saving local snow notes", e);
  }
}

// Category Badge Color Mapping
function getCategoryPillClass(cat) {
  switch (cat) {
    case "身體姿勢與平衡": return "mac-pill-category-1";
    case "板刃控制與換刃": return "mac-pill-category-2";
    case "轉彎與速度控制": return "mac-pill-category-3";
    case "壓力控制與刻滑進階": return "mac-pill-category-4";
    default: return "";
  }
}

function getSuitabilityClass(level) {
  switch (level) {
    case "suitable": return "mac-level-suitable";
    case "challenging": return "mac-level-challenging";
    case "too_advanced": return "mac-level-too_advanced";
    case "foundational": return "mac-level-foundational";
    default: return "mac-level-suitable";
  }
}

function getSuitabilityName(level) {
  switch (level) {
    case "suitable": return "適合目前程度";
    case "challenging": return "稍有挑戰（練習目標）";
    case "too_advanced": return "進階技術（建議先穩固基礎）";
    case "foundational": return "核心基本功";
    default: return "技術評估中";
  }
}

// Badge Counts Update
function updateFolderBadges() {
  const allCount = notes.length;
  const completedCount = notes.filter(n => n.completed).length;

  document.getElementById("badge-all").textContent = allCount;
  document.getElementById("badge-completed").textContent = completedCount;
  document.getElementById("badge-cat-1").textContent = notes.filter(n => n.category === "身體姿勢與平衡").length;
  document.getElementById("badge-cat-2").textContent = notes.filter(n => n.category === "板刃控制與換刃").length;
  document.getElementById("badge-cat-3").textContent = notes.filter(n => n.category === "轉彎與速度控制").length;
  document.getElementById("badge-cat-4").textContent = notes.filter(n => n.category === "壓力控制與刻滑進階").length;

  const totalNotesEl = document.getElementById("total-notes-count");
  if (totalNotesEl) totalNotesEl.textContent = `${allCount} 則筆記`;
}

// Render Notes List
function renderNotesList() {
  updateFolderBadges();

  let filtered = notes.slice();

  // Category Filter
  if (activeCategory === "completed") {
    filtered = filtered.filter(n => n.completed);
  } else if (activeCategory !== "all") {
    filtered = filtered.filter(n => n.category === activeCategory);
  }

  // Status Filter
  if (activeFilter === "pending") {
    filtered = filtered.filter(n => !n.completed);
  } else if (activeFilter === "done") {
    filtered = filtered.filter(n => n.completed);
  }

  // Search Filter
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(n =>
      (n.technique && n.technique.toLowerCase().includes(q)) ||
      (n.videoTitle && n.videoTitle.toLowerCase().includes(q)) ||
      (n.coreConcept && n.coreConcept.toLowerCase().includes(q)) ||
      (Array.isArray(n.secondaryTags) && n.secondaryTags.some(t => t.toLowerCase().includes(q)))
    );
  }

  // Sort by date descending
  filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  if (filtered.length === 0) {
    notesStackEl.innerHTML = `
      <li class="mac-list-empty">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <p>找不到符合的滑雪筆記</p>
      </li>
    `;
    return;
  }

  notesStackEl.innerHTML = filtered.map(note => {
    const isActive = note.id === activeNoteId;
    const catClass = getCategoryPillClass(note.category);
    const thumbUrl = note.videoThumbnail || getYouTubeThumbnailUrl(note.videoId) || "";

    return `
      <li class="mac-note-card${isActive ? " active" : ""}" data-id="${escapeHtml(note.id)}">
        <div class="mac-note-card-top">
          <h3 class="mac-note-card-title">${escapeHtml(note.technique || note.videoTitle || "滑雪技術筆記")}</h3>
          ${note.completed ? `
            <svg class="mac-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" title="已完成">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          ` : ""}
        </div>
        <div class="mac-note-card-meta">
          <span>${formatDate(note.createdAt).slice(5)}</span>
          <span>·</span>
          <span>${escapeHtml(note.suitability ? note.suitability.slice(0, 14) + "…" : "AI 分析")}</span>
        </div>
        <p class="mac-note-card-snippet">${escapeHtml(note.coreConcept || note.videoTitle || "")}</p>
        <div class="mac-note-card-footer">
          <span class="mac-pill ${catClass}">${escapeHtml(note.category || "未分類")}</span>
          ${thumbUrl ? `<img class="mac-yt-thumb-mini" src="${escapeHtml(thumbUrl)}" alt="縮圖" loading="lazy" />` : ""}
        </div>
      </li>
    `;
  }).join("");

  // Attach click listeners to cards
  notesStackEl.querySelectorAll(".mac-note-card").forEach(el => {
    el.addEventListener("click", () => {
      selectNote(el.dataset.id, true);
    });
  });
}

// Select and Display Note in Detail View
function selectNote(noteId, open = false) {
  activeNoteId = noteId;
  const note = notes.find(n => n.id === noteId);

  // Update card active classes
  notesStackEl.querySelectorAll(".mac-note-card").forEach(el => {
    el.classList.toggle("active", el.dataset.id === noteId);
  });

  if (!note) {
    resetInlinePlayer();
    emptySelectionViewEl.style.display = "flex";
    noteArticleEl.style.display = "none";
    detailToolbarEl.style.display = "none";
    detailColEl.classList.remove("is-active");
    return;
  }

  emptySelectionViewEl.style.display = "none";
  noteArticleEl.style.display = "block";
  detailToolbarEl.style.display = "flex";
  if (open) detailColEl.classList.add("is-active");

  // Populate Details
  detailDateEl.textContent = formatDate(note.createdAt);
  detailTitleEl.textContent = note.technique || note.videoTitle || "滑雪技術分析筆記";

  // Category and Tags
  detailCategoryTagEl.textContent = note.category || "身體姿勢與平衡";
  detailCategoryTagEl.className = `mac-category-tag ${getCategoryPillClass(note.category)}`;

  detailSecondaryTagsEl.innerHTML = (Array.isArray(note.secondaryTags) ? note.secondaryTags : []).map(tag =>
    `<span class="mac-secondary-tag">${escapeHtml(tag)}</span>`
  ).join("");

  // YouTube Card
  const videoId = note.videoId || extractYouTubeId(note.youtubeUrl);
  const thumbUrl = note.videoThumbnail || getYouTubeThumbnailUrl(videoId, "max") || "";
  detailYtThumbEl.src = thumbUrl;
  detailYtThumbEl.onerror = () => {
    detailYtThumbEl.src = getYouTubeThumbnailUrl(videoId, "hq");
  };

  const ytUrl = note.youtubeUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : "#");
  currentPlayVideoId = videoId || null;
  resetInlinePlayer();
  detailYtPlayLinkEl.disabled = !currentPlayVideoId;
  detailYtTitleEl.textContent = note.videoTitle || "YouTube 滑雪教學影片";
  detailYtUrlLinkEl.href = ytUrl;

  // AI Coaching Sections
  detailCoreConceptEl.textContent = note.coreConcept || "暫無影片核心觀念說明。";

  // Action Steps
  let steps = Array.isArray(note.actionSteps) && note.actionSteps.length > 0 ? note.actionSteps : [];
  if (!steps.length && note.formattedText) {
    steps = parseActionStepsFromText(note.formattedText);
    if (steps.length) {
      note.actionSteps = steps;
      saveLocalNotes(notes);
    }
  }

  detailActionStepsSectionEl.style.display = "block";

  if (steps.length) {
    detailActionStepsListEl.innerHTML = steps.map((step, idx) => `
      <div class="mac-step-card">
        <div class="mac-step-header">
          <span class="mac-step-badge">步驟 ${idx + 1}</span>
          <h4 class="mac-step-name">${escapeHtml(step.stepName || `步驟 ${idx + 1}`)}</h4>
        </div>
        <div class="mac-step-body">
          ${step.movement ? `
          <div class="mac-step-row">
            <span class="mac-step-label">具體動作</span>
            <p class="mac-step-text">${escapeHtml(step.movement)}</p>
          </div>` : ""}
          ${step.bodyAndBoardChange ? `
          <div class="mac-step-row">
            <span class="mac-step-label">身體與雪板變化</span>
            <p class="mac-step-text">${escapeHtml(step.bodyAndBoardChange)}</p>
          </div>` : ""}
          ${step.purpose ? `
          <div class="mac-step-row">
            <span class="mac-step-label">動作目的</span>
            <p class="mac-step-text">${escapeHtml(step.purpose)}</p>
          </div>` : ""}
          ${step.mistakesAndCorrections ? `
          <div class="mac-step-row is-mistake">
            <span class="mac-step-label">注意事項</span>
            <p class="mac-step-text">${escapeHtml(step.mistakesAndCorrections)}</p>
          </div>` : ""}
        </div>
      </div>
    `).join("");
  } else {
    detailActionStepsListEl.innerHTML = `
      <div class="mac-legacy-upgrade-banner">
        <div class="mac-legacy-banner-content">
          <div class="mac-legacy-banner-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <span>此筆記尚未產生動作分解步驟</span>
          </div>
          <p class="mac-legacy-banner-desc">這是舊版分析所建立的筆記。點擊「重新評估」即可透過新版 AI 教練，根據影片字幕重新拆解出具體執行步驟、身體板刃變化與動作目的！</p>
        </div>
        <button class="mac-btn-re-eval-action btn-inline-re-evaluate" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
          </svg>
          <span>立即重新評估</span>
        </button>
      </div>
    `;
    const inlineBtn = detailActionStepsListEl.querySelector(".btn-inline-re-evaluate");
    if (inlineBtn) {
      inlineBtn.addEventListener("click", reEvaluateCurrentNote);
    }
  }

  // Suitability (Show only if present in note data)
  if (note.suitability) {
    detailSuitabilitySectionEl.style.display = "block";
    detailSuitabilityBadgeEl.textContent = getSuitabilityName(note.suitabilityLevel);
    detailSuitabilityBadgeEl.className = `mac-suitability-badge ${getSuitabilityClass(note.suitabilityLevel)}`;
    detailSuitabilityDescEl.textContent = note.suitability;
  } else {
    detailSuitabilitySectionEl.style.display = "none";
  }

  // Cautions
  const cautions = Array.isArray(note.cautions) ? note.cautions : [];
  if (cautions.length && detailCautionsSectionEl) {
    detailCautionsSectionEl.style.display = "block";
    detailCautionsListEl.innerHTML = cautions.map((c, idx) => `
      <li class="mac-caution-item">
        <span class="mac-caution-num">${idx + 1}.</span>
        <span>${escapeHtml(c)}</span>
      </li>
    `).join("");
  } else if (detailCautionsSectionEl) {
    detailCautionsSectionEl.style.display = "none";
  }

  // Common Mistakes & Corrections
  const mistakes = Array.isArray(note.commonMistakes) ? note.commonMistakes : [];
  if (mistakes.length) {
    detailMistakesTableEl.innerHTML = mistakes.map(m => `
      <div class="mac-mistake-row">
        <div class="mac-mistake-bad">
          <span class="mac-mistake-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            常見錯誤
          </span>
          <p class="mac-mistake-text">${escapeHtml(m.mistake)}</p>
        </div>
        <div class="mac-mistake-good">
          <span class="mac-fix-label">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
            教練修正
          </span>
          <p class="mac-mistake-text">${escapeHtml(m.correction)}</p>
        </div>
      </div>
    `).join("");
  } else {
    detailMistakesTableEl.innerHTML = `<p style="font-size:13px; color:var(--mac-text-secondary);">已整合至各動作步驟注意事項中。</p>`;
  }

  // Drills
  const drills = Array.isArray(note.practiceDrills) ? note.practiceDrills : [];
  if (drills.length && detailDrillsSectionEl) {
    detailDrillsSectionEl.style.display = "block";
    detailDrillsListEl.innerHTML = drills.map(d => `
      <div class="mac-drill-item">
        <span class="mac-drill-step-badge">${escapeHtml(d.step || "步驟")}</span>
        <span class="mac-drill-text">${escapeHtml(d.detail)}</span>
      </div>
    `).join("");
  } else if (detailDrillsSectionEl) {
    detailDrillsSectionEl.style.display = "none";
  }

  // Completion Criteria
  detailCompletionCriteriaEl.textContent = note.completionCriteria || "能在綠線至紅線交界處流暢做出動作並維持身體平衡。";

  // Analysis Basis
  detailAnalysisBasisEl.textContent = note.analysisBasis || "依據提供之影片資訊與單板滑雪教學指南評估。";

  // Raw Transcript
  rawTranscriptBoxEl.textContent = note.rawTranscript || "（無原始逐字稿紀錄）";
  rawTranscriptBoxEl.style.display = "none";
  btnToggleRawEl.textContent = "檢視原文字幕逐字稿 ▾";

  // Complete Button State
  updateCompleteButtonState(note.completed);
}

function updateCompleteButtonState(isCompleted) {
  const iconSvg = btnToggleCompleteEl.querySelector("svg");
  if (isCompleted) {
    btnToggleCompleteEl.classList.add("is-completed");
    completeBtnLabelEl.textContent = "已完成";
    btnToggleCompleteEl.title = "已完成（點擊可取消）";
    if (iconSvg) {
      iconSvg.innerHTML = '<polyline points="20 6 9 17 4 12"></polyline>';
    }
  } else {
    btnToggleCompleteEl.classList.remove("is-completed");
    completeBtnLabelEl.textContent = "練習中";
    btnToggleCompleteEl.title = "練習中（點擊標註為已完成）";
    if (iconSvg) {
      iconSvg.innerHTML = '<circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>';
    }
  }
}

// Re-evaluate Note with new AI prompt
function setReEvaluatingState(isLoading) {
  if (btnReEvaluateEl) {
    btnReEvaluateEl.disabled = isLoading;
    btnReEvaluateEl.classList.toggle("is-loading", isLoading);
  }
  if (reEvaluateBtnLabelEl) {
    reEvaluateBtnLabelEl.textContent = isLoading ? "評估中…" : "重新評估";
  }
  if (reEvaluateIconEl) {
    reEvaluateIconEl.classList.toggle("mac-spin", isLoading);
  }
  const inlineReEvalBtn = document.querySelector(".btn-inline-re-evaluate");
  if (inlineReEvalBtn) {
    inlineReEvalBtn.disabled = isLoading;
    inlineReEvalBtn.textContent = isLoading ? "AI 深入評估中…" : "立即重新評估";
  }
}

async function reEvaluateCurrentNote() {
  if (!activeNoteId) return;
  const note = notes.find(n => n.id === activeNoteId);
  if (!note) return;

  if (!currentUser) {
    alert("請先登入後再進行 AI 重新評估。");
    return;
  }

  let transcript = (note.rawTranscript || "").trim();
  const title = (note.videoTitle || note.technique || "").trim();
  const videoUrl = note.youtubeUrl || (note.videoId ? `https://www.youtube.com/watch?v=${note.videoId}` : "");

  if (!transcript) {
    const entered = window.prompt(
      "此筆記尚未記錄原始字幕檔。為獲得最準確的動作分解步驟，請貼上字幕/逐字稿（若直接點確定，將僅依標題分析）：",
      ""
    );
    if (entered === null) {
      return;
    }
    transcript = (entered || "").trim();
    if (transcript) {
      note.rawTranscript = transcript;
    }
  } else {
    const confirmed = window.confirm(
      `確定要使用新版 AI 教練重新分析「${title || "這部影片"}」嗎？\n\n系統將依照最新 Prompt 規範，重新拆解動作執行順序、身體與雪板變化、目的與修正方式。`
    );
    if (!confirmed) return;
  }

  setReEvaluatingState(true);

  try {
    const analysisResult = await requestSnowboardAnalysis({
      user: currentUser,
      videoUrl,
      title,
      transcript
    });

    note.category = analysisResult.category || note.category;
    note.technique = analysisResult.technique || note.technique;
    note.secondaryTags = analysisResult.secondaryTags || note.secondaryTags;
    note.coreConcept = analysisResult.coreConcept || note.coreConcept;
    const parsedSteps = parseActionStepsFromText(analysisResult.formattedText || "");
    note.actionSteps = (Array.isArray(analysisResult.actionSteps) && analysisResult.actionSteps.length > 0)
      ? analysisResult.actionSteps
      : parsedSteps;
    note.suitability = analysisResult.suitability || "";
    note.suitabilityLevel = analysisResult.suitabilityLevel || "suitable";
    note.cautions = analysisResult.cautions || note.cautions || [];
    note.commonMistakes = analysisResult.commonMistakes || note.commonMistakes || [];
    note.practiceDrills = analysisResult.practiceDrills || note.practiceDrills || [];
    note.completionCriteria = analysisResult.completionCriteria || note.completionCriteria || "";
    note.analysisBasis = analysisResult.analysisBasis || note.analysisBasis || "";
    note.formattedText = analysisResult.formattedText || note.formattedText || "";
    note.updatedAt = new Date().toISOString();

    saveLocalNotes(notes);

    if (firestoreDb && currentUser) {
      try {
        if (note.id.startsWith("sample-")) {
          // If this was a sample note, convert to a real user document in Firestore so it persists
          const colRef = collection(firestoreDb, "ledgers", appName, "snowNotes");
          const { id: _ignoreId, ...dataToSave } = note;
          const docRef = await addDoc(colRef, dataToSave);
          note.id = docRef.id;
          saveLocalNotes(notes);
        } else {
          const noteDocRef = doc(firestoreDb, "ledgers", appName, "snowNotes", note.id);
          await updateDoc(noteDocRef, {
            category: note.category,
            technique: note.technique,
            secondaryTags: note.secondaryTags,
            coreConcept: note.coreConcept,
            actionSteps: note.actionSteps,
            suitability: note.suitability,
            suitabilityLevel: note.suitabilityLevel,
            cautions: note.cautions,
            commonMistakes: note.commonMistakes,
            practiceDrills: note.practiceDrills,
            completionCriteria: note.completionCriteria,
            analysisBasis: note.analysisBasis,
            formattedText: note.formattedText,
            rawTranscript: note.rawTranscript || "",
            updatedAt: note.updatedAt
          });
        }
      } catch (err) {
        console.warn("Error updating re-evaluated note in Firestore", err);
      }
    }

    renderNotesList();
    selectNote(note.id);
    showToast("重新評估完成！已拆解最新動作步驟 🎉");
  } catch (error) {
    console.error("Re-evaluation failed", error);
    alert(error.message || "重新評估失敗，請稍後重試。");
  } finally {
    setReEvaluatingState(false);
  }
}

// Toggle Note Completion
async function toggleNoteComplete() {
  if (!activeNoteId) return;
  const note = notes.find(n => n.id === activeNoteId);
  if (!note) return;

  const nextStatus = !note.completed;
  note.completed = nextStatus;
  note.completedAt = nextStatus ? new Date().toISOString() : null;

  saveLocalNotes(notes);
  updateCompleteButtonState(nextStatus);
  renderNotesList();

  // Sync to Firestore if signed in
  if (firestoreDb && currentUser && !note.id.startsWith("sample-")) {
    try {
      const noteDocRef = doc(firestoreDb, "ledgers", appName, "snowNotes", note.id);
      await updateDoc(noteDocRef, {
        completed: nextStatus,
        completedAt: note.completedAt
      });
    } catch (e) {
      console.warn("Error updating note in Firestore", e);
    }
  }

  showToast(nextStatus ? "已標註為完成！🎉" : "已變更為練習中");
}

// Delete Note
async function deleteCurrentNote() {
  if (!activeNoteId) return;
  const note = notes.find(n => n.id === activeNoteId);
  if (!note) return;

  const confirmed = window.confirm(`確定要刪除「${note.technique || note.videoTitle || "此則筆記"}」嗎？`);
  if (!confirmed) return;

  const deletedId = note.id;
  notes = notes.filter(n => n.id !== deletedId);
  saveLocalNotes(notes);

  if (firestoreDb && currentUser && !deletedId.startsWith("sample-")) {
    try {
      const noteDocRef = doc(firestoreDb, "ledgers", appName, "snowNotes", deletedId);
      await deleteDoc(noteDocRef);
    } catch (e) {
      console.warn("Error deleting note from Firestore", e);
    }
  }

  showToast("筆記已刪除");
  detailColEl.classList.remove("is-active");
  activeNoteId = notes[0] ? notes[0].id : null;
  renderNotesList();
  if (activeNoteId) {
    selectNote(activeNoteId);
  } else {
    selectNote(null);
  }
}


// Strip SRT Timestamps
function cleanSrtTranscript(text) {
  if (!text) return "";
  return text
    // Remove WEBVTT header
    .replace(/^WEBVTT[^\n]*/i, "")
    // Remove timestamps e.g. 00:01:23,000 --> 00:01:25,000 or 01:23.000 --> 01:25.000
    .replace(/\d{1,2}:\d{2}(?::\d{2})?[,\.]\d{3}\s*-->\s*\d{1,2}:\d{2}(?::\d{2})?[,\.]\d{3}[^\n]*/g, "")
    // Remove line numbers
    .replace(/^\d+\s*$/gm, "")
    // Remove extra blank lines
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// Setup Modal Sheet Event Handlers
function initModalHandlers() {
  const openModal = () => {
    addModalEl.classList.add("is-open");
    inputYtUrlEl.focus();
  };

  const closeModal = () => {
    addModalEl.classList.remove("is-open");
    addNoteFormEl.reset();
    ytModalPreviewEl.classList.add("hidden");
    submitSpinnerEl.style.display = "none";
    submitLabelEl.textContent = "AI 教練分析並儲存";
    btnSubmitNoteEl.disabled = false;
  };

  btnOpenAddModalEl.addEventListener("click", openModal);
  btnEmptyAddEl.addEventListener("click", openModal);
  btnCloseModalEl.addEventListener("click", closeModal);
  btnCancelModalEl.addEventListener("click", closeModal);

  // Close on clicking backdrop outside sheet
  addModalEl.addEventListener("click", e => {
    if (e.target === addModalEl) closeModal();
  });

  // Live YouTube URL parsing
  let ytDebounceTimer = null;
  inputYtUrlEl.addEventListener("input", () => {
    clearTimeout(ytDebounceTimer);
    ytDebounceTimer = setTimeout(async () => {
      const url = inputYtUrlEl.value.trim();
      const videoId = extractYouTubeId(url);
      if (videoId) {
        ytModalPreviewEl.classList.remove("hidden");
        ytModalThumbEl.src = getYouTubeThumbnailUrl(videoId, "mq");
        ytModalTitlePreviewEl.textContent = "正在取得 YouTube 影片標題…";

        const oembed = await fetchYouTubeOEmbed(url);
        if (oembed && oembed.title) {
          ytModalTitlePreviewEl.textContent = oembed.title;
          if (!inputTitleEl.value.trim()) {
            inputTitleEl.value = oembed.title;
          }
        } else {
          ytModalTitlePreviewEl.textContent = "YouTube 影片已就緒（點擊下方按鈕進行 AI 分析）";
        }
      } else {
        ytModalPreviewEl.classList.add("hidden");
      }
    }, 350);
  });

  // SRT file upload handler
  inputSrtFileEl.addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = event => {
      const cleaned = cleanSrtTranscript(event.target.result);
      inputTranscriptEl.value = cleaned;
      document.getElementById("file-upload-hint").textContent = `已載入 ${file.name}（已濾除時間碼）`;
    };
    reader.readAsText(file);
  });

  // Fill demo SRT transcript button
  btnFillDemoSrtEl.addEventListener("click", () => {
    if (!inputYtUrlEl.value.trim()) {
      inputYtUrlEl.value = "https://www.youtube.com/watch?v=kYv_8J3Mv3Q";
      inputYtUrlEl.dispatchEvent(new Event("input"));
    }
    inputTitleEl.value = "單板換刃過渡與重心轉移完整解析";
    inputTranscriptEl.value = `00:00:01,000 --> 00:00:04,500
哈囉大家，今天我們要來講單板最重要的換刃關鍵技巧。
00:00:05,000 --> 00:00:09,200
很多朋友在綠線滑得很順，但一上了紅線就會在後刃轉前刃時卡刃摔倒。
00:00:10,000 --> 00:00:15,000
最常見的錯誤，就是太心急，板頭還沒對準滾落線，上半身就用力轉過去。
00:00:15,500 --> 00:00:20,000
記住，換刃的核心是「重心引導與滾邊過渡」。
00:00:21,000 --> 00:00:27,000
出彎前，前膝蓋稍微放鬆下沉，把重量 60% 移到前腳，讓板頭順著斜坡滑下去。
00:00:28,000 --> 00:00:33,000
當板頭指向滾落線的瞬間，你的視線看向上坡或出口，腳尖輕輕下壓，前刃就會自然咬住雪面。
00:00:34,000 --> 00:00:39,000
練習時，先在平緩綠線做大半徑 S-turn，千萬不要急著煞車或把重心往後腳縮！`;
    // Clean timestamps
    inputTranscriptEl.value = cleanSrtTranscript(inputTranscriptEl.value);
    showToast("已填入示範字幕內容");
  });

  // Submit Note Form
  btnSubmitNoteEl.addEventListener("click", async () => {
    const ytUrl = inputYtUrlEl.value.trim();
    const title = inputTitleEl.value.trim();
    const transcript = inputTranscriptEl.value.trim();

    if (!ytUrl) {
      alert("請輸入 YouTube 影片網址。");
      inputYtUrlEl.focus();
      return;
    }
    if (!transcript && !title) {
      alert("請填寫字幕逐字稿或影片標題以供 AI 分析。");
      inputTranscriptEl.focus();
      return;
    }

    const videoId = extractYouTubeId(ytUrl);
    if (!videoId) {
      alert("請輸入有效的 YouTube 影片網址（如 https://www.youtube.com/watch?v=...）。");
      return;
    }

    // Set loading UI
    btnSubmitNoteEl.disabled = true;
    submitSpinnerEl.style.display = "inline-block";
    submitLabelEl.textContent = "AI 教練正在分析影片動作並拆解步驟…";

    try {
      const analysisResult = await requestSnowboardAnalysis({
        user: currentUser,
        videoUrl: ytUrl,
        title,
        transcript
      });

      const newNote = {
        id: `note-${Date.now()}`,
        createdAt: new Date().toISOString(),
        completed: false,
        youtubeUrl: ytUrl,
        videoId,
        videoTitle: title || analysisResult.technique || "滑雪教學影片",
        videoThumbnail: getYouTubeThumbnailUrl(videoId, "hq"),
        category: analysisResult.category || "身體姿勢與平衡",
        technique: analysisResult.technique || title,
        secondaryTags: analysisResult.secondaryTags || [],
        coreConcept: analysisResult.coreConcept || "",
        actionSteps: analysisResult.actionSteps || [],
        suitability: analysisResult.suitability || "",
        suitabilityLevel: analysisResult.suitabilityLevel || "suitable",
        cautions: analysisResult.cautions || [],
        commonMistakes: analysisResult.commonMistakes || [],
        practiceDrills: analysisResult.practiceDrills || [],
        completionCriteria: analysisResult.completionCriteria || "",
        analysisBasis: analysisResult.analysisBasis || "",
        formattedText: analysisResult.formattedText || "",
        rawTranscript: transcript
      };

      // Add to local state
      notes.unshift(newNote);
      saveLocalNotes(notes);

      // Save to Firestore if available
      if (firestoreDb && currentUser) {
        try {
          const colRef = collection(firestoreDb, "ledgers", appName, "snowNotes");
          const { id: _tempId, ...dataToSave } = newNote;
          const docRef = await addDoc(colRef, dataToSave);
          newNote.id = docRef.id;
          saveLocalNotes(notes);
        } catch (e) {
          console.warn("Error adding note to Firestore", e);
        }
      }

      closeModal();
      renderNotesList();
      selectNote(newNote.id, true);
      showToast("AI 教練筆記建立成功");

    } catch (error) {
      console.error("Snowboard analysis failed", error);
      alert(error.message || "AI 分析失敗，請稍後重試。");
    } finally {
      btnSubmitNoteEl.disabled = false;
      submitSpinnerEl.style.display = "none";
      submitLabelEl.textContent = "AI 教練分析並儲存";
    }
  });
}

// Setup Event Listeners
function initEventListeners() {
  // Folder Category Selection
  folderListEl.querySelectorAll(".mac-folder-item").forEach(item => {
    item.addEventListener("click", () => {
      folderListEl.querySelectorAll(".mac-folder-item").forEach(el => el.classList.remove("active"));
      item.classList.add("active");
      activeCategory = item.dataset.category;
      renderNotesList();
      // Select first note in category
      const first = notesStackEl.querySelector(".mac-note-card");
      if (first) selectNote(first.dataset.id);
    });
  });

  // Search Input
  searchInputEl.addEventListener("input", e => {
    searchQuery = e.target.value;
    searchClearBtnEl.style.display = searchQuery ? "flex" : "none";
    renderNotesList();
  });

  searchClearBtnEl.addEventListener("click", () => {
    searchInputEl.value = "";
    searchQuery = "";
    searchClearBtnEl.style.display = "none";
    renderNotesList();
    searchInputEl.focus();
  });

  // Filter Tabs (全部 / 練習中 / 已完成)
  filterTabsEl.forEach(tab => {
    tab.addEventListener("click", () => {
      filterTabsEl.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      activeFilter = tab.dataset.filter;
      renderNotesList();
    });
  });

  // Re-evaluate, Complete & Delete Buttons
  if (btnReEvaluateEl) btnReEvaluateEl.addEventListener("click", reEvaluateCurrentNote);
  btnToggleCompleteEl.addEventListener("click", toggleNoteComplete);
  btnDeleteNoteEl.addEventListener("click", deleteCurrentNote);

  // Toggle Raw Transcript Drawer
  btnToggleRawEl.addEventListener("click", () => {
    const isHidden = rawTranscriptBoxEl.style.display === "none";
    rawTranscriptBoxEl.style.display = isHidden ? "block" : "none";
    btnToggleRawEl.textContent = isHidden ? "收合原文字幕逐字稿 ▴" : "檢視原文字幕逐字稿 ▾";
  });

  // Mobile Back Button (Detail -> List)
  mobileBackBtnEl.addEventListener("click", () => {
    resetInlinePlayer();
    detailColEl.classList.remove("is-active");
  });

  // Inline YouTube player
  detailYtPlayLinkEl.addEventListener("click", startInlinePlayer);

  // Sync trip parameter to bottom nav links
  const activeTrip = new URLSearchParams(window.location.search).get("trip") || localStorage.getItem("active-trip-id");
  if (activeTrip) {
    document.querySelectorAll(".journey-bottom-nav a").forEach(a => {
      try {
        const href = a.getAttribute("href");
        if (href && (href.startsWith("index.html") || href.includes("index.html?"))) {
          const u = new URL(href, window.location.origin);
          u.searchParams.set("trip", activeTrip);
          a.setAttribute("href", u.pathname.replace(/^\//, "") + u.search);
        }
      } catch (_) {}
    });
  }
}

// Firestore Realtime Sync & Auth Guard
function initFirestoreSync() {
  const syncStatusEl = document.getElementById("sync-status");
  const appContainer = document.getElementById("snow-notes-app");

  if (!isConfigured) {
    window.location.replace("login.html");
    return;
  }

  if (!getApps().length) {
    initializeApp(firebaseConfig);
  }
  const auth = getAuth();
  firestoreDb = getFirestore();

  onAuthStateChanged(auth, async user => {
    if (!user || !isAllowed(user.email)) {
      if (user) await signOut(auth);
      window.location.replace("login.html");
      return;
    }

    currentUser = user;
    if (appContainer) appContainer.style.visibility = "visible";
    if (syncStatusEl) syncStatusEl.textContent = `已授權 (${user.email.split("@")[0]})`;

    // Listen to snowNotes collection
    try {
      const colRef = collection(firestoreDb, "ledgers", appName, "snowNotes");
      if (unsubscribeFirestore) unsubscribeFirestore();

      unsubscribeFirestore = onSnapshot(colRef, snapshot => {
        if (!snapshot.empty) {
          const firestoreNotes = [];
          snapshot.forEach(docSnap => {
            const data = docSnap.data();
            // Ensure docSnap.id ALWAYS takes precedence over any internal id field in document data
            firestoreNotes.push({ ...data, id: docSnap.id });
          });
          // Stable sort descending by creation date
          firestoreNotes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
          notes = firestoreNotes;
          saveLocalNotes(notes);
          renderNotesList();
          if (activeNoteId && notes.some(n => n.id === activeNoteId)) {
            selectNote(activeNoteId);
          } else if (notes.length > 0) {
            selectNote(notes[0].id);
          }
          if (syncStatusEl) syncStatusEl.textContent = "雲端即時同步";
        }
      }, err => {
        console.warn("Firestore snapshot error", err);
        if (syncStatusEl) syncStatusEl.textContent = "離線本機快取";
      });
    } catch (err) {
      console.warn("Firestore init error", err);
      if (syncStatusEl) syncStatusEl.textContent = "離線本機快取";
    }
  });
}

// App Initialization
function initApp() {
  notes = loadLocalNotes();
  notes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  initModalHandlers();
  initEventListeners();
  renderNotesList();

  // Select first note by default
  if (notes.length > 0) {
    selectNote(notes[0].id);
  } else {
    selectNote(null);
  }

  // Connect Firestore
  initFirestoreSync();
}

// Boot
window.addEventListener("DOMContentLoaded", initApp);
