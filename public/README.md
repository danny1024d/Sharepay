# 旅遊分帳

## Firebase 設定

1. 在 Firebase Console 建立專案，新增 Web App，並把設定值填入 `firebase-config.js`。
2. 在 Authentication 的 Sign-in method 啟用 Google，並在 Authentication 的 Settings 加入網站使用的授權網域。
3. 建立 Cloud Firestore 資料庫。
4. 在 Firestore Rules 貼上 `firestore.rules` 的內容並發布。
5. 在 `config/allowed-emails.json` 維護可使用此帳本的 Google 帳號；執行開發、建置或部署指令時，前端白名單與 `firestore.rules` 會自動同步。

瀏覽器需以本機伺服器或正式 HTTPS 網址開啟，不能直接雙擊 HTML 檔案。在專案根目錄安裝依賴並啟動 Vite：

```powershell
npm install
npm run dev
```

本機網址為 `http://localhost:5000/login.html`。登入後會先進入行程清單，可選擇、建立或刪除行程。正式網站先執行 `npm run build`，或直接執行 `npm run deploy` 建置並部署 Hosting。

## 授權帳號管理

授權 Email 只有一個維護來源：專案根目錄的 `config/allowed-emails.json`。新增或移除帳號時，只修改這個 JSON 陣列，不要直接編輯 `public/allowed-emails.js` 或 `firestore.rules` 中標示為自動產生的 Email 區段。

```json
[
	"first@gmail.com",
	"second@gmail.com"
]
```

同步程式會驗證 Email 格式、轉為小寫並拒絕重複帳號，然後產生前端白名單及更新 Firestore Rules。可依需求執行：

```powershell
npm run sync:access # 只同步白名單檔案
npm run dev         # 啟動前自動同步
npm run build       # 建置前自動同步
npm run deploy      # 自動同步、建置並部署 Hosting 與 Firestore Rules
```

建議修改白名單後直接執行 `npm run deploy`，確保前端登入檢查與 Firestore 存取規則同時上線。

行程資料存放於 `ledgers/travel-split-app/trips/{tripId}`。建立行程時需從授權的 Google 帳號中選擇 2–10 位成員；成員以 Email 作為穩定 ID，並把 Google 顯示名稱、Email 與頭像資料儲存在行程文件的 `members` 陣列。

授權帳號登入後會在 `ledgers/travel-split-app/users/{email}` 登記最新的 Google 顯示名稱與頭像。尚未以新版登入過的授權帳號會先以 Email 顯示，登入一次後即自動更新。

各行程的支出、代付、景點與圖片辨識紀錄位於該文件下的子集合。支出以 `payerId` 與 `splitWeights` 記錄付款人及每位成員的分攤權重，代付則以 `payerId` 與 `debtorId` 記錄雙方。金額使用整數與最大餘數法分配，確保分類、成員與總金額一致。

升級後第一次開啟行程清單時，舊版單一帳本資料會複製到「北海道之旅」。第一次進入舊行程時，系統會以可重複執行的批次補上成員 ID 與分攤欄位；原有的 `payer`、`ratios`、`debtor` 與金額欄位都會保留，不會刪除或覆寫。

舊版成員會依固定對應整理為 Google 帳號：`高 → zzdanny781024@gmail.com`、`n → ben155373@gmail.com`。遷移會同步重映射支出的 `payerId`、`splitWeights` 與代付的 `payerId`、`debtorId`，但保留舊文字欄位供核對；權重總和與所有金額不變。