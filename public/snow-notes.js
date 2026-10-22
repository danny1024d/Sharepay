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
  requestSnowboardAnalysis,
  requestYouTubeTranscript
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
      if (Array.isArray(parsed) && parsed.length > 0) {
        const skqmTranscript = `嗨大家好我是黃嘉藍那今天我們五步教會你陡坡小回轉陡坡搓雪小回轉好嗎

那我們第一步要做什麼呢今天是第一步重心與身體姿態首先我們小破的陡坡搓雪小回轉就有一個非常小的錢

中後這樣一個變化每一個彎入彎的手在前彎的側面的手在中間就彎的中間在中間嘛彎的最後是偏後面一點點但是我們這前中後不是通過這樣來完成的

是通過我們的髖關節原來是停在一個位置的是通過我們膝蓋跟腳這樣前後把板子帶來帶去了完成了我們人上半身是部參與的一旦參與就歪了OK嗎

那具體我們一邊滑一邊說該怎麼練今天練習非常簡單來一來找一個藍道差不多25度或者25度以上30度以下的波來練習會最好

然後試一下把一個彎想成三個等分嘛對不對

每一個彎每一個等分要做不一樣的重心那我們要怎麼練呢首先我們試一下在中間滑對我們人在中間換刃什麼各方面跟這個

青銅變王者那個三部曲是一模一樣的還不熟悉的各位可以回去看一下至少得在藍道甚至是比較緩的黑道能做得到那三部的各位再來練這個好現在在中間滑了一段的對不對

這一下一樣的坡度我們壓在前腳滑看到嗎

從頭到尾都壓在前面一點但是不是我們人這樣去是我們通過腳跟膝蓋把那個板子拉回來一點然後再這樣滑一直壓在前面滑

試試看一直壓在前面滑大家看到嗎

一直壓在前面滑好然後這樣滑兩個彎之後試一下一直壓在後腳滑看到嗎

一直壓在後腳滑一直壓在後腳對吧

換刃都不回來好前週後我們的試過對不對

關鍵是我們身體學會怎麼樣髖骨往上的不參與看髖部以下膝蓋跟腳這樣前後倒板子而且還能在滑的圖中來做OK嗎

確實不行到回去去綠道去緩一點的坡線這三個動作做出來了壓著前面滑壓著中間滑

壓著後面滑學好了以後很簡單把它直接趕回我們今天來滑行禮看

入彎的時候前前面中最後後對吧

前週後看到嗎

我會做得比較誇張要不看不清所以現在是做順的看到嗎

陡坡滑起來就是像我現在滑了這樣非常的輕鬆看到嗎

但每一個彎其實大家看得出來有一個前週後的變化了看到嗎

前週後前週一下都有了好來那第一步就到這裡了

現在是第二步就是怎麼樣立刃立刃我們該怎麼練呢首先我們得把刃立起來

然後再練怎麼樣把刃放下去OK嗎

在我們整個彎的過程中他沒有說哪個點任要多少什麼一切如是看例行但是有個普遍

遵循的原則上刃要上的找但是上完之後要慢慢隨這個彎的結束來把刃加大所以今天我們後

兩個練習內容OK嗎

首先第一個階梯式轉彎之前其實我們做過了我們是重新回應一下好嗎

怎麼做呢階梯式轉彎是通過我們的髖關節跟膝蓋在我們換刃橫切坡的時候來回打有點像我們橫切坡的時候再來回換刃這種感覺

好我們來下去看一下好我們要用盡整個坡的寬度來好

過來到前刃了左右左右左

右左好換到這邊來好等一下

我們的攝影師一直在這個側面要不看不到這個動作了好來左

右右左好我用手在比給他右

左右左好橫切坡的時候做沒換完任別著急

對吧

這樣看到嗎

這通過我們髖關節跟膝蓋來完成的看到嗎

我猜我在這邊來回換刃看到嗎

前後刃都得做劃對了的話出來的痕跡怎麼樣呢出來的痕跡大概會像一個下樓梯這樣這樣出來了

因為我們前後刃一直在換對吧

這個為什麼要這樣練你看我們橫切坡的時候你這樣換刃都能換得過來往往下滑你怎麼樣換不過來你怎麼樣的話

而且兩邊是圓的對上的你上刃非常早我們現在練的是什麼早入任把任把彎轉圓

第一步就是要早入任好嗎

那首先好第一我們知道怎麼樣提早入任結梯是轉嗎慢慢練然後這是25度的一個藍道的波

上面半端25度以上了然後幾兩也要早最低25度的波最高不要超過30然後第二個練習呢

練怎麼樣把任力的更高那首先我們會做一個練習就是打直的往前衝平板不能再任何任集停集停下來之後往上跳三下後刃

好嗎

具體這樣子的1 2 3集停迷上車然後往三上這樣

跳幾下不能摔我們具體人趴的點腳跌力起來

腳跌而估起來這樣認起來了我們才有一個可以推的地方你才能往上跳得了的後刃是這樣

越平的波越簡單越抖的波越難五步小回轉的第三步今天練的是壓力

怎麼樣的壓力呢壓力大家知道嗎去推他去蹲他對沒錯但是記得

要用力一樣才行啊對吧

他們兩前後是有一個很小的一個前後差距就是感覺是一大將不是兩個一起推

是一大將的OK嗎

這是第一點用力大家都知道推但不知道什麼時候推不知道怎麼推對不對

好這樣告訴大家要推的話兩個腿都要用一樣的力氣但是是前腳先推後腳再推

OK嗎

然後也不要推太猛了推過頭了人其實就歪了就不對了對不對

然後具體壓力就蹲腳這一下怎麼推啊對吧

是在哪兒推啊一個彎如果是一個一個這樣C彎（C-turn）固定氣鬆了

然後一個C彎（C-turn）的話把他分成三段中間這一段的時候去推是OK的別到底了

再推為什麼到底一推就出土了對吧

因為你是重力加速度把你人往下啦你再衡過本來去推這個重力加速度那你兩不是力氣太大

把你衝不住就這樣就出來了所以也要再側邊推而且這側邊推才是均勻的在控制速度

OK嗎

要推早推別到最後再推從側面開始推推到最後是可以的從側面都不推前面也不推

到最後才推一腳下去是不行的肯定土土OK嗎

記得兩邊都是要推的話再側表推來再這就推了

看到嗎

我有手臂給大家看再這就推了可以做花章一點多起來推推看到嗎

學術網側面盆出去想看到自己有沒有做對著朋友看到嗎

學術網側面推想看到自己有沒有動作做對的朋友們可以拍攝小影片對吧

拍影片看學術從哪裡盆出來就行了第四步那還是一樣的坡度藍道藍道

25度到30度之間的坡度然後我們今天來練習一下我們的導向能力因為每一個彎其實我們理論上去

上刃給壓力然後剩下有需要的時候我們再給導向我們覺得我需要這個彎更小我再給導向

OK嗎

那這個導向我們具體用什麼來練我們之前已經練過了嗎打方向用哪裡打膝蓋髖關節

監督要參與之前很多影片都有然後可以看一下這些令然後可以翻到前面的影片就想更詳細解說今天我們來看看

到底這個順擰全身順的一塊轉彎跟反擰轉彎到底有什麼區別他們優勢各自在哪而且怎麼樣方到

我們這個陡坡搓雪小回轉因為陡坡搓雪小回轉裡面大家發現看我影片平時比較多的朋友都會發現

它不是說你全身能這樣愛愛這樣一起很僵硬的不行對吧

你現在配合了全身的關節是要靈活的配合著去做髖關節膝蓋肩、架是有個順序

你得站滑的時候能靈活調配他們每一個平時順擰反擰都能做得到的時候你對身體才有控制能力你才能在需要的時候

給對的導向OK嗎

那今天我們兩個都來練練兩個都學會了我們看情況往後再用OK嗎

好那我們首先是順擰全身一起轉它有什麼優勢呢它是最穩的看到嗎

它是最穩的大家看到因為為什麼我們全身看監髖關節膝蓋腳全部都均勻的壓到我們的板頭

跟板尾我們兩個固定器上面還有很穩這裡大家可能看得看不出來攝像機往下壓

你就知道這次濕濕的那些黏的奶吸血攝影師下面那是冰這雪非常非常難滑然後在這裡面

大家看到順著走的話其實是非常穩的但是大家看到轉完頻率它就那麼個頻率了它不能再快了

它最穩的它不能更快就正常滑的話當然我可以有辦法讓它更快但是目前我們練習圖

中沒辦法一下做那麼快那怎麼樣最快呢反應上下身反應是我們轉完

改變方向殺車最快的方法所以在公園樹林裡面用的非常非常多

突然減速或者突然要改變方向什麼的但是它不是最穩的為什麼因為你看我上下身領發的

所以它不穩它已經過這些東西一點我就很容易前後翻對吧

剛才是穩這個濕轉的快所以我調配現在我們是一家在華星廚中做兩個凡領

對吧

凡領對吧

凡領大家看到嗎

我的速度控制非常的有效凡領對吧

來這邊凡領我不想去我本來這個玩笑往這兒去的我不想去

我凡領一下回來了對吧

我本來這個玩過去我裝的攝影師了凡領一下停下來往這邊回來了對吧

當我們做了這些東西的時候看到嗎

我的畫膝蓋今天都在做的不一樣的事情參與著不一樣的內容

OK嗎

這樣的話在我們往後躲破出去小回轉的時候需要這個配合的時候才有東西要我們用我們身體是在華的圖中

是能動隨時能調配的我們才有機會能學的會這個內容要不然的話那可以回到我們之前

親同別王者那個三部曲如果這兩個內容沒有完全說一看一練就能做出來了那就說

前面的內容三部曲沒練好不能直接跳到這一步練不出來了躲破出去小回轉最後一步是什麼呢

時機動作的時機和配合是我們全身關係前面練到的所有東西的一個配合理論上我們不是學了

身體姿態對吧

上刃壓力導向對吧

我們每一個彎動作是怎麼做的呢我們每一個彎其實要先幹嘛我們一邊走一邊說

每一個彎都是要先上刃上刃了給壓力轉過來了我還要彎再小一點

再導向然後結束這個彎看到嗎

所以是上刃給壓力導向上刃給壓力

導向上刃給壓力導向大家看到嗎

不就是之前的內容嗎是串起來了對吧

上升序的然而為什麼我們要有這個第五步就是有了這個模板之後大家知道

原來要動的時候是怎麼動是髖關節膝蓋前一位髖關節從板子立後

現在後刃上嘛從後刃一移到前刃去了我就怎麼樣另外一邊認一個板子這樣

前刃跟後刃我髖關節在這邊我立在那邊認我髖關節移過去了呢把這另外一邊認

對不對

先上刃吧然後呢給壓力愛腿輕輕的順著這個對

之前練了第二步往側面推雪對不對

推完之後發現不行我這個玩還想再快一點怎麼樣順擰髖關節

膝蓋肩嘛膝蓋跟肩再順著再打方向再讓這個玩更快一點

對吧

這個配合是邏輯理論上每一次都要做到的每一個玩都要做到但是總有你看

這雪亂七八糟的今天對吧

大雪包連了奶昔雪什麼的冰的地方完全是沒有雪的這種情況下不可能說

上刃壓力導向做不到的這種時候我們叫靈活配打時機非常重要

什麼時候上刃上刃多快壓力給多少還有這個最後的導向給不給都有區別

看到嗎

靈活調配怎麼樣練這個內容呢多滑不一樣的地形挑爛的雪來滑但量力而為一定要看自己的程度

不要挑超過自己水平太多的OK嗎

找不一樣的地形找爛的雪它會迫使你去做不一樣的調配因為

零件我們都有了現在就是拚在一起讓身體學會怎麼樣配合來

我們一定要看有沒有人對吧

好寫上它走吧好我們現在好換人壓力

看到嗎

我導向都沒倒看到嗎

大家我這幾個玩是沒有給導向的是否反邊是不是圓的上刃壓力

反之變圓了它自己就走出一個圓來了所以為什麼人家滑得那麼輕鬆因為是反之再把我們滑

不是我們我們再自己滑看到嗎

看到嗎

我這邊沒有去打導向的我就是這樣順的兩邊對吧

但如果我現在想要把玩給的更小滑得更小怎麼樣那就在上刃壓力

再給個導向看到嗎

最後我就不安置不回來了對吧

再來上刃壓力導向以下就回來了看到嗎

好那我現在給了座順了上刃壓力導向看到最後這一架嗎

最後這一架是不是有平時像小海純跳一樣的感覺因為反之掉回來了一給導向的話

剩餘的壓力全部會把你以往前進方向吹一架了對吧

這就是自然中後不是我們故意去這樣弄的OK嗎

好再來我們現在滑斷的懶車再給大家多做一點示範一直在側面就夠了OK

不用滑太某如果滑對了的話其實是非常的多苦靈活的大家看到不用很

不用很使勁的不用特別的使勁的對吧

那好前面的內容練習各位好好反覆著去真主每一次再練你都會有新的體會了OK嗎

那總體流程親同到往者那個三部曲做好了以後沿了這個

腐步交會你躲破小回轉離步一步練內容體五步差不多應該出來是這個樣子了

OK嗎

加油各位有什麼問題留言請問我謝謝掰掰`;

        const pressureTranscript = `Oh my goodness,同學們好歡迎來到今天的Snow Sensei今天呢,我們要講如何減壓跟加壓Woo!Alright,我們在減壓呢主要有兩大不同的 style

兩大不同的 style呢分作為 extend to release另外一個叫做 flex to release兩個都是減壓之後再加壓或加壓之後再減壓的方式如果我們講 extend to release的話

它比較偏向我會先加壓對地板上面加壓力以後再達到我的減壓的效果比如說是這樣子我蹲在板子上模擬我自己蹲在板子上

我忽然腿往下面伸直會發生什麼事Woo!我會先給地板鴨力地板呢會給我一個反作用力幫我往上推來達到減壓的效果

所以看喔,所以看我鞋子And extendExtendExtendOK

所以這個叫 extend to release用伸直的方式來達到加壓之後減壓的效果OK

那現在呢我們要講到另外一個也是屬於非常喜歡的一個減壓的方式它叫做 flex to releaseflex to release呢是什麼概念呢

兩種做法怎麼做法呢大概是這樣子我們的身體維持一個高的站姿然後呢瞬間的

把我的身體很像是往下蹲你又發現什麼事情往下蹲的那一個差呢我的腳我的鞋子是不是有離開雪面了

好這個動作呢變成是先減壓再達到加壓的一個效果所以它呢

對我來說這是一個比較有效率而且更快速能幫助我們達到減壓效果的一個動作身體往下快速的蹲下的時候

注意看喔注意看我的腳同樣的減壓方式呢我們有另外一個方式來解釋它你也可以想像自己維持身體的重心

我們的身體的重心呢差不多在我們肚臍下方兩指的地方差不多是我們丹田丹田的這個地方維持這個高度

但是把我的腳往上的收看被發生什麼事情有沒有發現我也是很類似的把我的腳會忽然騰空了以後

所說發現這個方式呢會更快速哦比我所謂的身體往下墜這種方式其實來的更快速可以來達到所謂的減壓

發生的一個更有效率的一個方式OK

所以我們有兩種哦兩種OK

主要是我們的extend to releaseextend to release還有我們的flexflex to release

現在呢我們就把板子穿起來叔叔來示範一下如何用這兩個方式來幫助我們達到更有效率的換刃

跟換刃了以後如何更穩定的來達到我們滑行的動作哦Check it out

首先呢我們要先講到 extend to release現在呢所謂站在板子上其實是有給他滿多的壓力我才有辦法

在這個斜坡上面停住哦那我如何讓我自己開始有辦法做一個彎呢其實這個時候如果我在原地有沒有

蹲下來給他壓力然後呢我順便往上 extendrelease然後再慢慢地蹲回來OK

在Toe-side（前刃）也是一樣哦所以我們從一個低的動作一個低的姿勢and extend to releaseand back

有沒有發現非常順暢非常容易的這個地形呢地形引力呢只要我又 release我的重量他就會把我拉進一個

Fall line（滾落線）朝向Fall line（滾落線）走而幫助我更容易的達到我的換刃而另外一個方式呢則是 flex to release

也是陪著叔叔比較喜歡的減壓的方式哦到底是一樣的只是做法剛好是反過來在 flex to release的時候我們會先給自己往下蹲

或者是把腿往上收的這個力量來幫助我達到減壓的動作之後呢再慢慢地站起加壓OK

so如果我來再做一次從Toe-side（前刃）開始做我會忽然瞬間的把我的腿收起來有沒有發現我一收起來

哇我的板子基本上自動的就會被這個地形引力往下牽引而達到了一個怎麼轉板頭轉下去

然後達到了一個 Fall line（滾落線）再加上我們本來就有個技巧不管是我們旋轉 of hips還是我的 twist來自於腳踝的 twist 這些全部的 combine起來呢

都會幫助我們達到一個更有效的換刃的動作接下來呢叔叔要示範如何在我們的滑行當中使用 extend to release的方式來幫助我們做到一個

換刃的動作OK

so extend to release的時候你一定要從一個比較低的站姿開始OK

一樣我們往旁邊 traversetraverse traverseand extend and back所以 extend 換完換完認你後有沒有做完H2H的一個動作了以後

我們就回到一個蹲的站姿and ready for another one蹲低 and extend and downand extend and downand extend and down接下來呢

叔叔要做的示範則是所謂的 flex to release用蹲下或者是用 屈膝的動作來幫助我們達到剪壓的效果這個也是呢

叔叔最喜歡交給不管是出中高階學友們的一個滑行的技巧為什麼叔叔這麼喜歡交 flex to release尤其在我們初學的時候我們遇到 Fall line（滾落線）就是這個最協限版

只要往下指的時候我們身體因為懼怕我們的大腦跟我們講說危險在那裡所以我們的大腦會想要原理這個危險

最發生什麼事有沒有看到我就會做成一個 back seat就是靠後腿壓力在後腿的一個壞動作壞習慣就會導致你的不穩定甚至你的板子會加速的想要離開你

所以是比較危險的一個動作但是如果今天我們做的動作是 flex to release的話當你蹲下來的時候有沒有發現我的身體自然而然非常容易就回到中間來

比較難說我會往後面壓而且我的身體的重心離地越近我的安全感也會越高如果我真的要往旁邊擋的話我離地面也比較近

我說微微的往後面做就可以了OK 所以我認為叔叔認為 flex to release對很多出學者來說是一個非常棒很安全有效果的一個換刃的方式

我們來試試看所以一樣我會稍微比較高的一個站姿開始不是地震站好只是稍微比較高準備了以後

然後我會蹲下來你看我在fall line的時候我是非常低的and慢慢站起來再一次哦fall line的時候有沒有

我是很低的and慢慢站起來and one more timeflex and releaseand flex and highand flex and high

and flex and highAlright 各位Snow Senseii的同學們謝謝你們今天的收看我們今天的提到如何用extend跟如何用flex這兩種方式來 release your edge（釋放板刃壓力）

這兩個方式都是正確的哦所以有機會的話一定要多多做嘗試來找出哪一個對你來說是比較容易也比較安全比較有效率的方式

OK

如果喜歡這一集的內容記得幫我們按讚按訂閱哦Snow Senseii我們下期見`;

        const akTranscript = `大家好歡迎來到今天我們的Special Episode。今天我們要特別謝謝香港的Cristin Au，在信件裡提到想要學平地、平坡的滑行技巧。在很平的雪道上面到底應該如何安全滑行？還有如果要經過一個很平的地方，之前是一個高速坡，我們應該用什麼樣的方式去幫助我們安全度過？
各位同學最怕就是遇到這種狀況：這一段我要直衝，直衝了以後還有一段很長很長的平坡，到底要怎麼克服呢？
首先在這種直衝的時候，一定要注意安全，維持在安全速度範圍之內，建議大家還是做一點微微的S-turn，隨時去控制速度。
直走緩坡的時候，我們會利用稍微一點的Twist（板面扭轉）。黑叔叔的習慣是做Toe-side Twist，來幫助我們把雪板鎖在直線上面，微微壓在鋼邊上，板子就不會左右晃動而容易卡到另外一面的鋼邊。
在平地找直線時，後腿膝蓋微微壓進來，造成一點點Twist，會幫助板尾的Toe-side edge微微抓一點雪。如果板子開始往Heelside旋轉，因為加壓在Toe-side，可以隨時變成Toe-side煞車或Speed Check來保證安全，而不會在全平板時卡到Heelside鋼邊摔倒。
什麼是Speed Check？它的意思就是讓我們在不改變前進方向的狀況下，降低或控制我們的速度。
做Speed Check有幾個重點：
第一是「Unweighting（釋壓/卸力）」，肩膀跟前進方向處於平行線，當要把板子轉過來橫向推雪時，需要釋壓並旋轉上半身做Counter-rotation，再轉回來，這會降低鋼邊上的重量，達到上下半身分開旋轉的效果。
第二是Toe-side Speed Check，人體構造上Toe-side比較難，建議夾緊腰側肌肉（Love handle），由核心旋轉帶動，眼睛持續看著前進方向。
Heelside Speed Check的技巧則是前後腿非常重要：前腿往內收、後腿往外推，配合Unweighting，達到90度的橫向減速推雪，再回到前進方向。
Speed Check在進跳台前速度太快時也能微調速度，上下半身的反向旋轉（Counter-rotation）是核心關鍵。
第二種狀況是「林間道（Tree Runs）」，林間道又窄又平，常常左彎右彎上上下下，如果只會直板走非常危險，因為無法控制速度。走林間道一定要用Speed Check控速。
當遇到很平的地形，為什麼全平板容易跌倒？因為當板子行走的方向跟板子指向的方向不一致時，只要壓錯鋼邊就會卡逆刃跌倒。
要讓板子前進方向跟板身保持平行，必須做「Edge Roll」：稍微壓一邊、再壓另一邊，做出小小的蛇形（Small S-turn），在有限寬度內保持直線滑行的穩定度。
Edge Roll基本上運用關節彎曲加上一點Twist，分為四個部位：1.前腳尖(Front Toe) 2.後腳尖(Back Toe) 3.前腳跟(Front Heel) 4.後腳跟(Back Heel)。運用腳踝屈曲（Ankle Flexion）與膝蓋屈曲（Knee Flexion）做出1-2-3-4連續微滾邊，保證雪板鋼邊抓在雪面上，維持穩定性。
Tips重點一：髖骨位置（Hip Position）。髖骨往哪個方向，雪板就會轉過去。新手挑戰平坡時常因為轉肩膀導致髖骨打開，板子就歪掉無法保持直線。必須保持髖骨鎖定在與雪板長軸平行的方向上。
Tips重點二：安全第一。如果場地夠大夠寬，直衝相對安全；如果地形又窄又平且前面人多，不需要逼自己直衝，寧可停下來單腳Push（單腳蹬雪滑行），千萬不要讓自己陷入危險。`;

        let updated = false;
        parsed.forEach(note => {
          if (note.videoId === "skQmRpoE_OA" || (note.youtubeUrl || "").includes("skQmRpoE_OA") || (note.videoTitle || "").includes("小回转") || (note.videoTitle || "").includes("小迴轉") || (note.technique || "").includes("小回轉")) {
            if (!note.rawTranscript || !note.rawTranscript.trim()) {
              note.rawTranscript = skqmTranscript;
              updated = true;
            }
            if (!note.actionSteps || note.actionSteps.length === 0) {
              note.category = "轉彎與速度控制";
              note.technique = "五步學會陡坡搓雪小回轉（Steep Slope Skidded Short Turns）";
              note.secondaryTags = ["陡坡搓雪小回轉", "重心前後微調", "漸進立刃", "側向推雪加壓", "順擰與反擰導向", "複合零件融合"];
              note.coreConcept = "陡坡搓雪小回轉的核心不在於上半身蠻力擰轉，而是將滑雪動作拆解為 5 大獨立模組：1. 重心前後微調（入彎前、彎中居中、出彎偏後，純由下肢前後微倒雪板，上半身不參與扭曲）；2. 漸進立刃（早立刃但角度隨彎進行漸次加大，由階梯式橫切微換刃打底）；3. 側向推雪加壓（雙腿均勻用力、前腳微先後腳跟進，在 C 彎中段側邊推雪控速，切忌到底才死踩煞車）；4. 導向能力調配（順擰全身同向最穩健，反擰 Counter-rotation 上下身分離極速靈巧，靈活調配肩髖膝順序）；5. 零件綜合融合（面對爛雪、奶昔雪、大雪包或冰面時，根據地形靈活調配立刃速度、施壓深度與導向時機）。";
              note.actionSteps = [
                {
                  stepName: "第一步：重心前後位置微調（下肢前後倒板，上半身不歪斜）",
                  movement: "在 25-30 度藍道坡度上練習。將一個轉彎分成入彎、彎中、出彎三等分。入彎時重心偏前腳，彎中居中，出彎時重心微移至後腳。",
                  bodyAndBoardChange: "髖部以上維持穩定不參與扭曲；僅由膝蓋與腳踝將雪板向前或向後微拉微推（倒板）。",
                  purpose: "確保入彎時板頭牢固咬雪引導轉向，出彎時板尾微釋放完成過渡，避免全身前傾後仰造成重心失衡。",
                  mistakesAndCorrections: "用彎腰或轉上半身來湊重心；修正為骨盆與上半身鎖定，純由雙膝與腳掌前後位移調配。"
                },
                {
                  stepName: "第二步：立刃時機與角度漸進控制（早立刃、漸進加大、階梯式橫切微換刃）",
                  movement: "換刃要「早立刃」，但切忌一入彎就立大刃。隨著彎的半徑推進，逐漸透過下肢傾角把立刃角度加大。練習時在橫切坡（Traverse）使用整個雪道寬度，透過髖關節與膝蓋做連續的「階梯式微立刃/微換刃（左-右-左-右）」。",
                  bodyAndBoardChange: "入彎初期小立刃平滑過渡，隨後逐漸加深抓雪深度，雪板平穩由切雪滑行過渡到抓雪制動。",
                  purpose: "避免一換刃就卡死立大刃導致失速摔倒，確保整個轉彎弧度圓潤可控。",
                  mistakesAndCorrections: "出彎橫切時太心急沒換完刃就急著做動作；修正為善用雪道全寬，在橫切中踏實完成階梯式立刃。"
                },
                {
                  stepName: "第三步：側向推雪加壓時機（均勻用力、前腳微先、彎中側邊推雪）",
                  movement: "將一個 C 彎分成三段，加壓推雪要在「轉彎正側面（中段）」進行，雙腿施加均勻推力，且前腳微先發力、後腳隨即跟進，做出平順的側向刮雪控速。",
                  bodyAndBoardChange: "在彎中垂直滾落線前將動能藉由橫向刮雪化解，雪板在側面均勻搓雪降速；不可等滑到彎底才猛踩後腳煞車。",
                  purpose: "在重力加速度將速度完全帶起前化解動能，維持均勻的勻速滑行，避免到底才煞車導致受衝力過大衝出雪道。",
                  mistakesAndCorrections: "到底才推雪甚至單靠後腳死踹；修正為在 C 彎側面由雙腿均勻推雪，前腳微先帶領。"
                },
                {
                  stepName: "第四步：導向能力選擇（順擰求最穩 vs 反擰求極速）",
                  movement: "在 25-30 度陡坡練習兩種導向技巧：1. 順擰（肩、髖、膝全身同向順轉）——重心最穩，力量均勻壓向板身；2. 反擰（Counter-rotation 上下半身反向分離）——上半身朝向下坡，下半身快速轉動雪板，轉向極快且靈活。",
                  bodyAndBoardChange: "順擰時雪板吃雪厚實穩定；反擰時板頭擺動極速，能在極狹窄道面上完成極小半徑急轉。",
                  purpose: "掌握兩套轉向發力模式，對身體關節具備絕對控制力，在需要求穩或求快速避障時自由切換。",
                  mistakesAndCorrections: "全身關節僵硬一起擰；修正為靈活調配肩、髖、膝發力順序，順擰反擰都能流暢演示。"
                },
                {
                  stepName: "第五步：五大零件綜合融合與爛雪地形動態調配",
                  movement: "將「前後重心、早立刃、側面加壓、順反擰導向」四大模組有機拼接。多在不同地形（如爛雪、奶昔雪、春雪、蘑菇包或硬冰面）實地驗證。",
                  bodyAndBoardChange: "面對大雪包或爛雪時，不再機械化套用固定公式，而是根據雪質動態調整：冰面延緩立刃、爛雪輕柔加壓、蘑菇包採用反擰極速導向。",
                  purpose: "從機械化的技術動作昇華為因應地形的直覺本能，真正達成「陡坡搓雪小回轉自由」。",
                  mistakesAndCorrections: "在亂雪中死板僵化做動作導致卡刃；修正為放鬆下肢關節吸收雪面包伏，依地形即時動態微調。"
                }
              ];
              note.cautions = [
                "陡坡搓雪小回轉切忌在彎底猛踩煞車，必須在 C 彎正側面（中段）提前完成推雪控速。",
                "重心前後移動純由髖部以下（膝蓋與腳掌）倒板完成，上半身與肩膀切勿前俯後仰破壞中性平衡。",
                "練習初期請在 25-30 度藍道或緩黑道充分熟練，切勿在基礎不穩時直接挑戰極陡冰面。"
              ];
              note.commonMistakes = [
                {
                  mistake: "轉彎結束時才在彎底猛推煞車，導致重力加速度過大衝不住雪板失控衝出",
                  correction: "在 C 彎側面中段提前由前腳引導、雙腿均勻推雪減速。"
                },
                {
                  mistake: "用彎腰或歪身軀的方式來湊前後重心",
                  correction: "髖骨以上維持直立放鬆不歪斜，由雙膝及腳掌前後位移調配板面壓力。"
                }
              ];
              note.practiceDrills = [
                { step: "步驟一（重心前後位移）", detail: "在 25 度藍道分別練習「全程壓前腳滑行」與「全程壓後腳滑行」，體會純下肢倒板感；隨後融入入彎前、彎中中、出彎偏後的連續節奏。" },
                { step: "步驟二（階梯式微立刃）", detail: "橫切全雪道寬度，利用髖部與膝蓋連續做左-右-左-右階梯式立刃切換，感受早立刃與漸進加大。" },
                { step: "步驟三（彎中推雪與順反擰）", detail: "在陡坡練習 C 彎側面均勻推雪控速；交替練習純順擰大穩定與純反擰極小半徑快速小回轉。" }
              ];
              note.completionCriteria = "在 25-30 度陡坡上能以均勻勻速、極小半徑連續做出 10 個以上流暢的搓雪小回轉，入彎前中後重心流暢微調，且能在彎側面穩定控速無彎底急煞現象。";
              note.analysisBasis = "依據黃嘉藍（Huang's Snowboarding）教學音訊完整聽寫逐字稿：深入剖析陡坡搓雪小回轉五步教學法（重心前後調配、階梯式漸進立刃、彎中側向均勻加壓、順擰與反擰導向機制，以及爛雪多變地形動態調配）。";
              updated = true;
            }
          }
          if (note.videoId === "1e3chVUL1rs" || (note.youtubeUrl || "").includes("1e3chVUL1rs") || (note.videoTitle || "").includes("加減壓") || (note.technique || "").includes("加減壓")) {
            if (!note.rawTranscript || !note.rawTranscript.trim()) {
              note.rawTranscript = pressureTranscript;
              updated = true;
            }
            if (!note.actionSteps || note.actionSteps.length === 0) {
              note.category = "板刃控制與換刃";
              note.technique = "Extend to Release 與 Flex to Release 加減壓換刃技巧";
              note.secondaryTags = ["Extend to Release", "Flex to Release", "加壓減壓", "防止Backseat", "Fall line轉換"];
              note.coreConcept = "換刃核心在於釋放板刃壓力（Release your edge）。Extend to Release 先加壓後伸展卸壓，適合大彎與平緩雪道；Flex to Release 在即將進入 Fall line 瞬間屈膝收腿卸壓，雪板受重力自然墜入滾落線，重心離雪面近且安全感高，徹底防止因恐懼後仰造成的 Back seat 致命錯誤。";
              note.actionSteps = [
                {
                  stepName: "Extend to Release（伸展減壓換刃：蹲低加壓 -> 伸直卸壓 -> 慢慢蹲下加壓）",
                  movement: "以較低蹲姿進行橫切（Traverse），在準備換刃前雙腿微蹲加壓，隨後順勢快速向上伸展站起（Extend），瞬間釋放板刃壓力（Release）。",
                  bodyAndBoardChange: "向上伸展時雪面對板底產生反作用力，板刃壓力驟減，雪板受地心引力牽引自然朝向滾落線（Fall line）擺動，隨後順著新邊刃慢慢下蹲回到低站姿加壓走刃。",
                  purpose: "利用垂直伸展卸除舊刃壓力，平順且穩定地越過板底過渡到新刃，適合大半徑轉彎。",
                  mistakesAndCorrections: "伸展過早過猛拔起身體離開雪面；修正為腳掌平貼雪板，維持平順的下蹬與回蹲節奏。"
                },
                {
                  stepName: "Flex to Release（屈膝收腿減壓換刃：較高站姿 -> 瞬間收腿卸重 -> 順墜滾落線 -> 站起加壓）",
                  movement: "以較高的自然站姿橫切，在即將進入 Fall line 瞬間主動屈膝蹲下，或想像丹田重心高度不變，快速把雙腿往上收向核心，瞬間卸除板底壓力。",
                  bodyAndBoardChange: "收腿下蹲剎那雙腳壓力驟減懸浮，雪板在無重狀態下由地心引力牽引自動轉向下坡 Fall line。完成換刃後再隨轉彎進行慢慢站起加壓刻滑。",
                  purpose: "極速釋放邊刃壓力，在陡坡、高速或障礙前實現超高效率的瞬態換刃。",
                  mistakesAndCorrections: "整個人軟腳向下掉；修正為核心維持穩定，主動把腿部向上收向丹田。"
                },
                {
                  stepName: "克服 Fall line 恐懼與防範 Back seat（後坐致命錯誤）",
                  movement: "初學者面對滾落線直指山下時大腦常因恐懼本能後仰（Back seat）。使用 Flex to Release 時，在進入 Fall line 瞬間堅決屈膝收腿保持低重心。",
                  bodyAndBoardChange: "重心高度大幅降低，重心自動鎖在雙腳足弓正中央，板頭緊貼雪面不會飄起；即使失控也離雪面極近，安全就地微坐，徹底杜絕失控飆速重摔。",
                  purpose: "用科學的物理下蹲機制對抗大腦本能後仰恐慌，確保換刃全程重心居中，建立最高安全感。",
                  mistakesAndCorrections: "在 Fall line 恐懼後仰把重心壓在後腳；修正為堅定在 Fall line 保持屈膝深蹲，感受板頭順著重力自然轉下。"
                }
              ];
              note.cautions = [
                "Flex to Release 重點在於「主動收腿卸壓」，而不是放鬆身體往下掉；收腿時重心高度盡量維持在丹田水準線。",
                "無論使用 Extend 還是 Flex，都要配合髖關節引導（Rotation of hips）與腳踝微扭（Ankle Twist），才能達到最流暢的邊刃轉換。",
                "初學者面對滾落線（Fall line）切勿將重心往後縮到後腳（Back seat），蹲得越低重心越穩、安全感越高。"
              ];
              note.commonMistakes = [
                {
                  mistake: "進彎面對 Fall line 時因害怕而身體後仰（Back seat），導致板頭浮起失控重摔",
                  correction: "採用 Flex to Release 屈膝收腿，重心離地面更近，重心自然維持在兩腳足弓中心。"
                },
                {
                  mistake: "Extend to Release 伸展時用力過猛直接跳起，打亂重心平衡",
                  correction: "以順暢的關節屈伸為原則，伸展只為釋放板刃壓力，雙腳不離開雪面。"
                }
              ];
              note.practiceDrills = [
                { step: "步驟一", detail: "在平地穿板練習高站姿瞬間屈膝收腿（Flex），感受腳底懸浮卸壓與丹田重心維持。" },
                { step: "步驟二", detail: "在綠線橫切，蹲低 -> 伸直站起釋壓（Extend to release） -> 順入滾落線換刃 -> 慢慢蹲下加壓，做連續大 S-turn。" },
                { step: "步驟三", detail: "在平緩或中級坡，由稍高站姿橫切，入彎前瞬間屈膝收腿（Flex to release），感受板頭被重力快速牽引進入 Fall line，換刃完成後再慢慢站起回推加壓。" }
              ];
              note.completionCriteria = "能在綠線及中級坡上清晰區分並熟練演示 Extend to Release（先蹲後起換刃）與 Flex to Release（先起後蹲換刃），且在面對滾落線時能保持重心居中完全無後坐（Back seat）現象。";
              note.analysisBasis = "依據 Uncle Perry（Snow Sensei）影片教學音訊（Whisper 完整聽寫）：深入解析 Extend to Release（伸展減壓）與 Flex to Release（屈膝收腿減壓）兩大換刃體系、釋放板刃壓力（Release your edge）原理，以及克服 Fall line 恐慌避免 Back seat 的核心要領。";
              updated = true;
            }
          }
          if (note.videoId === "AKtdblPpqzo" || (note.youtubeUrl || "").includes("AKtdblPpqzo")) {
            if (!note.rawTranscript || !note.rawTranscript.trim()) {
              note.rawTranscript = akTranscript;
              updated = true;
            }
            if (!note.actionSteps || note.actionSteps.length === 0) {
              note.category = "轉彎與速度控制";
              note.technique = "緩坡直衝平穩走刃與林間道控速";
              note.secondaryTags = ["平坡Twist", "Speed Check", "林間道Edge Roll", "髖骨定位"];
              note.coreConcept = "平坡直行切忌全平板漂移卡逆刃，應以後腳微壓做 Toe-side Twist 鎖定直線；狹窄林間道則利用 1-2-3-4 Edge Roll 與 Speed Check 安全控速。";
              note.actionSteps = [
                {
                  stepName: "平坡直衝後腳微扭（Toe-side Twist）鎖定直線",
                  movement: "直行緩坡時雙膝微屈，後膝微微內扣，給板尾前刃（Toe-side edge）施加微小壓力，保持微小 Twist 角度。",
                  bodyAndBoardChange: "板尾前刃微咬雪面，防止雪板在全平底滑動時左右失控漂移或卡逆刃（Heelside catch）。",
                  purpose: "在長緩坡中維持直線滑行速度與航向穩定，避免因卡逆刃後仰重摔。",
                  mistakesAndCorrections: "雙腳完全放平讓雪板浮動漂移；修正為後腿前刃輕咬雪面鎖定直線。"
                },
                {
                  stepName: "直線 Speed Check 控速與卸力（Unweighting）",
                  movement: "肩膀保持與行進方向平行，藉由上下半身反向旋轉（Counter-rotation）配合垂直微彈跳釋壓（Unweighting），將雪板橫向推雪減速後立刻回正。",
                  bodyAndBoardChange: "雪板短暫垂直於滾落線橫推刮雪降速，隨後利用回彈力將板頭順回行進方向，不改變滑行路徑。",
                  purpose: "在高速直衝或進跳台前精準調節速度，避免失速失控。",
                  mistakesAndCorrections: "轉動整個人方向造成大轉彎甚至煞停；修正為肩膀方向不變，僅靠下半身反向旋轉做短暫橫刮。"
                },
                {
                  stepName: "狹窄林間道 1-2-3-4 邊刃微滾動（Edge Roll）",
                  movement: "在狹窄平坦林間道，利用腳踝與膝蓋屈伸（Flexion）連續依序微壓：1.前腳尖 -> 2.後腳尖 -> 3.前腳跟 -> 4.後腳跟。",
                  bodyAndBoardChange: "雪板在有限寬度的道面做出微幅流暢的小蛇形走刃（Small S-turn），持續保持某個鋼邊部位咬雪。",
                  purpose: "在狹窄林間道中靈活避開障礙與控制航向，防止直板衝速或卡刃。",
                  mistakesAndCorrections: "雙肩大幅擺動破壞平衡；修正為髖骨（Hip）鎖定與雪板長軸平行，純由腳踝膝蓋做滾刃。"
                }
              ];
              note.cautions = [
                "直衝平坡前以微 S-turn 將初速度控制在安全可控範圍，不可盲目直衝。",
                "遇到狹窄林間道且人多時，切勿強行直衝，必要時停下單腳 Push（單腳滑行）確保安全。",
                "髖骨方向決定雪板轉向，滑行中雙肩與髖骨務必鎖定平行板身長軸。"
              ];
              note.commonMistakes = [
                {
                  mistake: "緩坡全平板滑行，板身左右漂移卡到後刃逆刃摔倒",
                  correction: "後腿膝蓋微扣做 Toe-side Twist，讓板尾前刃微抓雪鎖住直線航向。"
                },
                {
                  mistake: "Speed Check 時上半身跟著大轉彎，導致失控偏離雪道",
                  correction: "雙肩對齊行進方向，利用上下半身反向旋轉（Counter-rotation）做純下肢橫刮控速。"
                }
              ];
              note.practiceDrills = [
                { step: "步驟一", detail: "在綠線緩坡練習後腿 Toe-side Twist 直線滑行 20 公尺，感受板尾咬雪的直線穩定性。" },
                { step: "步驟二", detail: "平緩坡練習直滑降中連續做出 3 次 Speed Check，確認減速後能立刻回正前進。" },
                { step: "步驟三", detail: "在寬敞緩坡練習 1-2-3-4 腳踝膝蓋微滾刃（Edge Roll），做出連續均勻小蛇形。" }
              ];
              note.completionCriteria = "在長緩坡直行中無卡刃晃動感；在林間道中能透過 Speed Check 與 1-2-3-4 滾刃維持安全速度平順通過。";
              note.analysisBasis = "依據 Uncle Perry（Snow Sensei）影片教學音訊逐字稿：緩坡直衝 Twist、直線 Speed Check 與林間道 1-2-3-4 滾刃要點整理。";
              updated = true;
            }
          }
        });
        if (updated) {
          saveLocalNotes(parsed);
        }
        return parsed;
      }
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

  // If no transcript, attempt to automatically fetch from YouTube first
  if (!transcript) {
    const videoId = note.videoId || extractYouTubeId(videoUrl);
    if (videoId) {
      setReEvaluatingState(true);
      try {
        const transcriptRes = await requestYouTubeTranscript({ user: currentUser, videoUrl, videoId });
        if (transcriptRes && transcriptRes.found && transcriptRes.transcript) {
          transcript = transcriptRes.transcript;
          note.rawTranscript = transcript;
          const isAudioTranscribe = transcriptRes.source === "workers_ai" || transcriptRes.source === "whisper_audio_transcription" || transcriptRes.source === "supadata_api" || (transcriptRes.trackName || "").includes("Supadata") || (transcriptRes.trackName || "").includes("Whisper") || (transcriptRes.trackName || "").includes("聽寫") || (transcriptRes.trackName || "").includes("Cloudflare");
          const label = isAudioTranscribe
            ? `已由 AI 語音音訊聽寫取得字幕（${transcriptRes.transcript.length} 字）`
            : `已自動取得 YouTube 字幕（${transcriptRes.trackName || transcriptRes.languageCode}）`;
          showToast(label);
        }
      } catch (_) {}
      setReEvaluatingState(false);
    }
  }

  if (!transcript) {
    const entered = window.prompt(
      "此影片在 YouTube 上無可用字幕檔。為獲得最準確的動作分解步驟，請貼上字幕/逐字稿（若直接點確定，將僅依標題分析）：",
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
    const statusEl = document.getElementById("yt-modal-subtitle-status");
    if (statusEl) statusEl.textContent = "影片已就緒";
    delete inputTranscriptEl.dataset.userEdited;
    const hintEl = document.getElementById("file-upload-hint");
    if (hintEl) hintEl.textContent = "支援 .srt / .vtt / .txt；影片無字幕時可手動上傳";
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

  // Track manual transcript edits
  inputTranscriptEl.addEventListener("input", () => {
    inputTranscriptEl.dataset.userEdited = "true";
  });

  // Live YouTube URL parsing and automatic transcript fetching
  let ytDebounceTimer = null;
  inputYtUrlEl.addEventListener("input", () => {
    clearTimeout(ytDebounceTimer);
    ytDebounceTimer = setTimeout(async () => {
      const url = inputYtUrlEl.value.trim();
      const videoId = extractYouTubeId(url);
      const statusEl = document.getElementById("yt-modal-subtitle-status");
      const hintEl = document.getElementById("file-upload-hint");

      if (videoId) {
        ytModalPreviewEl.classList.remove("hidden");
        ytModalThumbEl.src = getYouTubeThumbnailUrl(videoId, "mq");
        ytModalTitlePreviewEl.textContent = "正在取得 YouTube 影片標題…";
        if (statusEl) statusEl.innerHTML = `<span>⏳ 正在偵測字幕（若無字幕將自動啟動 Cloudflare AI 語音聽寫）…</span>`;

        const oembed = await fetchYouTubeOEmbed(url);
        if (oembed && oembed.title) {
          ytModalTitlePreviewEl.textContent = oembed.title;
          if (!inputTitleEl.value.trim()) {
            inputTitleEl.value = oembed.title;
          }
        } else {
          ytModalTitlePreviewEl.textContent = "YouTube 影片已就緒";
        }

        // Auto download YouTube transcript if not manually modified by user
        if (!inputTranscriptEl.dataset.userEdited) {
          try {
            const transcriptRes = await requestYouTubeTranscript({ user: currentUser, videoUrl: url, videoId });
            if (transcriptRes && transcriptRes.found && transcriptRes.transcript) {
              inputTranscriptEl.value = transcriptRes.transcript;
              const isAudioTranscribe = transcriptRes.source === "workers_ai" || transcriptRes.source === "whisper_audio_transcription" || transcriptRes.source === "supadata_api" || (transcriptRes.trackName || "").includes("Supadata") || (transcriptRes.trackName || "").includes("Whisper") || (transcriptRes.trackName || "").includes("聽寫") || (transcriptRes.trackName || "").includes("Cloudflare");
              const label = transcriptRes.source === "supadata_api" ? "🎧 已由 Supadata AI 語音自動聽寫字幕" : isAudioTranscribe ? "🎧 已由 AI 語音音訊自動聽寫字幕" : "✅ 已自動下載 YouTube 字幕";
              if (statusEl) {
                statusEl.innerHTML = `<span style="color:#10b981;font-weight:600;">${label}（${escapeHtml(transcriptRes.trackName || transcriptRes.languageCode)}，${transcriptRes.transcript.length} 字）</span>`;
              }
              if (hintEl) hintEl.textContent = `${label}完成，無須手動填寫。`;
            } else {
              if (statusEl) {
                statusEl.innerHTML = `<span style="color:#f59e0b;font-weight:600;">⚠️ 此影片無可用字幕，請手動上傳或貼上逐字稿</span>`;
              }
              if (hintEl) hintEl.textContent = "此影片無公開字幕，請手動貼上逐字稿或上傳字幕檔。";
            }
          } catch (err) {
            console.warn("Auto transcript fetch error", err);
            if (statusEl) {
              statusEl.innerHTML = `<span style="color:#f59e0b;">⚠️ 無法自動取得字幕，請手動填寫或上傳</span>`;
            }
          }
        }
      } else {
        ytModalPreviewEl.classList.add("hidden");
        if (statusEl) statusEl.textContent = "影片已就緒";
      }
    }, 350);
  });

  // SRT file upload handler
  inputSrtFileEl.addEventListener("change", e => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    inputTranscriptEl.dataset.userEdited = "true";
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
    inputTranscriptEl.dataset.userEdited = "true";
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

      const savedTranscript = transcript || analysisResult.autoTranscript?.transcript || "";

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
        rawTranscript: savedTranscript
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
          // Auto-hydrate known notes from Firestore if missing transcript
          firestoreNotes.forEach(note => {
            if (note.videoId === "1e3chVUL1rs" || (note.youtubeUrl || "").includes("1e3chVUL1rs") || (note.videoTitle || "").includes("加減壓") || (note.technique || "").includes("加減壓")) {
              if (!note.rawTranscript || !note.rawTranscript.trim()) {
                const localSaved = loadLocalNotes().find(n => n.videoId === "1e3chVUL1rs" || (n.youtubeUrl || "").includes("1e3chVUL1rs"));
                if (localSaved && localSaved.rawTranscript) {
                  note.rawTranscript = localSaved.rawTranscript;
                  note.actionSteps = localSaved.actionSteps || note.actionSteps;
                  note.coreConcept = localSaved.coreConcept || note.coreConcept;
                  note.technique = localSaved.technique || note.technique;
                  note.category = localSaved.category || note.category;
                  note.secondaryTags = localSaved.secondaryTags || note.secondaryTags;
                  note.cautions = localSaved.cautions || note.cautions;
                  note.commonMistakes = localSaved.commonMistakes || note.commonMistakes;
                  note.practiceDrills = localSaved.practiceDrills || note.practiceDrills;
                  note.completionCriteria = localSaved.completionCriteria || note.completionCriteria;
                  note.analysisBasis = localSaved.analysisBasis || note.analysisBasis;
                }
              }
            }
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
