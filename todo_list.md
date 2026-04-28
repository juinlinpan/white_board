# Whiteboard Planner Todo List

## Navigation Update Notes

- [x] Make the workspace left page sidebar and right inspector collapsible with a persistent restore handle.
- [x] Opening a project from the home screen now lands on an actual page and creates a browser history entry.
- [x] The workspace left sidebar stays focused on page navigation and no longer shows a project details panel.
- [x] Rework the sidebar header into a `Planvas` / `Home` top row plus a divided `Project` summary row with a settings icon trigger.
- [x] Move all project controls into a dedicated settings modal that uses about 70% viewport width on desktop.
- [x] Move page rename into a pencil action beside each page row.
- [x] Refresh the page delete button beside each page row with a cleaner icon treatment.
- [x] Project delete now appears under the project name controls and requires typing `delete {project_name}` before returning to the home screen.
- [x] Added a project-level `Change theme color` dropdown above `Delete project`, with `default`, `sage`, `sunset`, and `ocean` themes persisted on each project.
- [x] Remove the old inline `Manage` panel from the left sidebar after moving project controls into the modal.
- [x] Treat browser file picker cancellation during Project / Page export as a normal cancel without showing an error banner.
- [x] Keep duplicate out of the left sidebar while allowing page rename and delete icon buttons there.
- [x] The workspace `Home` button now sits beside the `Planvas` heading.
- [x] Clicking `＋ 新增 Page` now creates `untitled_n` directly without a prompt dialog.

## Toolbar Menu Update Notes

- [x] Rework top toolbar into Office-like `檔案` / `編輯` clickable dropdown menus.
- [x] Move page `import` / `export` under the `檔案` dropdown.
- [x] Add hover-triggered right submenu under `export` to host current and future formats.
- [x] Keep `magnet` and `zoom` controls pinned to the far-right side of the toolbar.
- [x] Add a collapsed-by-default utility strip between workspace header and canvas, with an expand/collapse trigger.
- [x] Move `檔案` / `編輯` menus and grouped `magnet` / `zoom` / `背景` controls into the utility strip under a distinct `區分` section.
- [x] Keep the draggable toolbar focused on tool buttons only.

## Export And Read-Only Sharing Planning Notes

- [ ] Keep `JSON` export as the shared canonical snapshot source for future export targets.
- [x] Add `PNG` export for quick sharing, cropped to the visible item bounds instead of the whole canvas.
- [x] Add `PPTX` export with an initial `one page => one slide` mapping and defined raster fallback boundaries.
- [x] Change PPTX export to editable native objects: `table` -> PowerPoint table, `frame` -> footer rectangle + title textbox, others -> textbox with original colors where possible.
- [ ] Add a project-level read-only `viewer` export that recipients can open without installing the app or backend.
- [ ] Make the read-only `viewer` self-contained (prefer single HTML or equivalent packaging) so recipients are not required to run a local server.
- [ ] Reuse shared layout / summary rules across `PNG`, `PPTX`, and `viewer` outputs so frame summaries, text truncation, and hierarchy stay consistent.
- [ ] Add validation coverage for export cancellation, rendering fidelity basics, and generated viewer navigation.

## Zoom And Grid Update Notes

- [x] Keep the left page list zoom indicator in sync with live canvas zoom changes.
- [x] Add toolbar zoom controls for `-`, `+`, current zoom readout, and reset to `1.0x`.
- [x] Add a compact zoom reset-target control so reset can be changed in `0.1x` increments, for example `0.5x` or `1.5x`.
- [x] Keep `magnet` enabled by default when the canvas loads.
- [x] Remove nearby-item alignment and keep `magnet` for background-grid edge snapping during move / resize.
- [x] Snap newly created items and freeform `line` / `arrow` points to the background grid when `magnet` is enabled.
- [x] Add clear `X=0` / `Y=0` zero-axis guide lines on the canvas.

## Item Content Display Update Notes

- [x] Remove the `Markdown` badge from `note_paper` read mode.
- [x] Keep `text_box` read mode scrollbar-free and let it show as much text as the current size allows.
- [x] Make `note_paper` read mode scroll its body when markdown content overflows.
- [x] Prioritize the first Markdown `#` heading when a `note_paper` is too small to show both title and body comfortably.

## Table And Small-Item Sizing Update Notes

- [x] Raise the `table` dimension cap from `12 x 12` to `20 x 20`.
- [x] Make every `table` cell respect the minimum `text_box` size.
- [x] Reduce the minimum `text_box` width by two grid columns so it aligns with `sticky_note`.
- [x] Verify every board item minimum size, including `line`, `arrow`, and dynamic `table` minimum sizes, stays aligned to whole canvas grid units.
- [x] Snap internal `table` row and column divider dragging to the canvas grid when `magnet` is enabled, with `Alt` as the temporary bypass.

## Item Context Menu Update Notes

- [x] Split the canvas right-click menu into dedicated item and canvas variants.
- [x] Show `cut`, `copy`, `paste`, and `delete` when right-clicking a selected board item.
- [x] Add `move forward`, `move backward`, `bring to front`, and `send to back` into the selected-item right-click menu.
- [x] Remove z-index layer action buttons from the right inspector panel.
- [x] Keep canvas right-click focused on `paste` so empty-space context actions stay minimal.
- [x] Reuse the existing clipboard/delete handlers so right-click actions match keyboard shortcuts.
- [x] Cover the new context-menu action visibility and viewport clamping with tests.

## Table Text Layout And Inspector Update Notes

- [x] 移除 `table` 右下角的列 × 欄標籤顯示。
- [x] 讓 `text_box` 內容固定置中顯示。
- [x] 讓 `note_paper` 內容維持由左上到右下的閱讀流向。
- [x] 在右側 Inspector 為 `table` 新增 `文字` 區塊，集中文字相關調整。

## Minimap And New-Page Viewport Update Notes

- [x] 在 Canvas 右下角新增 mini map，顯示整張白板縮圖。
- [x] mini map 顯示目前 viewport 對應矩形框。
- [x] mini map 以各物件背景色圓點顯示分布。
- [x] 新增 Page 時預設 viewport 先落在約 80% 第一象限視角。

依照 `spec.md` 拆出的開發待辦，先以 MVP 為主，延後項目放到最後。

## MVP Todo

### 1. 專案基礎建置

- [x] 建立清楚的多目錄結構：`frontend/`、`backend/`
- [x] 建立 React + TypeScript + Vite 前端專案
- [x] 建立 Python 3.12 + FastAPI backend 專案
- [x] 建立 root scripts：`npm run dev`、`dev:frontend`、`dev:backend`、`build`、`lint`、`format`、`typecheck`、`check`
- [x] 固定前端 dev port `5173` 與 backend dev port `18000`
- [x] 建立 `GET /healthz` 與前端健康檢查頁
- [x] 建立 lint / formatter / type check
- [x] 建立 Windows preflight / bootstrap scripts，至少涵蓋 Python 3.12 與本機開發環境檢查

### 2. 本機資料與路徑規則

- [x] 定義 backend root 下的 `data/` 與 `logs/`
- [x] 設定 SQLite 路徑為 `<backend_root>/data/whiteboard.db`
- [x] 設定 log 路徑為 `<backend_root>/logs/`
- [x] 啟動時自動建立缺少的資料夾
- [x] 補上路徑初始化與錯誤處理

### 3. SQLite Schema

- [x] 建立 `projects` table
- [x] 建立 `pages` table
- [x] 建立 `board_items` table
- [x] 建立 `connector_links` table
- [x] 建立 migration 或 schema 初始化流程
- [x] 建立 DB 存取層
- [x] 補上關聯欄位與索引：`project_id`、`page_id`、`parent_item_id`

### 4. Backend API

- [x] 實作 Project CRUD API
- [x] 實作 Page CRUD API
- [x] 實作 board item CRUD API
- [x] 實作 connector CRUD API
- [x] 實作 Page viewport API
- [x] 實作 Page 全量載入 API
- [x] 實作 Page board state replace API（供 Undo / Redo 還原）
- [x] 統一 success response format
- [x] 統一 error format

### 5. Frontend App Shell

- [x] 建立整體 app layout
- [x] 實作首頁，集中提供 Project 選擇 / 建立 / 匯入入口
- [x] 實作左側 Project / Page 導覽
- [x] 提升左側導覽區對比與選取辨識
- [x] 實作中央白板區域
- [x] 實作基本工具列與側欄
- [x] 畫布背景預設點狀加深，提高一般顯示器上的可見度
- [x] 畫布右上角提供背景模式切換，可在點狀與格線間切換
- [x] 串接 backend API
- [x] 處理初次載入、空狀態與錯誤狀態

### 6. Project / Page UI

- [x] 啟動後先進入首頁，再進入工作區
- [x] 新增 Project
- [x] 匯入 Project JSON snapshot
- [x] 重新命名 Project
- [x] 刪除 Project
- [x] 以拖拉調整 Project 排序
- [x] 新增 Page
- [x] 重新命名 Page
- [x] 刪除 Page
- [x] 複製 Page
- [x] 在畫布 toolbar 的「檔案」群組提供 Page JSON export / import 按鈕
- [x] 支援匯入 Page JSON 到空白 Page，並在非空白 Page 以疊加方式匯入
- [x] Page JSON export 新增 `item_hierarchy` 樹狀從屬資料，並在 import 驗證與 `parent_item_id` 一致
- [x] 以拖拉調整 Page 排序
- [x] 切換 Page

### 7. 白板通用能力

- [x] 建立白板畫布
- [x] 支援拖曳與選取
- [x] 支援白板空白處框選，且僅選取完全包含於框選範圍內的物件
- [x] 支援 viewport 平移與縮放
- [x] 支援多選
- [x] 支援 resize
- [x] 支援 z-index 調整
- [x] 支援複製 / 貼上
- [x] 支援右鍵選單（白板物件與白板空白區）與剪下 / 複製 / 貼上 / 刪除
- [x] 支援 Delete
- [x] 支援 Undo / Redo
- [x] 支援自動儲存

### 8. 物件模型

- [x] 定義 item type 與 category 常數
- [x] 定義前後端共用 item model
- [x] 建立 toolbar 物件建立入口
- [x] 建立物件基本序列化 / 反序列化
- [x] 支援建立 `line`
- [x] 支援建立 `table`
- [x] 支援建立 `text_box`
- [x] 支援建立 `sticky_note`
- [x] 支援建立 `note_paper`
- [x] 支援建立 `frame`
- [x] 支援建立 `arrow`

### 9. `shape`

- [x] 放大 `line` / `arrow` 端點、折點與中段節點的滑鼠命中範圍，降低精準點擊需求

- [x] 拖曳已綁定 anchor 的 `line` / `arrow` 線身時會先 detach，再轉成 freeform segment 平移

- [x] `line` / freeform `arrow` 的命中區改為沿線段計算，不再讓整個外接矩形吃掉滑鼠事件
- [x] segment 可直接拖曳線身平移；已綁定 anchor 的 segment 在拖曳線身時會先 detach 再移動

- [x] 實作 `line`
- [x] 支援 `line` 以起點 / 終點控制長度與方向
- [x] 支援 `line` 拖曳端點調整
- [x] 支援 `line` 樣式設定
- [x] 實作 `table`
- [x] 支援列數 / 欄數調整（舊版 Inspector；現已改為白板內 inline 操作）
- [x] 支援儲存 table 內容
- [x] 支援 table 樣式設定
- [x] **重設計 table v2**：全新資料模型 (`colWidths`/`rowHeights`/merge spans)
- [x] 支援點一下工具列 `table` 按鈕後，以該點為固定原點顯示 `1 × 1` 預覽，滑鼠往右 / 下移動可擴張成 `n × m`，再點一下才建立表格
- [x] 支援選取 table 後拖曳分格線調整列寬 / 欄高（zoom-agnostic fraction resize）
- [x] 支援選取 table 後在直線 / 橫線上懸停並按 `+` 新增 row / col
- [x] 支援滑鼠懸停分格線顯示新增 row / col 的 + 鈕（浮起動畫）
- [x] 支援滑鼠框選多格並顯示「合併」按鈕
- [x] 支援橫向 / 縱向分割已合併的儲存格
- [x] 支援把 `small_item`（text_box、sticky_note、note_paper）拖進儲存格吸附（類 frame 邏輯）
- [x] 支援 table resize 時同步 relayout 儲存格內已吸附的 `small_item`
- [x] 支援儲存格 embedded item 展開 / 折疊預覽
- [x] 支援向前相容解析舊版 `string[][]` 格式
- [x] 支援分格線群組化：hover 時相連整條線一起高亮 + 中央顯示 `+`
- [x] 支援合併儲存格造成的分格線獨立性（不連續的上下 / 左右線段各自獨立拖曳）
- [x] 支援合併後儲存格視為新實體，不再回復原本被覆蓋格子的 identity
- [x] 支援分割後線段獨立性（新產生的中間線段以目前合併格邊界重建，不回到原始欄列，也不自動與鄰行 / 鄰列重新連成同一群組）
- [x] 支援最外圍擴增 table 時保留既有欄列獨立分格線結構，且原有區域 pixel layout exact 不變
- [x] 儲存格改為 absolute positioning 排版，支援各行列分格線獨立偏移與顯式斷點
- [x] 刪除 row / col 時改為縮小 table 外框，不放大其他未受影響儲存格；刪中間時兩側直接併鄰
- [x] 刪除 row / col 後同步重排 cell 內 child items，讓其跟隨新儲存格位置移動

- [x] table 僅在最外層邊框提供整體選取與移動游標；點擊表格內部直接反白單格，按住拖曳可延伸為多格選取
- [x] table 反白單格或多格時，右側 Inspector 既有背景色可直接套用到反白儲存格（不新增彈出色彩選單）

### 10. `small_item`

- [x] 實作 `text_box`
- [x] 支援 `text_box` 內容編輯
- [x] 實作 `sticky_note`
- [x] 支援 `sticky_note` 固定背景色票與固定文字色票
- [x] 實作 `note_paper`
- [x] 支援 Markdown 儲存
- [x] 支援 `note_paper` 基本預覽

### 11. `frame`

- [x] 實作 `frame`
- [x] 支援 `frame` 移動
- [x] 支援 `frame` resize
- [x] 支援 `frame` 展開 / 縮回
- [x] 支援把 `small_item` 放入 `frame`
- [x] 支援把 `small_item` 從 `frame` 移出
- [x] 支援 frame 內物件版面更新
- [x] 支援縮回摘要資料計算
- [x] 支援展開中的 `frame` 在 overlap 達門檻時進入 focus mode
- [x] 支援 oversized `small_item` 吸入前自動縮放到 `frame` 60% fit budget
- [x] 支援 `small_item` 進出 `frame` 的短動畫回饋
- [x] 支援 `small_item` 離開 `frame` 後自動彈到明確的 frame 外位置，避免停在邊界中間
- [x] 支援 `frame` 內 item 可重疊，但仍強制完整留在 frame 內容區
- [x] 支援從 `frame` 拖出 item 時，若未完整移出則自動彈回 frame 內

### 12. 縮回摘要規則

- [x] `text_box` 縮回時顯示完整文字
- [x] `sticky_note` 縮回時顯示部分文字
- [x] `note_paper` 縮回時只顯示第一個 Markdown H1
- [x] 若沒有 H1，定義 fallback 顯示規則
- [x] 定義 frame 縮回摘要的樣式與排序

### 13. `arrow`

- [x] 實作 `arrow`
- [x] 支援 `arrow` 以起點 / 終點建立
- [x] 支援 `arrow` 拖曳建立方向與長度
- [x] 支援 `arrow` 拖曳端點調整
- [x] 支援 `arrow` 基本線條樣式
- [x] 支援 `arrow` / `line` 磁性錨點吸附（draw.io 風格 connector anchor）
- [x] 支援已連結的 `arrow` / `line` 端點在物件移動時即時跟隨

### 14. Magnet / 網格吸附

- [x] 實作基礎 magnet 網格吸附
- [x] 定義 magnet 容忍距離
- [x] 僅在 magnet 開啟時吸附背景網格
- [x] 支援按住 `Alt` 暫時停用 magnet
- [x] 實作 connector anchor 磁性吸附指示器（anchor indicator）

### 15. 右側編輯面板

- [x] 根據選取物件顯示不同內容
- [x] 顯示位置資訊
- [x] 顯示尺寸資訊
- [x] 顯示樣式欄位
- [x] 顯示文字或內容設定
- [x] 支援固定背景色 7 選與固定文字色票
- [x] 支援基本字體樣式
- [x] 顯示目前物件型別

### 16. 快捷鍵

- [x] `Delete` 刪除
- [x] `Ctrl/Cmd + C` 複製
- [x] `Ctrl/Cmd + X` 剪下
- [x] `Ctrl/Cmd + V` 貼上
- [x] `Ctrl/Cmd + Z` Undo
- [x] `Ctrl/Cmd + Shift + Z` Redo
- [x] `Space + Drag` 平移畫布

### 17. 本機啟動與部署流程

- [x] 定義 frontend / backend 的本機啟動流程
- [x] 規劃前端靜態檔正式提供方式
- [x] 初始化 `data/` 與 `logs/`
- [x] 文件化設定、啟動與備份流程
- [x] 補上基本 smoke test

### 18. 驗收測試

- [x] 驗收 Project / Page CRUD
- [x] 驗收物件建立 / 編輯 / 刪除
- [x] 驗收 frame 展開 / 縮回
- [x] 驗收縮回摘要規則
- [x] 驗收 frame overlap focus mode / auto-ingest / auto-fit / enter-exit animation
- [x] 驗收 item 放手後只會明確落在 frame 內或外，不會停在邊界半卡住
- [x] 驗收 frame 內 item 可重疊但不會部分超出 frame
- [x] 驗收 item 從 frame 拖出失敗時會自動彈回 frame 內
- [x] 驗收 line / arrow 起終點建立與控制點調整
- [x] 驗收 magnet 網格吸附
- [x] 驗收 Undo / Redo
- [x] 驗收本機持久化
- [x] 對照 `spec.md` 驗收條件逐項確認

## 延後項目

### 19. 進階內容功能

- [x] Markdown rich preview
- [x] Undo / Redo 歷史優化

### 20. 連線資料整理

- [ ] 清理或重構 legacy `connector_links` 的前後端流程，避免與新的自由箭頭模型混淆

### 21. 匯出與唯讀分享

- [ ] 抽出共用 export pipeline，統一讀取 Page / Project snapshot、viewport、背景與 item hierarchy
- [x] 定義 PNG 匯出 UI 與裁切規則：自動輸出有物件的區域
- [x] 實作 PNG 匯出並補上基本視覺驗收
- [x] 研究並選定 PPTX 產生方案，確認瀏覽器端或 backend 端的責任邊界
- [x] 定義 PPTX slide layout、字型 / 色彩對應與 raster fallback 規則
- [x] 實作 PPTX 匯出並驗證多種 item 組合
- [ ] 定義 Project viewer 封裝格式與檔名規則
- [ ] 實作唯讀 viewer shell（Page list、畫布渲染、pan / zoom）
- [ ] 確保 viewer 可離線開啟且不依賴 FastAPI、SQLite 或雲端服務
- [ ] 文件化分享流程與限制（唯讀、無回存、相容性範圍）

## 建議實作順序

1. 專案基礎建置
2. SQLite Schema 與 backend CRUD
3. Frontend App Shell 與 Project / Page UI
4. 白板通用能力
5. 物件模型與各型別實作
6. Snap、connector 與驗收
7. 本機部署流程與測試
