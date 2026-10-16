import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { allowedEmails, appName, firebaseConfig } from "./firebase-config.js";
import { renderIcons } from "./icons.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getFirestore(app);
const tripsCollection = collection(database, "ledgers", appName, "trips");
const legacyTypes = ["expenses", "payments", "places", "imageAnalyses"];

const list = document.getElementById("trip-list");
const status = document.getElementById("trip-status");
const count = document.getElementById("trip-count");
const form = document.getElementById("create-trip-form");
const createButton = document.getElementById("create-trip-btn");
const createError = document.getElementById("create-error");

renderIcons();

function isAllowed(email) {
  return Boolean(email) && allowedEmails.some(value => value.toLowerCase() === email.toLowerCase());
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function dateLabel(value) {
  if (!value) return "待定";
  const [, month, day] = value.split("-");
  return month && day ? `${Number(month)}/${Number(day)}` : "待定";
}

function dateRange(trip) {
  if (!trip.startDate && !trip.endDate) return "日期尚未設定";
  if (trip.startDate && trip.endDate) return `${trip.startDate} 至 ${trip.endDate}`;
  return trip.startDate ? `${trip.startDate} 出發` : `${trip.endDate} 結束`;
}

function renderTrips(trips) {
  trips.sort((left, right) => (right.updatedAt || right.createdAt || 0) - (left.updatedAt || left.createdAt || 0));
  count.textContent = `${trips.length} 個行程`;
  status.textContent = "";
  if (!trips.length) {
    list.innerHTML = '<div class="empty-state">目前還沒有行程。<br>在下方建立第一趟旅程。</div>';
    return;
  }
  list.innerHTML = trips.map(trip => `
    <article class="trip-item">
      <a class="trip-link" href="index.html?trip=${encodeURIComponent(trip.id)}" data-trip-id="${escapeHtml(trip.id)}" data-trip-name="${escapeHtml(trip.name)}">
        <span class="trip-date">${escapeHtml(dateLabel(trip.startDate))}</span>
        <span class="trip-copy">
          <span class="trip-name">${escapeHtml(trip.name)}</span>
          <span class="trip-range">${escapeHtml(dateRange(trip))}</span>
        </span>
        <i class="trip-arrow" data-lucide="chevron-right" aria-hidden="true"></i>
      </a>
      <button class="delete-button" type="button" data-delete-trip="${escapeHtml(trip.id)}" data-trip-name="${escapeHtml(trip.name)}" aria-label="刪除${escapeHtml(trip.name)}" title="刪除行程">
        <i data-lucide="trash-2" aria-hidden="true"></i>
      </button>
    </article>`).join("");
  renderIcons(list);

  list.querySelectorAll("[data-trip-id]").forEach(link => link.addEventListener("click", () => {
    localStorage.setItem("active-trip-name", link.dataset.tripName);
  }));
  list.querySelectorAll("[data-delete-trip]").forEach(button => button.addEventListener("click", () => {
    removeTrip(button.dataset.deleteTrip, button.dataset.tripName, button);
  }));
}

async function migrateLegacyData() {
  const migrationVersion = 2;
  const migrationRef = doc(database, "ledgers", appName, "settings", "migrations");
  const migration = await getDoc(migrationRef);
  if ((migration.data()?.legacyTripMigrationVersion || 0) >= migrationVersion) return;

  const tripId = "hokkaido-legacy";
  const migratedTripRef = doc(tripsCollection, tripId);
  const migratedTrip = await getDoc(migratedTripRef);

  const snapshots = await Promise.all(legacyTypes.map(type => getDocs(collection(database, "ledgers", appName, type))));
  if (!snapshots.some(snapshot => !snapshot.empty)) {
    await setDoc(migrationRef, { legacyTripMigrationCompleted: true, legacyTripMigrationVersion: migrationVersion, updatedAt: Date.now() }, { merge: true });
    return;
  }

  if (!migratedTrip.exists()) {
    const now = Date.now();
    await setDoc(migratedTripRef, {
      name: "北海道之旅",
      startDate: "",
      endDate: "",
      createdAt: now,
      updatedAt: now,
      migratedFromLegacy: true
    });
  }

  for (let typeIndex = 0; typeIndex < legacyTypes.length; typeIndex += 1) {
    const type = legacyTypes[typeIndex];
    for (const entry of snapshots[typeIndex].docs) {
      const destinationRef = doc(database, "ledgers", appName, "trips", tripId, type, entry.id);
      const destination = await getDoc(destinationRef);
      if (!destination.exists()) await setDoc(destinationRef, entry.data());

      if (type === "places") {
        const location = await getDoc(doc(entry.ref, "googleLocations", "places-api"));
        if (location.exists()) {
          const destinationLocationRef = doc(destinationRef, "googleLocations", "places-api");
          const destinationLocation = await getDoc(destinationLocationRef);
          if (!destinationLocation.exists()) await setDoc(destinationLocationRef, location.data());
        }
      }
      if (type === "imageAnalyses") {
        const asset = await getDoc(doc(entry.ref, "assets", "original"));
        if (asset.exists()) {
          const destinationAssetRef = doc(destinationRef, "assets", "original");
          const destinationAsset = await getDoc(destinationAssetRef);
          if (!destinationAsset.exists()) await setDoc(destinationAssetRef, asset.data());
        }
      }
    }
  }
  await setDoc(migrationRef, { legacyTripMigrationCompleted: true, legacyTripMigrationVersion: migrationVersion, updatedAt: Date.now() }, { merge: true });
}

async function removeTrip(tripId, tripName, button) {
  if (!confirm(`確定刪除「${tripName}」？\n\n此行程的支出、代付、景點與辨識紀錄都會永久刪除。`)) return;
  button.disabled = true;
  try {
    for (const type of legacyTypes) {
      const entries = await getDocs(collection(database, "ledgers", appName, "trips", tripId, type));
      for (const entry of entries.docs) {
        if (type === "places") {
          await deleteDoc(doc(entry.ref, "googleLocations", "places-api"));
        }
        if (type === "imageAnalyses") {
          await deleteDoc(doc(entry.ref, "assets", "original"));
        }
        await deleteDoc(entry.ref);
      }
    }
    await deleteDoc(doc(tripsCollection, tripId));
    if (localStorage.getItem("active-trip-name") === tripName) localStorage.removeItem("active-trip-name");
  } catch (error) {
    console.error("Trip deletion failed:", error);
    alert("無法刪除行程，請確認網路連線後再試一次。");
    button.disabled = false;
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  createError.textContent = "";
  const data = new FormData(form);
  const name = String(data.get("name") || "").trim();
  const startDate = String(data.get("startDate") || "");
  const endDate = String(data.get("endDate") || "");
  if (!name) return;
  if (startDate && endDate && startDate > endDate) {
    createError.textContent = "結束日期不能早於開始日期。";
    return;
  }

  createButton.disabled = true;
  createButton.querySelector("span").textContent = "建立中…";
  try {
    const now = Date.now();
    const trip = await addDoc(tripsCollection, { name, startDate, endDate, createdAt: now, updatedAt: now });
    localStorage.setItem("active-trip-name", name);
    window.location.assign(`index.html?trip=${encodeURIComponent(trip.id)}`);
  } catch (error) {
    console.error("Trip creation failed:", error);
    createError.textContent = "無法建立行程，請確認網路連線後再試一次。";
    createButton.disabled = false;
    createButton.querySelector("span").textContent = "建立行程";
  }
});

document.getElementById("logout-btn").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async user => {
  if (!user || !isAllowed(user.email)) {
    if (user) await signOut(auth);
    window.location.replace("login.html");
    return;
  }

  try {
    await migrateLegacyData();
    onSnapshot(tripsCollection, snapshot => {
      renderTrips(snapshot.docs.map(entry => ({ id: entry.id, ...entry.data() })));
    }, error => {
      console.error("Trip subscription failed:", error);
      status.textContent = "無法載入行程，請重新整理頁面。";
    });
  } catch (error) {
    console.error("Legacy migration failed:", error);
    status.textContent = "無法載入既有資料，請重新整理頁面。";
  }
});