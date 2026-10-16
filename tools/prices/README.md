# 値段・メニューの配線（ホームページ）

原本は **管理画面だけ**（Firestore `menus`）。ホームページに値段を手で書かない。

| 場所 | どう連動するか | 反映 |
|---|---|---|
| メニューページ（menu / .en / .th） | 開くたびにブラウザが管理画面の最新を読んで描く（assets/menu-render.js）。静的HTMLも1時間ごとに作り直す | すぐ |
| メニューの構造化データ（menu*/index* の OfferCatalog・makesOffer） | build.mjs が毎回まるごと作る。追加・削除・非公開もそのまま出る/消える | 1時間以内 |
| 各ページの構造化データの Offer | `"sku": "fsXX"` が付いた Offer の price/minPrice/maxPrice を書き換え | 1時間以内 |
| 文章中の値段・割引率 | data/price-slots.json に1か所ずつ登録（どのメニューか・書式・前後の目印）→ 数字を書き換え | 1時間以内 |

- 実行: GitHub Actions `prices-from-admin`（毎時7分・手動実行も可）。手元では `node tools/prices/build.mjs`（`--check` で確認だけ）。
- メニューを非公開・削除したのに文章に値段が残っている所は「孤立」として data/price-report.json に出る（文章は自動で消さない）。
- ページの文章を手で直して目印が消えた所は「壊れた配線」として出る。新しい値段を文章に書いたら price-slots.json に登録する。
- 特別 id: `min:cut` / `min:colour` / `min:straight` / `min:headspa` / `min:treatment` … カテゴリの最安（前髪・キッズ・既存客のみは除く）。
