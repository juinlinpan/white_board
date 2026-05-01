# Whiteboard Planner Todo List

## Persistence Redesign Notes

- [x] Replace SQLite-backed repository persistence with file-based Planvas project storage.
- [x] Add default Planvas root resolution at `<user_home>/.planvas/`, with `WHITEBOARD_PLANVAS_ROOT` override.
- [x] Store each Project as a working directory containing `.pv_project/metadata.json` and one XML file per Page under `.pv_project/`.
- [x] Add `<user_home>/.planvas/project.json` as the common project path index.
- [x] Add `<user_home>/.planvas/project_store/<project_name>/` as the default location for newly created projects.
- [x] Add `.pv_project/` data directory creation for initialized Project directories.
- [x] Add Project path opening / registration for external folders without recreating existing Planvas metadata.
- [x] Refresh Project listing so missing registered paths are detected and `project_store` projects are shown before other paths.
- [x] Preserve existing backend HTTP API shapes while replacing the underlying storage engine.
- [x] Update backend tests for Planvas storage initialization and restart persistence.
- [x] Replace DB access with a filesystem repository.

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
- [x] Home now shows `Create Project`, `Open Project`, and `Refresh`; project JSON import is removed from the home screen.
- [x] Home project list is grouped into `project_store` projects first and other registered paths second.
- [x] Home missing-path projects can be removed from `project.json` after Refresh.
- [x] Clicking `嚗??啣? Page` now creates `untitled_n` directly without a prompt dialog.

## Toolbar Menu Update Notes

- [x] Rework top toolbar into Office-like `瑼?` / `蝺刻摩` clickable dropdown menus.
- [x] Move page `import` / `export` under the `瑼?` dropdown.
- [x] Add hover-triggered right submenu under `export` to host current and future formats.
- [x] Keep `magnet` and `zoom` controls pinned to the far-right side of the toolbar.
- [x] Replace the right-upper floating utility strip with the expandable canvas header ribbon.
- [x] Group `瑼?`, `蝺刻摩`, and `瑼Ｚ?` in the expanded header ribbon, with `magnet` / `zoom` / `?` under `瑼Ｚ?`.
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

- [x] 蝘駁 `table` ?喃?閫???? 甈?蝐日＊蝷箝?
- [x] 霈?`text_box` ?批捆?箏?蝵桐葉憿舐內??
- [x] 霈?`note_paper` ?批捆蝬剜??勗椰銝?喃??霈瘚???
- [x] ?典??Inspector ??`table` ?啣? `??` ?憛??葉???賊?隤踵??

## Minimap And New-Page Viewport Update Notes

- [x] ??Canvas ?喃?閫憓?mini map嚗＊蝷箸撘萇?輻葬??
- [x] mini map 憿舐內?桀? viewport 撠??拙耦獢?
- [x] mini map 隞亙??拐辣??脣?暺＊蝷箏?撣?
- [x] ?啣? Page ??閮?viewport ??函? 80% 蝚砌?鞊⊿?閬???

靘 `spec.md` ????澆?颲佗??誑 MVP ?箔蜓嚗辣敺??格?唳?敺?

## MVP Todo

### 1. 撠??箇?撱箇蔭

- [x] 撱箇?皜????桅?蝯?嚗frontend/`?backend/`
- [x] 撱箇? React + TypeScript + Vite ?垢撠?
- [x] 撱箇? Python 3.12 + FastAPI backend 撠?
- [x] 撱箇? root scripts嚗npm run dev`?dev:frontend`?dev:backend`?build`?lint`?format`?typecheck`?check`
- [x] ?箏??垢 dev port `5173` ??backend dev port `18000`
- [x] 撱箇? `GET /healthz` ??蝡臬摨瑟炎?仿?
- [x] 撱箇? lint / formatter / type check
- [x] 撱箇? Windows preflight / bootstrap scripts嚗撠項??Python 3.12 ?璈??潛憓炎??

### 2. ?祆?鞈??楝敺???

- [x] Initialize `.planvas` project storage and `logs/` runtime output.
- [x] Planvas file storage uses `<user_home>/.planvas/<project_name>/.pv_project/metadata.json` and page XML files under `.pv_project/`.
- [x] 閮剖? log 頝臬???`<backend_root>/logs/`
- [x] ????遣蝡撩撠?鞈?憭?
- [x] 鋆?頝臬??????航炊??

### 3. Planvas File Storage

- [x] Store Project records in `<project_name>/.pv_project/metadata.json`.
- [x] Store Page records in the Project metadata page list.
- [x] Store board items inside each Page XML file.
- [x] Store connector links inside each Page XML file.
- [x] Keep page / item / connector ids stable inside metadata and XML files.
- [x] Replace DB access with a filesystem repository.
- [x] 鋆??甈??揣撘?`project_id`?page_id`?parent_item_id`

### 4. Backend API

- [x] 撖虫? Project CRUD API
- [x] 撖虫? Page CRUD API
- [x] 撖虫? board item CRUD API
- [x] 撖虫? connector CRUD API
- [x] 撖虫? Page viewport API
- [x] 撖虫? Page ?券?頛 API
- [x] 撖虫? Page board state replace API嚗? Undo / Redo ??嚗?
- [x] 蝯曹? success response format
- [x] 蝯曹? error format

### 5. Frontend App Shell

- [x] 撱箇??湧? app layout
- [x] 撖虫?擐?嚗?銝剜?靘?Project ?豢? / 撱箇? / ?臬?亙
- [x] 撖虫?撌血 Project / Page 撠汗
- [x] ??撌血撠汗?撠???儘霅?
- [x] 撖虫?銝剖亢?賣???
- [x] 撖虫??箸撌亙???湔?
- [x] ?怠???身暺??楛嚗?擃??祇＊蝷箏銝??航?摨?
- [x] ?怠??喃?閫?靘??舀芋撘????臬暺??蝺???
- [x] 銝脫 backend API
- [x] ???活頛?征????航炊???

### 6. Project / Page UI

- [x] ??敺??脣擐?嚗??脣撌乩??
- [x] ?啣? Project
- [x] ?臬 Project JSON snapshot
- [x] ??賢? Project
- [x] ?芷 Project
- [x] 隞交??矽??Project ??
- [x] ?啣? Page
- [x] ??賢? Page
- [x] ?芷 Page
- [x] 銴ˊ Page
- [x] ?函撣?toolbar ??獢黎蝯?靘?Page JSON export / import ??
- [x] ?舀?臬 Page JSON ?啁征??Page嚗蒂?券?蝛箇 Page 隞亦??撘??
- [x] Page JSON export ?啣? `item_hierarchy` 璅寧?敺惇鞈?嚗蒂??import 撽???`parent_item_id` 銝??
- [x] 隞交??矽??Page ??
- [x] ?? Page

### 7. ?賣??賢?

- [x] 撱箇??賣?怠?
- [x] ?舀????
- [x] ?舀?賣蝛箇???賂?銝??詨?摰??潭??貊???隞?
- [x] ?舀 viewport 撟喟宏?葬??
- [x] ?舀憭
- [x] ?舀 resize
- [x] ?舀 z-index 隤踵
- [x] ?舀銴ˊ / 鞎潔?
- [x] ?舀?喲?詨嚗?輻隞嗉??賣蝛箇?嚗??芯? / 銴ˊ / 鞎潔? / ?芷
- [x] ?舀 Delete
- [x] ?舀 Undo / Redo
- [x] ?舀?芸??脣?

### 8. ?拐辣璅∪?

- [x] 摰儔 item type ??category 撣豢
- [x] 摰儔??蝡臬??item model
- [x] 撱箇? toolbar ?拐辣撱箇??亙
- [x] 撱箇??拐辣?箸摨???/ ????
- [x] ?舀撱箇? `line`
- [x] ?舀撱箇? `table`
- [x] ?舀撱箇? `text_box`
- [x] ?舀撱箇? `sticky_note`
- [x] ?舀撱箇? `note_paper`
- [x] ?舀撱箇? `frame`
- [x] ?舀撱箇? `arrow`

### 9. `shape`

- [x] ?曉之 `line` / `arrow` 蝡舫???暺?銝剜挾蝭暺?皛??賭葉蝭?嚗?雿移皞???瘙?

- [x] ?撌脩?摰?anchor ??`line` / `arrow` 蝺澈????detach嚗?頧? freeform segment 撟喟宏

- [x] `line` / freeform `arrow` ?銝剖??寧瘝輻?畾菔?蝞?銝?霈???亦敶Ｗ???曌?隞?
- [x] segment ?舐?交??喟?頨怠像蝘鳴?撌脩?摰?anchor ??segment ?冽??喟?頨急??? detach ?宏??

- [x] 撖虫? `line`
- [x] ?舀 `line` 隞亥絲暺?/ 蝯??批?瑕漲???
- [x] ?舀 `line` ?蝡舫?隤踵
- [x] ?舀 `line` 璅??閮剖?
- [x] 撖虫? `table`
- [x] ?舀? / 甈隤踵嚗???Inspector嚗撌脫?箇?踹 inline ??嚗?
- [x] ?舀?脣? table ?批捆
- [x] ?舀 table 璅??閮剖?
- [x] **?身閮?table v2**嚗?啗??芋??(`colWidths`/`rowHeights`/merge spans)
- [x] ?舀暺?銝極?瑕? `table` ??敺?隞亥府暺?箏???憿舐內 `1 ? 1` ?汗嚗?曌???/ 銝宏??游撐??`n ? m`嚗?暺?銝?撱箇?銵冽
- [x] ?舀?詨? table 敺??喳??潛?隤踵?祝 / 甈?嚗oom-agnostic fraction resize嚗?
- [x] ?舀?詨? table 敺?渡? / 璈怎?銝?蒂??`+` ?啣? row / col
- [x] ?舀皛??詨??蝺＊蝷箸憓?row / col ??+ ??瘚株絲?嚗?
- [x] ?舀皛?獢憭銝阡＊蝷箝?雿萸???
- [x] ?舀璈怠? / 蝮勗??撌脣?雿萇??脣???
- [x] ?舀??`small_item`嚗ext_box?ticky_note?ote_paper嚗??脣摮?賊?嚗? frame ?摩嚗?
- [x] ?舀 table resize ??甇?relayout ?脣??澆撌脣?? `small_item`
- [x] ?舀?脣???embedded item 撅? / ???汗
- [x] ?舀???詨捆閫???? `string[][]` ?澆?
- [x] ?舀?蝺黎蝯?嚗over ???璇?銝韏琿?鈭?+ 銝剖亢憿舐內 `+`
- [x] ?舀?蔥?脣??潮????潛??函??改?銝????銝?/ 撌血蝺挾??函??嚗?
- [x] ?舀?蔥敺摮閬?啣祕擃?銝??儔?鋡怨??摮? identity
- [x] ?舀?敺?畾萇蝡改??啁??銝剝?蝺挾隞亦??雿菜???遣嚗????甈?嚗?銝???啗? / ?啣???????蝢斤?嚗?
- [x] ?舀?憭??游? table ??????蝡??潛?蝯?嚗??????pixel layout exact 銝?
- [x] ?脣??潭??absolute positioning ??嚗?游?銵??蝺蝡?蝘餉?憿臬??琿?
- [x] ?芷 row / col ??箇葬撠?table 憭?嚗??曉之?嗡??芸?敶梢?脣??潘??芯葉???拙?湔雿菟
- [x] ?芷 row / col 敺?甇仿???cell ??child items嚗??嗉??冽?脣??潔?蝵桃宏??

- [x] table ??憭惜?????湧??詨??宏?虜璅?暺?銵冽?折?湔??格嚗?雿??喳撱嗡撓?箏??潮??
- [x] table ??格???潭?嚗??Inspector ?Ｘ???脣?湔憟?啣??賢摮嚗??啣?敶?脣蔗?詨嚗?

### 10. `small_item`

- [x] 撖虫? `text_box`
- [x] ?舀 `text_box` ?批捆蝺刻摩
- [x] 撖虫? `sticky_note`
- [x] ?舀 `sticky_note` ?箏???脩巨?摰?摮蟡?
- [x] 撖虫? `note_paper`
- [x] ?舀 Markdown ?脣?
- [x] ?舀 `note_paper` ?箸?汗

### 11. `frame`

- [x] 撖虫? `frame`
- [x] ?舀 `frame` 蝘餃?
- [x] ?舀 `frame` resize
- [x] ?舀 `frame` 撅? / 蝮桀?
- [x] ?舀??`small_item` ?曉 `frame`
- [x] ?舀??`small_item` 敺?`frame` 蝘餃
- [x] ?舀 frame ?抒隞嗥??Ｘ??
- [x] ?舀蝮桀???鞈?閮?
- [x] ?舀撅?銝剔? `frame` ??overlap ??瑼餅??脣 focus mode
- [x] ?舀 oversized `small_item` ?詨??葬?曉 `frame` 60% fit budget
- [x] ?舀 `small_item` ?脣 `frame` ????
- [x] ?舀 `small_item` ?ａ? `frame` 敺???唳?蝣箇? frame 憭?蝵殷??踹????銝剝?
- [x] ?舀 `frame` ??item ?舫???雿?撘瑕摰? frame ?批捆?
- [x] ?舀敺?`frame` ? item ???交摰蝘餃?????frame ??

### 12. 蝮桀???閬?

- [x] `text_box` 蝮桀??＊蝷箏??湔?摮?
- [x] `sticky_note` 蝮桀??＊蝷粹??摮?
- [x] `note_paper` 蝮桀??憿舐內蝚砌???Markdown H1
- [x] ?交???H1嚗?蝢?fallback 憿舐內閬?
- [x] 摰儔 frame 蝮桀????見撘???

### 13. `arrow`

- [x] 撖虫? `arrow`
- [x] ?舀 `arrow` 隞亥絲暺?/ 蝯?撱箇?
- [x] ?舀 `arrow` ?撱箇??孵??摨?
- [x] ?舀 `arrow` ?蝡舫?隤踵
- [x] ?舀 `arrow` ?箸蝺?璅??
- [x] ?舀 `arrow` / `line` 蝤折暺??draw.io 憸冽 connector anchor嚗?
- [x] ?舀撌脤????`arrow` / `line` 蝡舫??函隞嗥宏???單?頝

### 14. Magnet / 蝬脫?賊?

- [x] 撖虫??箇? magnet 蝬脫?賊?
- [x] 摰儔 magnet 摰孵?頝
- [x] ? magnet ??????舐雯??
- [x] ?舀?? `Alt` ?急?? magnet
- [x] 撖虫? connector anchor 蝤批??蝷箏嚗nchor indicator嚗?

### 15. ?喳蝺刻摩?Ｘ

- [x] ?寞??詨??拐辣憿舐內銝??批捆
- [x] 憿舐內雿蔭鞈?
- [x] 憿舐內撠箏站鞈?
- [x] 憿舐內璅??甈?
- [x] 憿舐內???摰寡身摰?
- [x] ?舀?箏????7 ?貉??箏????脩巨
- [x] ?舀?箸摮?璅??
- [x] 憿舐內?桀??拐辣?

### 16. 敹急??

- [x] `Delete` ?芷
- [x] `Ctrl/Cmd + C` 銴ˊ
- [x] `Ctrl/Cmd + X` ?芯?
- [x] `Ctrl/Cmd + V` 鞎潔?
- [x] `Ctrl/Cmd + Z` Undo
- [x] `Ctrl/Cmd + Shift + Z` Redo
- [x] `Space + Drag` 撟喟宏?怠?

### 17. ?祆????蝵脫?蝔?

- [x] 摰儔 frontend / backend ?璈???蝔?
- [x] 閬??垢??瑼迤撘?靘撘?
- [x] Initialize `.planvas` project storage and `logs/` runtime output.
- [x] ?辣?身摰????遢瘚?
- [x] 鋆??箸 smoke test

### 18. 撽皜祈岫

- [x] 撽 Project / Page CRUD
- [x] 撽?拐辣撱箇? / 蝺刻摩 / ?芷
- [x] 撽 frame 撅? / 蝮桀?
- [x] 撽蝮桀???閬?
- [x] 撽 frame overlap focus mode / auto-ingest / auto-fit / enter-exit animation
- [x] 撽 item ?暹?敺??蝣箄??frame ?扳?憭?銝?????雿?
- [x] 撽 frame ??item ?舫???銝??典?頞 frame
- [x] 撽 item 敺?frame ?憭望????芸?敶? frame ??
- [x] 撽 line / arrow 韏瑞?暺遣蝡??批暺矽??
- [x] 撽 magnet 蝬脫?賊?
- [x] 撽 Undo / Redo
- [x] 撽?祆?????
- [x] 撠 `spec.md` 撽璇辣??蝣箄?

## 撱嗅??

### 19. ?脤??批捆?

- [x] Markdown rich preview
- [x] Undo / Redo 甇瑕?芸?

### 20. ???鞈??渡?

- [ ] 皜???瑽?legacy `connector_links` ??敺垢瘚?嚗???啁??芰蝞剝璅∪?瘛瑟?

### 21. ?臬?霈?澈

- [ ] ?賢?梁 export pipeline嚗絞銝霈??Page / Project snapshot?iewport???航? item hierarchy
- [x] 摰儔 PNG ?臬 UI ???????芸?頛詨?隞嗥????
- [x] 撖虫? PNG ?臬銝西?銝?祈?閬粹???
- [x] ?弦銝阡摰?PPTX ?Ｙ??寞?嚗Ⅱ隤汗?函垢??backend 蝡舐?鞎砌遙??
- [x] 摰儔 PPTX slide layout????/ ?脣蔗撠???raster fallback 閬?
- [x] 撖虫? PPTX ?臬銝阡?霅?蝔?item 蝯?
- [ ] 摰儔 Project viewer 撠??澆???????
- [ ] 撖虫??航? viewer shell嚗age list?撣葡?an / zoom嚗?
- [ ] 蝣箔? viewer ?舫蝺???銝?鞈?FastAPI?QLite ?蝡舀???
- [ ] ?辣??鈭急?蝔??嚗霈????摰寞抒???

## 撱箄降撖虫???

1. 撠??箇?撱箇蔭
2. Planvas file storage ??backend CRUD
3. Frontend App Shell ??Project / Page UI
4. ?賣??賢?
5. ?拐辣璅∪????撖虫?
6. Snap?onnector ????
7. ?祆??函蔡瘚??葫閰?

