# Whiteboard Planning App Spec

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

- 建立 Project
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

- 可自由拖曳
- 以起點與終點定義線段，而非以旋轉矩形作為主要互動模型
- 可直接拖曳控制點調整起點、終點、長度與方向
- 可設定基本樣式

### 5.6 `table`

- 可自由拖曳
- 可調整列數與欄數
- 儲存表格文字內容
- 支援基本樣式

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

### 5.11 `arrow`

- 以起點與終點定義箭頭，而非以矩形框或物件連結作為主要互動模型
- 建立時應可像 draw.io 一樣以拖曳方式決定方向與長度
- 可直接拖曳控制點調整起點、終點、長度與方向
- 可設定基本線條樣式
- 起點與終點可連結至物件的磁性錨點（connector anchor），連結關係存放於 `data_json` 中的 `startConnection` / `endConnection`
- 被連結物件移動時，已連結的 `arrow` 與 `line` 端點會自動跟隨

### 5.12 對齊與磁吸

白板應支援 snap：

- 物件與物件對齊
- 物件與 frame 邊界對齊
- 顯示對齊輔助線
- 支援可調整的 snap 容忍距離

### 5.13 連接器磁性錨點（Connector Anchor）

當使用 `line` 或 `arrow` 工具時：

- 游標靠近可連結物件時，物件四邊中點會顯示錨點指示器（小圓圈）
- 可連結物件類型包含：`text_box`、`sticky_note`、`note_paper`、`frame`、`table`
- 拖曳 `line` / `arrow` 的起點或終點時，靠近錨點會自動吸附（磁性 snap）
- 吸附閾值為 24px
- 錨點分為四個基本方位：`top`、`right`、`bottom`、`left`
- 連結關係記錄於 segment 的 `data_json` 中，格式為 `{ itemId: string, anchor: string }`
- 被連結物件在拖曳移動時，連結的 segment 端點即時跟隨

## 6. 使用流程

典型操作流程：

1. 建立 Project
2. 在 Project 底下建立一到多個 Page
3. 在 Page 中建立 frame、note、table、arrow
4. 拖曳與排版內容
5. 存回 SQLite

## 7. UX 原則

- 左側提供 Project / Page 導覽，且需有明顯區塊層次與足夠對比
- 中間是白板主區域
- 右側或浮動面板負責物件設定
- 快捷鍵至少支援 `Delete`、`Ctrl/Cmd + C`、`Ctrl/Cmd + V`、`Ctrl/Cmd + Z`、`Ctrl/Cmd + Shift + Z`

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
- drag / resize / select / snap
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
- `text_box`、`sticky_note`、`note_paper`
- `frame`
- `arrow`
- snap 對齊
- SQLite 持久化
- 本機前後端啟動流程

延後項目：

- Markdown rich preview
- table 進階排版
- Undo / Redo 歷史優化
- 多人協作

## 13. 驗收條件

驗收至少需包含：

1. 可建立、重新命名、刪除 Project
2. 可在 Project 下建立、重新命名、刪除、切換 Page
3. Page 中可建立至少 `text_box`、`sticky_note`、`note_paper`、`frame`、`arrow`
4. 物件可拖曳、resize、選取與排序
5. `frame` 可展開 / 縮回，且縮回摘要規則正確
6. `line` 與 `arrow` 可像 draw.io 一樣以起點 / 終點建立，且可拖曳控制點調整
7. snap 對齊可用
8. 資料可寫入並重讀 SQLite
9. 前端可成功呼叫 `GET /healthz`
10. 背景色與文字色只能從系統提供的固定色票中選擇

## 14. 建議實作順序

1. 前後端基礎建置與 `GET /healthz`
2. SQLite schema 與 backend CRUD
3. Frontend app shell 與 Project / Page 導覽
4. 白板畫布與基本互動
5. 物件型別逐步補齊
6. snap 與連線
7. SQLite 持久化與驗收測試
