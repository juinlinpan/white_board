# AGENTS.md

這個檔案是本專案給 Codex 的固定啟動指引。每次開啟新的 Codex session，應先閱讀本檔，再閱讀 [spec.md](./spec.md) 與 [todo_list.md](./todo_list.md)。

## 1. 專案背景

這是一個為了替代公司無法採購的商業軟體而自行開發的本機優先白板工具。

主要使用情境：

- brainstorming
- sprint 工作分配
- roadmap 規劃
- 專案頁面式整理

產品方向是 local-first，重點在單人規劃效率，而不是第一版就做多人協作平台。

## 2. 固定技術要求

以下技術決策預設視為已定案，除非使用者明確要求變更：

- Frontend: `React + TypeScript`
- Backend: `Python 3.12 + FastAPI`
- Database: `SQLite`

補充限制：

- 這是一個本機優先的單人 web app
- 不再預設包含桌面殼或 Tauri
- backend 啟動目錄必須可寫入
- SQLite 必須位於 `<backend_root>/data/whiteboard.db`
- Log 必須位於 `<backend_root>/logs/`
- 不預設依賴雲端服務

## 3. 每次 session 必讀文件

每次開始處理需求、改 code、調整規格前，都要先閱讀以下文件：

1. [spec.md](./spec.md)
2. [todo_list.md](./todo_list.md)

用途分工：

- `spec.md` 是產品需求、資料模型、系統架構與驗收條件的主文件
- `todo_list.md` 是開發待辦、MVP 範圍與建議實作順序

如果兩者衝突：

- 以 `spec.md` 為準
- 接著必須同步修正 `todo_list.md`

## 4. 文件維護規則

Codex 在這個專案中，不只可以閱讀 `spec.md` 與 `todo_list.md`，也可以在必要時直接編輯它們。

應編輯 `spec.md` 的情況：

- 使用者調整產品需求
- 使用者調整技術架構
- 發現原規格有矛盾、遺漏或模糊處
- 新增或修改驗收條件

應編輯 `todo_list.md` 的情況：

- 新增開發工作項目
- 重排實作順序
- 將需求拆成更細的工程任務
- 移動 MVP / 延後項目邊界

編輯原則：

- 保持 `spec.md` 與 `todo_list.md` 一致
- 不要只改其中一份導致失配
- 若需求變動影響範圍大，先更新 `spec.md`，再更新 `todo_list.md`

## 5. 功能核心摘要

目前產品核心能力如下：

- 支援多個 `Project`
- 每個 `Project` 底下支援多個 `Page`
- 每個 `Page` 是白板
- 白板物件包含 `line`、`table`、`text_box`、`sticky_note`、`note_paper`、`frame`、`arrow`

物件分類規則：

- `line`、`table` 屬於 `shape`
- `text_box`、`sticky_note`、`note_paper` 屬於 `small_item`
- `frame` 屬於 `large_item`
- `arrow` 屬於 `connector`

重要互動規則：

- 所有類別都可自由擺放
- `frame` 可容納 `small_item`
- `frame` 可展開 / 縮回
- `frame` 縮回時，`text_box` 顯示完整文字
- `frame` 縮回時，`sticky_note` 顯示部分文字
- `frame` 縮回時，`note_paper` 只顯示第一個 Markdown H1
- 白板要有磁鐵對齊功能
- `arrow` 可連結所有 `small_item` 與 `large_item`

## 6. 工作方式

在這個專案中，Codex 應遵守以下工作順序：

1. 先讀 `AGENTS.md`
2. 再讀 `spec.md`
3. 再讀 `todo_list.md`
4. 確認本次需求是新增功能、修正 bug、還是更新規格
5. 若需求影響規格或排程，先更新文件再改程式，或至少在同一輪一併更新

## 7. 實作原則

- 預設先以 MVP 為優先
- 不要先做多人協作、雲端同步、權限系統
- 優先確保白板核心互動可用
- 優先確保本機 SQLite 與本機啟動流程可用
- 文件與實作要持續對齊

## 8. 備註

若未來新增更多規格文件，應在本檔一併補上「每次 session 必讀文件」清單。
