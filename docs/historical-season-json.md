# 歷史賽季 JSON 匯出與匯入

S1–S10 使用同一份 [JSON Schema](historical-season.v1.schema.json)。`format` 固定為
`oclr-historical-season`，`version` 從 1 開始。同一版本的必填欄位與語意適用於所有
歷史賽季。需要改變欄位語意或結構時提高版本，並明確定義舊檔轉換。管理工具會拒絕
不支援的版本。JSON Schema 可供離線結構驗證，伺服器也會驗證跨欄位參照及目標資料庫狀態。

## 資料庫欄位盤點

| 保存位置 | 現行保存的資料 | JSON 欄位 |
| --- | --- | --- |
| `edition_state.configuration` | 賽季標識、名稱及簡介、時區、品牌、外觀、選手與教練設定、EZ 倍率、資格與資格寬限、規則書及里程碑 | `edition` |
| `archive_rel_archive_*`、歸檔當前指標及其來源 JSONB | 來源連結和擷取日期、原始附註、查核表及來源事實 | `provenance` |
| `player_names` | 本季歷史選手、Staff 與替補的 UID、歷史名稱、來源與參照、首次及末次觀察時間、原發布標記 | `provenance.playerNames` |
| 同一份歸檔文件的名單與選秀關聯 | 隊伍；已知與待核對身分、隊員、教練、Staff、替補歷程；依序保存的選秀或最終 Tier | `roster` |
| 同一份歸檔文件的賽事與圖池關聯 | 競賽日期與精度、分組排名及最終名次、資格賽及逐圖成績、賽程與比賽比分、原始裁定與核對、MP／VOD、禁圖、各階段圖池與譜面資料 | `competition` |
| `historical_brackets`、`historical_bracket_matches`、`historical_bracket_advancements` | 對陣來源、場次順序、勝敗組、種子及晉級連線 | `competition.bracket` |
| `historical_statistics`、`archive_rel_statistics*` | 賽事與 MP 關聯、原始 MP 事件／對局／逐人成績、圖池及計入／排除選擇、核對證據、保存草稿與先前發布快照 | `statistics` |
| `transferred_historical_statistics_releases` | 從檔案保存的原發布快照及來源時間，供私下核對及再匯出 | `statistics[].releaseEvidence` |

正式資料庫最近一份已引用的主辦證據是 2026-11-06 的
[#919](https://github.com/OCLR-dev/OCLR-website/issues/919) 核對。S1–S10 共 552 份當前
歸檔／統計關聯文件、388,102 列相符。遷移 0091 在 S8 安裝 14 場、16 條晉級連線，其餘
九季各 10 場、12 條連線。這些是既有資料證據及程式遷移內容。#1129 的驗證在隔離庫進行，
正式庫各季目前的實際欄位出現範圍與匯出大小仍需由操作員核對。

下列查詢只列出欄位名、舊歸檔內部版本和筆數。可在已授權的資料庫工作階段核對十季的
現況，結果不含選手身分、來源值或分數。

```sql
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
WITH seasons AS (
  SELECT n, 's' || n AS slug FROM generate_series(1, 10) AS n
), mp AS (
  SELECT edition_slug, count(*) AS rooms,
         count(*) FILTER (WHERE published IS NOT NULL) AS released_rooms
  FROM historical_statistics GROUP BY edition_slug
)
SELECT s.slug,
       e.configuration IS NOT NULL AS configured,
       ARRAY(SELECT jsonb_object_keys(e.configuration) ORDER BY 1) AS edition_fields,
       e.configuration->'archive'->>'formatVersion' AS saved_archive_version,
       ARRAY(SELECT jsonb_object_keys(NULLIF(e.configuration->'archive', 'null'::jsonb))
             ORDER BY 1) AS archive_fields,
       b.match_count AS bracket_matches, b.advancement_count AS advancements,
       coalesce(mp.rooms, 0) AS mp_rooms, coalesce(mp.released_rooms, 0) AS released_rooms
FROM seasons s
LEFT JOIN edition_state e ON e.slug = s.slug
LEFT JOIN historical_brackets b ON b.edition_slug = s.slug
LEFT JOIN mp ON mp.edition_slug = s.slug
ORDER BY s.n;
ROLLBACK;
```

## 格式與範圍

下例使用合成資料示範最小檔案。

```json
{
  "format": "oclr-historical-season",
  "version": 1,
  "edition": {
    "slug": "synthetic-history",
    "name": "Synthetic historical season",
    "season": null,
    "summary": "Example data",
    "timeZone": "Asia/Taipei",
    "branding": { "logo": null, "background": null, "keyVisual": null },
    "rules": null,
    "eligibility": null,
    "schedule": []
  },
  "provenance": {
    "sourceUrl": "https://example.com/source",
    "capturedOn": "2026-01-01",
    "notes": [],
    "links": [],
    "playerNames": []
  },
  "roster": {
    "teams": [{ "id": "alpha", "name": "Alpha", "source": "Synthetic" }],
    "players": [{
      "osuId": 990001,
      "username": "Synthetic Captain",
      "teamId": "alpha",
      "role": "captain",
      "tier": 0,
      "source": "Synthetic"
    }],
    "staff": [],
    "draft": { "picks": [] }
  },
  "competition": { "fixtures": [], "pools": [], "standings": [], "bracket": null },
  "statistics": []
}
```

- 概況、規則書、資格與里程碑取目前的設定。隊伍、選手、圖池與遊戲事件等保留來源順序。
  對陣場次按資料庫位置，晉級連線按目標場次 ID／位置，MP 文件按房間 ID 排序。
  JSON 物件的鍵按字典順序輸出。
- 缺少的選填欄位保持缺少，來源明確保存的 `null`、空陣列、空物件及零分保持原值。
  `competition.bracket: null` 代表沒有可攜對陣圖。MP 的 `releaseEvidence: null` 代表該
  房間沒有可攜發布證據。舊歸檔自身的 1／2 版標籤由新的檔案版本取代，現有資料庫繼續
  以其支援的歸檔結構寫入。
- 歷史名稱證據按 UID、名稱、來源及參照保存，涵蓋只存在於名稱歷程的舊名稱與舊來源。
  觀察時間使用 UTC，保留 PostgreSQL 的微秒精度和 `null`。發布標記保留為來源證據，
  目標站仍依既有賽季與名稱可見性規則顯示。匯入驗證既有名稱證據，遇到不同的同鍵記錄
  或檔案缺少目標已有的證據時回報衝突。舊 v1 檔可省略 `playerNames`，繼續沿用原本的名稱
  採集流程。
- 匯出的 MP 證據優先取資料庫目前發布的快照。當目前沒有發布時，可帶回先前匯入的
  證據。檔案保留原審查資料供核對，目標賽季的統計草稿版本及發布狀態由目標站重新管理。
- 此格式涵蓋一季目前的歸檔。報名及其答案、帳號、角色授權、稽核與歷史修訂、站點發布
  狀態、衍生統計快取及媒體檔案本體由既有系統管理。品牌路徑及來源連結保留為參照。

## 管理操作

1. 以該賽季 Admin 身分開啟「歷史歸檔」，選「下載歷史賽季 JSON」。下載內容取自同一個唯讀
   資料庫快照，包含管理用來源證據。
2. 在同 slug、未發布、已完成且無報名或現行賽事資料的目標賽季選檔。選「驗證與核對歸檔」，
   核對資料筆數，再確認儲存。檔案、設定版本、目標對陣或 MP 資料改變時重新驗證。
3. 在既有歸檔預覽核對結果，再依既有流程處理賽季公開及 MP 統計審核。匯入留下目標站的
   設定修訂及稽核。已保存且不同的對陣或 MP 記錄會回報衝突。相同檔案在重新驗證後可安全
   重送。伺服器驗證或交易失敗時沒有部分匯入結果。

管理端 `GET /api/admin/tournaments/{edition}/archive-json` 下載。相同路徑的 `POST` 接受
`{"action":"preview","expectedRevision":0,"package":{...}}`，回傳摘要和 `previewToken`。
儲存使用相同的檔案和版本，帶入 `action: "import"`、`confirmed: true` 及該 token。
傳輸支援 JSON，以及瀏覽器使用的 gzip。請求上限為 64 MiB JSON，gzip 傳輸上限為
8 MiB。匯出及匯入需要實際的賽季管理權限，Developer 存取不包含此管理檔案。

[舊來源檔](imports/)保留原檔及其審核歷史。歸檔頁仍可驗證與匯入
`s4-archive`、`s5-archive`、`s5-reviewed-import`、`s6-archive`、`s6-confirmed-archive`、`s7-archive`、
`s8-archive`、`s9-archive`、`s10-archive` 等舊版歸檔。舊操作的範圍是當時歸檔檔案內的
資料。其餘來源整理檔及規則書檔供比對與查證。完成舊檔核對後，從資料庫下載即可取得
帶有現行設定、對陣及統計資料的新格式。
