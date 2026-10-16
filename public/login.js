import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { allowedEmails, firebaseConfig } from "./firebase-config.js";
import { renderIcons } from "./icons.js";

const googleButton = document.getElementById("btn-google");
const errorMessage = document.getElementById("error-msg");
const hasFirebaseConfig = !Object.values(firebaseConfig).some(value => value.includes("YOUR_"));
renderIcons();

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove("hidden");
}

function isAllowed(email) {
  return Boolean(email) && allowedEmails.map(value => value.toLowerCase()).includes(email.toLowerCase());
}

if (!hasFirebaseConfig) {
  googleButton.disabled = true;
  showError("請先在 firebase-config.js 填入 Firebase 網頁設定與授權 Email。");
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  onAuthStateChanged(auth, async user => {
    if (!user) return;
    if (!isAllowed(user.email)) {
      await signOut(auth);
      showError("此 Google 帳號尚未獲授權使用本分帳。 ");
      return;
    }
    window.location.replace("trips.html");
  });

  googleButton.addEventListener("click", async () => {
    errorMessage.classList.add("hidden");
    googleButton.disabled = true;
    googleButton.textContent = "登入中...";
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      if (error.code !== "auth/popup-closed-by-user") {
        showError("無法登入，請確認 Firebase Authentication 已啟用 Google 登入方式後再試一次。");
      }
    } finally {
      googleButton.disabled = false;
      googleButton.innerHTML = '<svg class="google-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>使用 Google 帳號登入';
    }
  });
}