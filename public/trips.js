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
const usersCollection = collection(database, "ledgers", appName, "users");
const legacyTypes = ["expenses", "payments", "places", "imageAnalyses"];

const list = document.getElementById("trip-list");
const status = document.getElementById("trip-status");
const count = document.getElementById("trip-count");
const form = document.getElementById("create-trip-form");
const createButton = document.getElementById("create-trip-btn");
const createError = document.getElementById("create-error");
const memberAccountsContainer = document.getElementById("trip-member-accounts");
let authorizedAccounts = [];

renderIcons();

function isAllowed(email) {
  return Boolean(email) && allowedEmails.some(value => value.toLowerCase() === email.toLowerCase());
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function accountDisplayName(account) {
  return account.displayName || account.email.replace(/@gmail\.com$/i, "");
}

function tripArtwork(name = "") {
  const palettes = [
    { background: "#d8ece1", foreground: "#195c3d" },
    { background: "#dcebea", foreground: "#0d625e" },
    { background: "#f4e4bf", foreground: "#7a4d08" },
    { background: "#f2d9d2", foreground: "#8a3f2f" },
    { background: "#dae5f2", foreground: "#315b80" },
    { background: "#eaddec", foreground: "#6a406d" }
  ];
  const normalizedName = String(name).trim();
  const hash = [...normalizedName].reduce((total, character) => total + character.codePointAt(0), 0);
  return {
    initial: [...normalizedName][0] || "旅",
    palette: palettes[hash % palettes.length]
  };
}

function tripMemberAvatar(member) {
  const email = String(member.email || member.id || "").toLowerCase();
  const account = authorizedAccounts.find(candidate => candidate.email === email);
  const name = account?.displayName || String(member.name || email).replace(/@gmail\.com$/i, "");
  const photoURL = account?.photoURL || member.photoURL;
  const content = photoURL
    ? `<img src="${escapeHtml(photoURL)}" alt="" referrerpolicy="no-referrer" />`
    : escapeHtml(name.slice(0, 1).toUpperCase());
  return `<span class="trip-member-avatar" title="${escapeHtml(name)}" aria-label="${escapeHtml(name)}">${content}</span>`;
}

function tripMemberStack(trip) {
  const tripMembers = Array.isArray(trip.members) ? trip.members : [];
  if (!tripMembers.length) return "";
  const visibleMembers = tripMembers.slice(0, 3).map(tripMemberAvatar).join("");
  const remainder = tripMembers.length > 3 ? `<span class="trip-member-more">+${tripMembers.length - 3}</span>` : "";
  return `<span class="trip-member-stack" aria-label="${tripMembers.length} 位旅程成員">${visibleMembers}${remainder}</span>`;
}

function renderMemberAccounts() {
  const selected = new Set([...memberAccountsContainer.querySelectorAll('input[name="memberEmail"]:checked')].map(input => input.value));
  memberAccountsContainer.innerHTML = authorizedAccounts.map((account, index) => {
    const checked = selected.size ? selected.has(account.email) : index < 10;
    const displayName = accountDisplayName(account);
    const avatar = account.photoURL
      ? `<img src="${escapeHtml(account.photoURL)}" alt="" referrerpolicy="no-referrer" />`
      : escapeHtml(displayName.slice(0, 1).toUpperCase());
    return `<label class="member-account-option">
      <input type="checkbox" name="memberEmail" value="${escapeHtml(account.email)}" ${checked ? "checked" : ""} />
      <span class="member-avatar" aria-hidden="true">${avatar}</span>
      <span class="member-account-copy"><span class="member-account-name">${escapeHtml(displayName)}</span></span>
    </label>`;
  }).join("");
}

async function loadAuthorizedAccounts(user) {
  const email = user.email.toLowerCase();
  const profile = { email, updatedAt: Date.now() };
  if (user.displayName?.trim()) profile.displayName = user.displayName.trim();
  if (user.photoURL) profile.photoURL = user.photoURL;
  await setDoc(doc(usersCollection, email), profile, { merge: true });

  const profiles = await getDocs(usersCollection);
  const profileByEmail = new Map(profiles.docs.map(entry => {
    const data = entry.data();
    return [String(data.email || entry.id).toLowerCase(), data];
  }));
  authorizedAccounts = allowedEmails.map(allowedEmail => {
    const normalizedEmail = allowedEmail.toLowerCase();
    return { email: normalizedEmail, ...profileByEmail.get(normalizedEmail) };
  });
  renderMemberAccounts();
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
        <span class="trip-mark" style="--trip-mark-bg: ${tripArtwork(trip.name).palette.background}; --trip-mark-ink: ${tripArtwork(trip.name).palette.foreground}" aria-hidden="true">${escapeHtml(tripArtwork(trip.name).initial)}</span>
        <span class="trip-copy">
          <span class="trip-name">${escapeHtml(trip.name)}</span>
          <span class="trip-meta"><span class="trip-members-label">${Array.isArray(trip.members) ? trip.members.length : 2} 人同行</span>${tripMemberStack(trip)}</span>
        </span>
        <i class="trip-arrow" data-lucide="chevron-right" aria-hidden="true"></i>
      </a>
      <button class="delete-button" type="button" data-delete-trip="${escapeHtml(trip.id)}" data-trip-name="${escapeHtml(trip.name)}" aria-label="刪除${escapeHtml(trip.name)}" title="刪除行程">
        <i data-lucide="trash-2" aria-hidden="true"></i>
      </button>
    </article>`).join("");
  renderIcons(list);

  list.querySelectorAll("[data-trip-id]").forEach(link => link.addEventListener("click", () => {
    localStorage.setItem("active-trip-id", link.dataset.tripId);
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
    if (localStorage.getItem("active-trip-id") === tripId) {
      localStorage.removeItem("active-trip-id");
      localStorage.removeItem("active-trip-name");
    }
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
  const selectedEmails = [...memberAccountsContainer.querySelectorAll('input[name="memberEmail"]:checked')].map(input => input.value);
  if (!name) return;
  if (selectedEmails.length < 2) {
    createError.textContent = "請至少選擇 2 位 Google 帳號。";
    return;
  }
  if (selectedEmails.length > 10) {
    createError.textContent = "每個旅程最多選擇 10 位成員。";
    return;
  }

  createButton.disabled = true;
  createButton.querySelector("span").textContent = "建立中…";
  try {
    const now = Date.now();
    const members = selectedEmails.map(selectedEmail => {
      const account = authorizedAccounts.find(candidate => candidate.email === selectedEmail);
      return { id: selectedEmail, name: accountDisplayName(account), email: selectedEmail, photoURL: account?.photoURL || "" };
    });
    const trip = await addDoc(tripsCollection, { name, members, schemaVersion: 2, createdAt: now, updatedAt: now });
    localStorage.setItem("active-trip-id", trip.id);
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
    await loadAuthorizedAccounts(user);
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