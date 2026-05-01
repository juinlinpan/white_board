# AGENTS.md

## Storage Update Notes

- `.pv_project` is a directory, not a file.
- Project metadata lives at `<project_dir>/.pv_project/metadata.json`.
- Page XML files live under `<project_dir>/.pv_project/`.

這個檔案是本專案給 Codex 的固定啟動指引。每次開啟新的 Codex session，應先閱讀本檔，再閱讀 [spec.md](./spec.md) 與 [todo_list.md](./todo_list.md)，並確認本輪需求還會影響哪些其他文件。

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
- Persistence: file-based Planvas project storage

補充限制：

- 這是一個本機優先的單人 web app
- 不再預設包含桌面殼或 Tauri
- backend 啟動目錄必須可寫入
- Project 預設儲存根目錄必須位於 `<user_home>/.planvas/`
- 每個 Project 是一個工作路徑：`<user_home>/.planvas/<project_name>/`
- 每個 Project 目錄必須包含 `.pv_project/` 資料夾
- 每個 Project 的 metadata 必須儲存在 `.pv_project/metadata.json`
- 每個 Project 的 Page XML 檔案必須儲存在 `.pv_project/` 底下
- Log 必須位於 `<backend_root>/logs/`
- 不預設依賴雲端服務

## 3. 每次 session 必讀文件與文件盤點

每次開始處理需求、改 code、調整規格前，都要先閱讀以下文件：

1. [spec.md](./spec.md)
2. [todo_list.md](./todo_list.md)

用途分工：

- `spec.md` 是產品需求、資料模型、系統架構與驗收條件的主文件
- `todo_list.md` 是開發待辦、MVP 範圍與建議實作順序

如果兩者衝突：

- 以 `spec.md` 為準
- 接著必須同步修正 `todo_list.md`

開始實作前，還必須先做一次「受影響文件盤點」：

- 確認本輪需求是否也影響 `README.md`、`backend/README.md` 或其他新增文件
- 確認哪些文件屬於產品規格、哪些屬於開發待辦、哪些屬於操作或部署文件
- 只要本輪需求會改變事實描述、操作方式、驗收條件、開發順序、限制或範圍，就必須把對應文件列入同一輪修改範圍

如果專案未來新增文件：

- 要先判斷該文件是否屬於本專案的正式規格、待辦、操作、部署、測試或架構文件
- 若屬於長期維護的重要文件，必須補進本檔的必讀文件或相關說明

## 4. 文件維護規則

Codex 在這個專案中，不只可以閱讀 `spec.md` 與 `todo_list.md`，也可以在必要時直接編輯所有受本次需求影響的文件。

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

應編輯其他文件的情況：

- `README.md`、`backend/README.md` 或其他操作文件：當啟動方式、環境需求、路徑、指令、部署方式、備份方式、測試方式有變動
- 測試或驗收相關文件：當驗收流程、測試範圍、測試前置條件有變動
- 架構或模組說明文件：當模組責任、資料流、資料夾結構、整合方式有變動
- 新增文件：當需求已經被拆到新的文件承載，就要同步維護該文件，不可放著過期

文件同步原則：

- 不能只更新程式碼，不更新對應文件
- 不能只更新其中一份文件，讓其他文件維持過期狀態
- 只要本輪需求改變「事實」，所有描述該事實的文件都必須一起更新
- 若需求變動影響範圍大，先更新 `spec.md`，再更新其他受影響文件，最後再改程式
- 若 `spec.md`、`todo_list.md`、README 或其他文件互相衝突，必須在同一輪修正到一致

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
4. 盤點本輪需求影響到哪些其他文件，例如 `README.md`、`backend/README.md` 或未來新增文件
5. 確認本次需求是新增功能、修正 bug、還是更新規格
6. 若需求影響規格、排程、操作方式、測試方式或架構描述，先更新文件再改程式，或至少在同一輪一併更新

## 7. 實作原則

- 預設先以 MVP 為優先
- 不要先做多人協作、雲端同步、權限系統
- 優先確保白板核心互動可用
- 優先確保本機 `.planvas` 檔案儲存與本機啟動流程可用
- 文件與實作要持續對齊

## 8. 備註

若未來新增更多規格文件、操作文件、架構文件或驗收文件，應在本檔一併補上：

- 哪些屬於每次 session 必讀文件
- 哪些情況下必須同步更新
- 它們與 `spec.md`、`todo_list.md`、README 之間的關係

Codex 不應把文件更新視為附帶工作，而應視為需求完成的一部分。只要需求有修改，相關文件就必須一起修改完成。
