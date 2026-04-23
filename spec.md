# Whiteboard Planning App Spec

## Navigation Update Notes

- The workspace left page sidebar and right inspector must both support collapse / expand toggles while keeping a visible restore handle.
- Opening a `Project` from the dedicated home screen must create a browser history entry and enter a concrete `Page` immediately.
- If the target project is already loaded in memory, the workspace should keep the current page when possible and otherwise fall back to that project's first page.
- The workspace left sidebar should stay focused on page navigation and should not render a project details panel.
- Basic project name editing should happen in the top workspace header.
- Basic page name editing should happen in the top workspace header.
- Page delete action should be shown as a trash button on the right side of the workspace header.
- The left sidebar should not render page rename / duplicate / delete action buttons.
- The workspace `Home` button belongs in the sidebar header, positioned to the right of the `Whiteboard` title.

## Zoom And Grid Update Notes

- The left workspace page list must reflect the active page zoom immediately while the user changes zoom in the canvas.
- The toolbar must expose a zoom utility cluster with `-`, `+`, a current zoom readout in `x.x` format, and a `1.0x` reset action.
- `magnet` should be enabled by default when the canvas loads.
- `magnet` snaps item edges to the background grid lines while moving or resizing.
- When `magnet` is enabled, newly created items and freeform `line` / `arrow` points should also snap to the background grid unless they attach to an item anchor.
- Holding `Alt` while moving or resizing should temporarily pause `magnet`.

## Item Content Display Update Notes

- `note_paper` read mode should not show a dedicated `Markdown` badge above the content.
- When a `text_box` becomes too small to show all text, it should keep showing as much text as fits without introducing a scrollbar.
- When a `note_paper` becomes too small to show all markdown content, the body area should scroll instead of clipping the whole note.
- When a `note_paper` has very limited space, the read view should prioritize the first Markdown `#` heading before showing lower-priority body blocks.

## Table And Small-Item Sizing Update Notes

- `table` must support up to `20 x 20` cells.
- Every `table` cell must stay at least as large as the minimum `text_box` size.
- The minimum `text_box` width should be reduced by two grid columns so it aligns with `sticky_note` width.

## Item Context Menu Update Notes

- After left-clicking to select a board item, right-clicking that item must open an item context menu.
- The item context menu must provide basic item actions: `cut`, `copy`, `paste`, and `delete`.
- Right-clicking an unselected item may first move selection onto that item, then open the same item context menu.
- Right-clicking empty canvas space should keep a lighter canvas context menu that exposes `paste` only.
- Context-menu actions must stay aligned with the existing keyboard shortcuts so both entry points trigger the same behavior.

## 1. 產品定位

這是一個 local-first 的單人白板規劃工具，預設在使用者自己的電腦上以本機前後端服務方式運作，而不是桌面殼應用。

主要使用情境：

- brainstorming
- sprint 工作分配
- roadmap 規劃
- 專案頁面式整理

第一版重點是把單人規劃流程做順，不做多人協作、雲端同步或權限系統。

## 2. 固定技術決策

### Frontend

使用 **React + TypeScript**。

理由：

- 白板、canvas、drag-drop、選取、多狀態互動都適合用 React 建立可維護的 UI
- TypeScript 對白板物件、狀態與 API 契約有明顯幫助

### Backend

使用 **Python 3.12 + FastAPI**。

理由：

- Python 在資料處理與本機工具開發上成本低
- FastAPI 適合提供本機 HTTP API，讓前端透過明確介面存取資料

### Database

使用 **SQLite**。

理由：

- 單機本機資料儲存成本低
- 不依賴外部服務
- 適合 MVP 階段

## 3. 範圍

### In Scope

- Project 管理
- 首頁提供 Project 選擇、建立與匯入入口
- 每個 Project 底下多個 Page
- 每個 Page 是一張白板
- 白板物件的建立、編輯、刪除、移動、縮放、排序
- SQLite 本機持久化
- 本機前後端啟動流程

### Out of Scope

- 多人協作
- 雲端同步
- 權限系統
- 帳號登入
- 行動裝置專用版本

## 4. 核心資料結構

### 4.1 主體

- 一個 App 內可以有多個 `Project`
- 一個 `Project` 內可以有多個 `Page`
- 一個 `Page` 內可以有多個白板物件

### 4.2 物件分類

#### `shape`

- `line`
- `table`

#### `small_item`

- `text_box`
- `sticky_note`
- `note_paper`

#### `large_item`

- `frame`

#### `connector`

- `arrow`

## 5. 功能需求

### 5.1 Project

使用者可以：

- 啟動後先看到首頁
- 從首頁選擇既有 Project 進入工作區
- 建立 Project
- 從 JSON 檔匯入 Project
- 重新命名 Project
- 刪除 Project
- 以拖拉調整 Project 排序
- 切換目前 Project

Project 至少包含：

- `id`
- `name`
- `created_at`
- `updated_at`
- `sort_order`

Project 匯入規則：

- 首頁提供匯入入口
- 匯入檔案格式為 JSON snapshot
- 匯入時會建立新的本機 Project，不覆寫既有 Project
- 匯入時需重建 Page、board item 與 connector 的本機 id，避免與既有 SQLite 資料衝突

### 5.2 Page

每個 Project 底下可以：

- 建立 Page
- 重新命名 Page
- 刪除 Page
- 複製 Page
- 以拖拉調整 Page 排序
- 切換 Page

Page 至少包含：

- `id`
- `project_id`
- `name`
- `viewport_x`
- `viewport_y`
- `zoom`
- `created_at`
- `updated_at`
- `sort_order`

### 5.3 白板通用能力

每個 Page 內的白板應支援：

- 物件建立、刪除、移動
- 物件 resize
- z-index 排序
- 多選
- 白板空白處可滑鼠框選；僅將「完全包含於框選範圍」的物件加入選取，並可一起拖曳移動
- Undo / Redo
- 本機持久化
- 具背景的物件背景色只能從 7 個預設柔和底色中選擇
- 文字色只能從少量高飽和預設色票中選擇

### 5.4 各物件型別

支援以下白板物件：

- `line`
- `table`
- `text_box`
- `sticky_note`
- `note_paper`
- `frame`
- `arrow`

### 5.5 `line`

- `line` / `arrow` 的端點、折點與中段加點節點應提供較大的滑鼠命中範圍，避免必須精準壓在小圓點上才能操作

- 拖曳已綁定 connector anchor 的 `line` 線身時，系統應立即 detach，轉成 freeform segment 後再平移

- `line` 的可操作區不得等於整個外接矩形；命中區應以線段本身的 stroke width 再加上少量容錯寬度計算
- `line` 可直接拖曳線身做平移；若端點已綁定其他物件，拖曳線身時應先 detach 再平移

- 可自由拖曳
- 以起點與終點定義線段，而非以旋轉矩形作為主要互動模型
- 可直接拖曳控制點調整起點、終點、長度與方向
- 可設定基本樣式

### 5.6 `table`

- 點一下工具列的 `table` 新增按鈕後，需以該按下位置作為固定原點，在其右下方顯示一個 `1 × 1` 小表格預覽；滑鼠自該原點持續往右 / 下移動時，預覽需依目前滑鼠位置即時擴張為 `n × m`，再點一下才真正以該列欄數建立表格
- 可自由拖曳
- 資料模型：`TableData`，包含 `colWidths`（分欄寬度分數）、`rowHeights`（列高分數）、`cells`（`TableCellData | null` 二維陣列）
- 儲存格支援 `rowSpan` / `colSpan`（合併後的儲存格單元）
- 儲存格可以嵌入一個 `small_item` 快照（`embed` 欄位，含 type / content / styleJson）
- 選取 table 後可拖曳表格分格線調整列寬 / 欄高（以容器百分比分數計算，zoom-agnostic）
- 選取 table 後，滑鼠懸停分格線時顯示 `+` 按鈕（浮起動畫）可在該位置插入新的 row 或 col
- 雙擊儲存格可編輯文字
- 滑鼠框選多格後顯示「合併」按鈕，合併為單一儲存格（`rowSpan` / `colSpan` > 1）
- 已合併儲存格可按橫向 / 縱向分割恢復
- 可把 `small_item`（`text_box`、`sticky_note`、`note_paper`）拖進儲存格吸附（類 `frame` 吸入邏輯）：item 從畫布刪除，內容存入儲存格的 `embed` 欄位
- 表格 resize 時，儲存格內已吸附的 `small_item` 必須跟著依最新 cell bounds 同步重新排版與縮放，並維持留在原本儲存格內
- 嵌入物件的儲存格支援折疊（顯示摘要）/ 展開（顯示完整內容）切換
- 向前相容：可解析舊版 `string[][]` 格式並自動轉換為新格式
- Inspector 顯示目前列數 / 欄數與已填格數（唯讀）；列欄操作改為白板內 inline 操作
- 分格線群組互動：滑鼠懸停時，**相連的整條線段**一起加粗高亮，並在該群組中央顯示 `+` 按鈕；可直接拖曳整條線段進行列寬 / 欄高調整
- 合併語意：儲存格一旦合併，視為**新的獨立儲存格實體**；不再保留或回復原本被覆蓋格子的 identity
- 分格線獨立性：若有左右（或上下）合併儲存格，被合併儲存格中斷的上下（或左右）分格線視為**獨立線段群組**，各自有各自的位移自由度，不會互相關聯
- 分割後線段獨立性：已合併儲存格再次分割時，新產生的儲存格視為新的格子；新產生的中間分格線以**目前合併格的邊界**重新計算，不需回到原本欄列位置，也不應自動與上下 / 左右原本線段重新連成同一群組
- 外圍擴增語意：從表格最外圍新增 row / col 時，應擴張 table 外框，不應回頭重排既有欄列的獨立分格線結構；原有區域的像素大小、分格線位置與 cell layout 必須維持 **exact 不變**
- 刪除 row / col 語意：刪除後應以「表格外框縮小」為主，而不是重算讓其他格子放大；若刪的是邊緣 row / col，直接剃除該邊；若刪的是中間 row / col，兩側格子直接相鄰形成合併視覺，其他未受影響格子的像素尺寸維持不變
- 刪除 row / col 後，位於其他儲存格內的 `small_item` 需跟著新 cell layout 同步位移與重排，不可留在舊位置
- 儲存格以 absolute positioning 排版，各行列的分格線位置可因群組拖曳而獨立偏移（資料模型中以 `colDividerPositions` / `rowDividerPositions` 記錄每段分格線的位置覆寫，並以 `colDividerBreaks` / `rowDividerBreaks` 記錄不得自動連續的線段斷點）

- table 只允許透過最外層邊框選取整個物件與顯示移動游標；滑鼠位於表格內部時，單擊應直接反白單格，按住拖曳應可延伸為多格選取
- table 內反白一格或多格時，不可跳出額外色彩選單；右側 Inspector 既有背景色控制應直接套用到被反白儲存格

### 5.7 `text_box`

- 可自由拖曳
- 可直接編輯文字
- 縮回 frame 時仍顯示完整文字

### 5.8 `sticky_note`

- 可自由拖曳
- 可編輯內容
- 縮回 frame 時只顯示部分文字

### 5.9 `note_paper`

- 內容格式為 Markdown
- 顯示模式先以文字編輯與基本預覽為主
- 縮回 frame 時只顯示第一個 Markdown H1

### 5.10 `frame`

- 可自由拖曳與 resize
- 可容納多個 `small_item`
- 可展開 / 縮回
- 展開時顯示內部完整內容
- 縮回時依內部物件型別顯示摘要
- 展開中的 `frame` 需支援拖曳吸入 `small_item`
- 當被拖曳物件與 `frame` 的重疊比例大於 25%（以物件面積或 frame 面積任一方計算達標）時，`frame` 進入 focus mode，並顯示微幅浮起動畫
- 在 focus mode 下放開滑鼠時，物件必須自動完整吸入 `frame`
- 若吸入時物件過大，需先等比縮放到不超過 `frame` 寬高的 60% 再收入
- 物件從 `frame` 內拖出時，也要有對應的退出動畫
- 放開滑鼠後，`small_item` 的最終狀態必須明確落在 `frame` 內或 `frame` 外，不可停留在邊界中間卻仍被計為 `frame` 內容
- `frame` 內部允許物件彼此重疊，不需要自動避讓
- 只要物件仍屬於某個 `frame`，其可見範圍不得有任何一部分超出該 `frame` 內容區
- 物件從 `frame` 內拖出時，只有在最終位置完整離開原本 `frame` 後才算成功移出；若未完整離開，必須自動彈回 `frame` 內

### 5.11 `arrow`

- 拖曳已綁定 connector anchor 的 `arrow` 線身時，系統應立即 detach，轉成 freeform segment 後再平移；legacy connector arrow 也適用同一規則

- `arrow` 的可操作區同樣不得使用整個外接矩形；命中區應沿著箭線本體計算，並保留少量操作容錯寬度
- `arrow` 可直接拖曳線身做平移；若端點已綁定其他物件，拖曳線身時應先 detach 再平移

- 以起點與終點定義箭頭，而非以矩形框或物件連結作為主要互動模型
- 建立時應可像 draw.io 一樣以拖曳方式決定方向與長度
- 可直接拖曳控制點調整起點、終點、長度與方向
- 可設定基本線條樣式
- 起點與終點可連結至物件的磁性錨點（connector anchor），連結關係存放於 `data_json` 中的 `startConnection` / `endConnection`
- 被連結物件移動時，已連結的 `arrow` 與 `line` 端點會自動跟隨

### 5.12 對齊與磁吸

白板應支援 magnet：

- 物件與物件對齊
- 物件與 frame 邊界對齊
- 顯示對齊輔助線
- 預設為開啟
- 僅在 `magnet` 開啟時對齊背景網格
- 按住 `Alt` 拖曳時可暫時停用 `magnet`

### 5.13 連接器磁性錨點（Connector Anchor）

當使用 `line` 或 `arrow` 工具時：

- 游標靠近可連結物件時，物件四邊中點會顯示錨點指示器（小圓圈）
- 可連結物件類型包含：`text_box`、`sticky_note`、`note_paper`、`frame`、`table`
- 拖曳 `line` / `arrow` 的起點或終點時，靠近錨點會自動吸附到 connector anchor
- 吸附閾值為 24px
- 錨點分為四個基本方位：`top`、`right`、`bottom`、`left`
- 連結關係記錄於 segment 的 `data_json` 中，格式為 `{ itemId: string, anchor: string }`
- 被連結物件在拖曳移動時，連結的 segment 端點即時跟隨

## 6. 使用流程

典型操作流程：

1. 啟動後先進入首頁
2. 從首頁選擇既有 Project，或建立 / 匯入新的 Project
3. 在 Project 底下建立一到多個 Page
4. 在 Page 中建立 frame、note、table、arrow
5. 拖曳與排版內容
6. 存回 SQLite

## 7. UX 原則

- 啟動後先顯示首頁，集中放置 Project 選擇、建立與匯入入口
- 左側提供 Project / Page 導覽，且需有明顯區塊層次與足夠對比
- 中間是白板主區域
- 右側或浮動面板負責物件設定
- 快捷鍵至少支援 `Delete`、`Ctrl/Cmd + C`、`Ctrl/Cmd + X`、`Ctrl/Cmd + V`、`Ctrl/Cmd + Z`、`Ctrl/Cmd + Shift + Z`
- 白板物件與白板空白區都支援右鍵選單，並提供 `剪下`、`複製`、`貼上`、`刪除` 基本操作；不可用動作需以 disabled 呈現
- 白板背景預設為較高對比的點狀底圖，避免在一般螢幕上難以辨識
- 白板右上角要提供背景模式切換，至少支援 `點狀` 與 `格線` 兩種顯示

## 8. 資料模型

### 8.1 `projects`

- `id`
- `name`
- `sort_order`
- `created_at`
- `updated_at`

### 8.2 `pages`

- `id`
- `project_id`
- `name`
- `sort_order`
- `viewport_x`
- `viewport_y`
- `zoom`
- `created_at`
- `updated_at`

### 8.3 `board_items`

- `id`
- `page_id`
- `parent_item_id`
- `category`
- `type`
- `title`
- `content`
- `content_format`
- `x`
- `y`
- `width`
- `height`
- `rotation`
- `z_index`
- `is_collapsed`
- `style_json`
- `data_json`
- `created_at`
- `updated_at`

補充：

- `line` 與 `arrow` 的起點 / 終點資料應存放於 `data_json`
- `x`、`y`、`width`、`height` 仍可作為命中、選取與拖曳所需的包圍盒

### 8.4 `connector_links`

- `id`
- `connector_item_id`
- `from_item_id`
- `to_item_id`
- `from_anchor`
- `to_anchor`

`connector_links` 可暫時保留供既有資料相容或未來擴充，但 MVP 的 `arrow` 與 `line` 已改用 `data_json` 中的 `startConnection` / `endConnection` 欄位記錄磁性錨點連結，不再依賴此表作為主要互動方式。

## 9. 系統架構

### 9.1 組成

- `frontend-web-ui`: React + TypeScript + Vite
- `backend-service`: Python FastAPI
- `database`: SQLite

### 9.2 本機開發介面

- Frontend dev server: `http://127.0.0.1:5173`
- Backend dev server: `http://127.0.0.1:18000`
- Health endpoint: `GET http://127.0.0.1:18000/healthz`

### 9.3 前後端責任

Frontend：

- 白板 UI
- drag / resize / select / magnet
- Project / Page 導覽
- API 呼叫與狀態同步

Backend：

- Project / Page CRUD
- board item CRUD
- connector CRUD
- Page board state replace API（供 Undo / Redo 還原使用）
- SQLite 存取
- 健康檢查與基本設定

## 10. 本機檔案路徑

本專案不再以桌面安裝路徑為核心，而是以 backend 執行根目錄為主。

### 10.1 Backend Root

開發期預設為 `backend/`。
啟動時必須驗證 backend root 可寫入；若 `data/`、`logs/` 或必要檔案無法建立，應明確回報初始化錯誤。

### 10.2 SQLite 路徑

SQLite 必須位於：

`<backend_root>/data/whiteboard.db`

### 10.3 Log 路徑

Log 必須位於：

- `<backend_root>/logs/app.log`
- `<backend_root>/logs/backend.log`

## 11. 非功能需求

- App 啟動後 5 秒內應能完成基礎載入
- 300 個白板物件的 Page 不應明顯卡頓
- 所有核心資料必須可持久化到本機 SQLite
- 關閉並重新啟動後，資料應可正確回復

## 12. MVP 範圍

MVP 至少包含：

- Project / Page 管理
- 首頁與 Project JSON 匯入
- `text_box`、`sticky_note`、`note_paper`
- `frame`
- `arrow`
- magnet 網格吸附
- SQLite 持久化
- 本機前後端啟動流程

延後項目：

- Markdown rich preview
- table 進階排版
- Undo / Redo 歷史優化
- 多人協作

## 13. 驗收條件

驗收至少需包含：

- 展開中的 `frame` 對 `small_item` 提供 overlap-based focus mode，並在滑鼠放開時可自動吸入
- 過大的 `small_item` 進入 `frame` 前，會先縮放到不超過 frame 寬高的 60%
- `small_item` 進入與離開 `frame` 時，都有可辨識的短動畫回饋
- `small_item` 從 `frame` 離開後，最終位置會被明確彈到 frame 外，不會停在邊界半內半外
- `frame` 內的 item 可重疊，但不允許部分超出 frame 內容區
- 從 `frame` 嘗試拖出 item 時，若未完整移出，放手後會自動彈回 frame 內

1. 啟動前端後先進入首頁，且可從首頁選擇既有 Project
2. 可建立、重新命名、刪除 Project，並可從 JSON 匯入新的 Project
3. 可在 Project 下建立、重新命名、刪除、切換 Page
4. Page 中可建立至少 `text_box`、`sticky_note`、`note_paper`、`frame`、`arrow`
5. 物件可拖曳、resize、選取與排序
6. `frame` 可展開 / 縮回，且縮回摘要規則正確
7. `line` 與 `arrow` 可像 draw.io 一樣以起點 / 終點建立，且可拖曳控制點調整
8. magnet 網格吸附可用
9. 資料可寫入並重讀 SQLite
10. 前端可成功呼叫 `GET /healthz`
11. 背景色與文字色只能從系統提供的固定色票中選擇

## 14. 建議實作順序

1. 前後端基礎建置與 `GET /healthz`
2. SQLite schema 與 backend CRUD
3. Frontend app shell 與 Project / Page 導覽
4. 白板畫布與基本互動
5. 物件型別逐步補齊
6. magnet 與連線
7. SQLite 持久化與驗收測試
