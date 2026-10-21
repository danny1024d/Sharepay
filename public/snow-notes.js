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
    suitability: "非常符合目前程度。穩固的基本站姿是改善紅線滑行不穩的最關鍵基石。",
    suitabilityLevel: "suitable",
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
    formattedText: `- 主要分類：身體姿勢與平衡\n- 技術項目：基本滑行站姿與重心居中\n- 次要標籤：中性站姿、膝蓋微蹲、視線水平\n- 影片核心觀念：滑雪的核心在於重心始終維持在雪板有效邊刃正上方。上半身放鬆對齊雪板軸心，避免過早傾斜或骨盆後坐。\n- 適合目前程度嗎：非常符合目前程度。穩固的基本站姿是改善紅線滑行不穩的最關鍵基石。\n- 練習注意事項（最多 3 點）：1. 不可蹲馬桶式後坐 2. 雙肩自然平行板身 3. 視線看向前進遠方\n- 常見錯誤與修正：彎腰後坐修正為脛骨輕壓鞋舌、重心均勻分布於兩腳足弓。\n- 建議練習方式：平地站姿微彈跳、綠線直滑降感受中性平衡。\n- 完成標準：在綠線緩坡直滑降及斜滑降時平穩維持 15 秒以上。\n- 分析依據：依據影片教學內容分析。`,
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
    suitability: "正是學員目前核心攻克目標！能直接解決紅線容易卡後刃（Catch Edge）摔倒的痛點。",
    suitabilityLevel: "suitable",
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
    formattedText: `- 主要分類：板刃控制與換刃\n- 技術項目：後刃轉前刃的重心引導與滾邊過渡\n- 次要標籤：Toe-side 換刃、視線引導、落葉飄進階\n- 影片核心觀念：換前刃不是硬用後腳踢板，而是在板頭通過滾落線瞬間，透過膝蓋微蹲推進將邊刃順利翻轉。\n- 適合目前程度嗎：正是目前核心突破目標，能解決紅線換刃卡刃恐懼。\n- 練習注意事項（最多 3 點）：1. 不可提早後仰急煞 2. 先放大轉彎半徑 3. 前膝往前推壓前刃\n- 常見錯誤與修正：重心後退導致卡刃，應維持前腳 60% 重心與視線帶動。\n- 建議練習方式：落葉飄過渡、單次 C-turn 練習、再串連大 S-turn。\n- 完成標準：連續完成 5 次平順換刃無卡刃。\n- 分析依據：依據影片逐字稿動作示範分析。`,
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
const detailSuitabilityBadgeEl = document.getElementById("detail-suitability-badge");
const detailSuitabilityDescEl = document.getElementById("detail-suitability-desc");
const detailCautionsListEl = document.getElementById("detail-cautions-list");
const detailMistakesTableEl = document.getElementById("detail-mistakes-table");
const detailDrillsListEl = document.getElementById("detail-drills-list");
const detailCompletionCriteriaEl = document.getElementById("detail-completion-criteria");
const detailAnalysisBasisEl = document.getElementById("detail-analysis-basis");
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

  detailSuitabilityBadgeEl.textContent = getSuitabilityName(note.suitabilityLevel);
  detailSuitabilityBadgeEl.className = `mac-suitability-badge ${getSuitabilityClass(note.suitabilityLevel)}`;
  detailSuitabilityDescEl.textContent = note.suitability || "符合目前程度。";

  // Cautions
  const cautions = Array.isArray(note.cautions) && note.cautions.length ? note.cautions : ["練習時注意保持平衡與膝蓋彈性。"];
  detailCautionsListEl.innerHTML = cautions.map((c, idx) => `
    <li class="mac-caution-item">
      <span class="mac-caution-num">${idx + 1}.</span>
      <span>${escapeHtml(c)}</span>
    </li>
  `).join("");

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
    detailMistakesTableEl.innerHTML = `<p style="font-size:13px; color:var(--mac-text-secondary);">影片中未特別指出常見錯誤。</p>`;
  }

  // Drills
  const drills = Array.isArray(note.practiceDrills) ? note.practiceDrills : [];
  if (drills.length) {
    detailDrillsListEl.innerHTML = drills.map(d => `
      <div class="mac-drill-item">
        <span class="mac-drill-step-badge">${escapeHtml(d.step || "步驟")}</span>
        <span class="mac-drill-text">${escapeHtml(d.detail)}</span>
      </div>
    `).join("");
  } else {
    detailDrillsListEl.innerHTML = `<p style="font-size:13px; color:var(--mac-text-secondary);">依循影片動作逐步平順練習。</p>`;
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
    submitLabelEl.textContent = "AI 教練正在依學員程度深入分析…";

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
          const docRef = await addDoc(colRef, newNote);
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

  // Complete & Delete Buttons
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
            firestoreNotes.push({ id: docSnap.id, ...docSnap.data() });
          });
          notes = firestoreNotes;
          saveLocalNotes(notes);
          renderNotesList();
          if (activeNoteId) selectNote(activeNoteId);
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
