# 旅遊分帳

## Firebase 設定

1. 在 Firebase Console 建立專案，新增 Web App，並把設定值填入 `firebase-config.js`。
2. 在 Authentication 的 Sign-in method 啟用 Google，並在 Authentication 的 Settings 加入網站使用的授權網域。
3. 建立 Cloud Firestore 資料庫。
4. 在 Firestore Rules 貼上 `firestore.rules` 的內容並發布。
5. 將 `firebase-config.js` 的 `allowedEmails` 和 `firestore.rules` 內的 Email 都改為可使用此帳本的 Google 帳號。

瀏覽器需以本機伺服器或正式 HTTPS 網址開啟，不能直接雙擊 HTML 檔案。在專案根目錄安裝依賴並啟動 Vite：

```powershell
npm install
npm run dev
```

本機網址為 `http://localhost:5000/login.html`。登入後會先進入行程清單，可選擇、建立或刪除行程。正式網站先執行 `npm run build`，或直接執行 `npm run deploy` 建置並部署 Hosting。

行程資料存放於 `ledgers/travel-split-app/trips/{tripId}`，各行程的支出、代付、景點與圖片辨識紀錄位於該文件下的子集合。升級後第一次開啟行程清單時，舊版單一帳本資料會複製到「北海道之旅」。