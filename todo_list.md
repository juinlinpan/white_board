# Whiteboard Planner Todo List

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
- [x] 實作左側 Project / Page 導覽
- [x] 提升左側導覽區對比與選取辨識
- [x] 實作中央白板區域
- [x] 實作基本工具列與側欄
- [x] 串接 backend API
- [x] 處理初次載入、空狀態與錯誤狀態

### 6. Project / Page UI

- [x] 新增 Project
- [x] 重新命名 Project
- [x] 刪除 Project
- [x] 以拖拉調整 Project 排序
- [x] 新增 Page
- [x] 重新命名 Page
- [x] 刪除 Page
- [x] 複製 Page
- [x] 以拖拉調整 Page 排序
- [x] 切換 Page

### 7. 白板通用能力

- [x] 建立白板畫布
- [x] 支援拖曳與選取
- [x] 支援 viewport 平移與縮放
- [x] 支援多選
- [x] 支援 resize
- [x] 支援 z-index 調整
- [x] 支援複製 / 貼上
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

- [x] 實作 `line`
- [x] 支援 `line` 以起點 / 終點控制長度與方向
- [x] 支援 `line` 拖曳端點調整
- [x] 支援 `line` 樣式設定
- [x] 實作 `table`
- [x] 支援列數 / 欄數調整
- [x] 支援儲存 table 內容
- [x] 支援 table 樣式設定

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
- [x] 支援 `arrow` / `line` 磁性錨點吸附（draw.io 風格 connector anchor snap）
- [x] 支援已連結的 `arrow` / `line` 端點在物件移動時即時跟隨

### 14. Snap / 對齊

- [x] 實作基礎 snap 規則
- [x] 實作對齊輔助線
- [x] 實作對齊到其他白板物件
- [x] 實作對齊到 frame 邊界
- [x] 定義 snap 容忍距離
- [x] 支援可調整的 snap 設定
- [x] 支援暫時停用 snap
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
- [x] 驗收 line / arrow 起終點建立與控制點調整
- [x] 驗收 snap 對齊
- [x] 驗收 Undo / Redo
- [x] 驗收本機持久化
- [x] 對照 `spec.md` 驗收條件逐項確認

## 延後項目

### 19. 進階內容功能

- [x] Markdown rich preview
- [x] Undo / Redo 歷史優化

### 20. 連線資料整理

- [ ] 清理或重構 legacy `connector_links` 的前後端流程，避免與新的自由箭頭模型混淆

## 建議實作順序

1. 專案基礎建置
2. SQLite Schema 與 backend CRUD
3. Frontend App Shell 與 Project / Page UI
4. 白板通用能力
5. 物件模型與各型別實作
6. Snap、connector 與驗收
7. 本機部署流程與測試
