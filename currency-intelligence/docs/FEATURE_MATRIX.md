# Feature Matrix (F01–F20)

更新: 2026-10-28(SPEC 02 Phase 1 / Phase 2A 反映)

列の意味(SPEC 02 の報告ルール):

- **作成**: コードや文書を書いた
- **ビルド**: この環境でビルド(`tsc`、`build.mjs`、esbuild)が通った
- **試験**: 自動テスト(`node --test`)またはブラウザ自動操作(Playwright)で確認した
- **本番有効**: 利用者が実際に使える状態で配信されている(現時点ではどの機能も **いいえ**: 独立リポジトリ未作成・Pages 未有効。Claude アーティファクトは外部 API に届かないデモ)

記号: ✅ はい / 🟡 一部 / ⬜ いいえ / 🔒 要契約・要許認可(着手しない)

| ID | 機能 | フェーズ | 作成 | ビルド | 試験 | 本番有効 | 実装場所 / 備考 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F01 | 高速コンバーター | P1 | ✅ | ✅ | ✅ | ⬜ | `apps/web`: テンキー(桁ごとのスライド入力)、通貨ピッカー(検索・**ピン留め 12 通貨まで、ピンを先頭に表示**)、スワップ、Max、履歴 100 件、共有/コピー。レートは Coinbase(1 分、観測時刻不明と明記)→ ExchangeRate-API → Frankfurter → 端末保存 → 同梱サンプル。**UI 言語 en / ja / th**(`i18n.js`、端末言語に追従、設定で固定)。通貨名は ja/en のみ(th は en にフォールバック) |
| F02 | レート・チャート | P1 | 🟡 | ✅ | 🟡 | ⬜ | 1D(開いている間に集めたティック)と 1W/1M/3M/1Y(Frankfurter 日次、取れない時は端末蓄積)。レート詳細に **定義文**(変動率 = 期間の最初と最後の点、日次点 = ECB 参考レート、週末・休日は点なし、1D = 収集ティック)。外部 API はこの環境から到達不可のため日次チャートは **モック応答でのみ試験** |
| F03 | マルチ通貨同時換算 | P1 | ✅ | ✅ | ✅ | ⬜ | **All rates シート**: 入力中の金額(未入力なら 1 単位)をピン留め通貨(最大 12)へ同時換算、各行に出典・鮮度、タップで換算先に設定。ホームのティッカー/カードも複数通貨を同時表示。**未**: 並び替え(ピン順のみ) |
| F04 | スマート検索・音声 | P2 | ⬜ | — | — | ⬜ | |
| F05 | カメラ・AR 換算 | P2 | ⬜ | — | — | ⬜ | iOS Vision が必要(B-01) |
| F06 | 為替アラート | P2 | ⬜ | — | — | ⬜ | |
| F07 | 為替 AI 解説 | P2 | ⬜ | — | — | ⬜ | |
| F08 | 両替所検索 | P3 | 🔒 | — | — | ⬜ | データ契約なし(B-04)。`RateKind.cash_buy/cash_sell` は型のみ |
| F09 | ATM 比較 | P3 | 🟡 | ✅ | ✅ | ⬜ | 計算のみ(`convert()` の fixedFee / spreadPercent、`comparePayments()` の atm)。UI 未 |
| F10 | カード最適化 | P3 | 🟡 | ✅ | ✅ | ⬜ | 計算のみ(`comparePayments()`、不明要素は `undetermined`)。UI 未 |
| F11 | 旅行予算 | P3 | ✅ | ✅ | ✅ | ⬜ | **旅行**(名前・予算[ホーム通貨]・期間、現在の旅行を選択/終了/削除)。支出・現金追加は **記録時のレートスナップショット**(`snap`: ホーム通貨額・rate・source・observedAt/receivedAt・rateKind)と `tripId` を保持。ホームの旅行カードに支出 / 予算 / 残り(超過は赤)。**換算基準の選択**: 記録時レート(既定)か現在レート。現金残高・今週の支出・日別取引は従来どおり。「手動で記録した現金であり金融口座残高ではない」を明記 |
| F12 | レシート認識 | P3 | ⬜ | — | — | ⬜ | |
| F13 | グループ割り勘 | P3 | ✅ | ✅ | ✅ | ⬜ | **今回 UI 追加**: ホーム MORE → Split a bill。人数(最大 20)、均等/重み、支払者、各人の分担(丸め差の割当を表示)、「精算回数を減らす提案」(最少とは言わない)、共有テキスト、支払者の支出として記録へ連携。残高・台帳は変更しない。計算は `split.ts`(不変条件テスト 4 件) |
| F14 | 世界の物価情報 | P3 | ⬜ | — | — | ⬜ | ライセンス済みデータなし |
| F15 | ホーム/ロック画面/Watch | P3 | ⬜ | — | — | ⬜ | iOS アプリ本体の後(下記 iOS 行) |
| iOS | SwiftUI アプリ(Phase 3) | P3 | ✅ | ✅ | 🟡 | ⬜ | **GitHub Actions の macOS ランナー(macos-15, Xcode 16)で確認**: `swift test` 11/11 通過、`xcodebuild` BUILD SUCCEEDED(iOS Simulator)、シミュレータで起動してスクリーンショット取得(`docs/screenshots/ios/ios-home.png`、`docs/ci/ios-build-summary.txt`)。画面操作の自動試験(XCUITest)と実機は未。`ios/CoreMoney`(Money / RateQuote(observedAt null 可・invert / cross)/ Coinbase プロバイダ / Web と同じ schema v4 の状態ストア(バックアップ・原子的書込・Export/Import)/ テスト 2 ファイル)と `ios/CurrencyIntelligence`(Xcode 16 形式の手書き project.pbxproj + XcodeGen 用 project.yml。Home / Cards / Convert(シミュレーション)/ 結果シート / 実両替記録 / レシート / レート詳細 / 設定: Motion・Export・Import)。ワークフロー `.github/workflows/ios.yml`(このブランチへの push で実行)。手元の Mac で確認する場合は `ios/README_MAC.md` |
| F16 | マルチ通貨残高 | P4 | 🔒 | — | — | ⬜ | B-05。着手しない |
| F17 | 外貨交換 | P4 | 🔒 | — | — | ⬜ | B-05。アプリ内の「実両替記録」は利用者が外で行った両替の **手動記録** であり、交換の実行ではない |
| F18 | 国内・海外送金 | P4 | 🔒 | — | — | ⬜ | B-05 |
| F19 | バーチャルカード | P4 | 🔒 | — | — | ⬜ | B-05 |
| F20 | KYC/AML/制裁 | P4 | 🔒 | — | — | ⬜ | B-05 |

## 横断要件

| 要件 | 作成 | 試験 | 備考 |
| --- | --- | --- | --- |
| Decimal / 最小通貨単位、Double 禁止 | ✅ | ✅ | `dec.ts`, `money.ts`。**Q-01 対応**: API の JSON は `json.ts` で数値を文字列のまま取り出す(double を経由しない)。`json.test.ts` と `providers_cache.test.ts` で 24 桁保持を確認 |
| 全レートに出典・時刻・種別・確定/推定 | ✅ | ✅ | `RateQuote`。**Q-02 対応**: `observedAt` は `null` 可(Coinbase)。UI は「観測時刻不明・取得 N 秒前」。「Live」の語は廃止 |
| クロスレートの同時刻性チェック | ✅ | ✅ | `cross()`: 時差超過または観測時刻不明は `estimated` + notes |
| 丸めの明示 | ✅ | ✅ | 7 モード、結果に `roundingMode` |
| シミュレーションと実記録の分離 | ✅ | ✅ | **Q-04 対応**: Convert は残高に触れない。実両替記録は明示操作 + 確認。既存データは `legacy` として保持。レシートは「記録控え/シミュレーション控え」 |
| 割り勘の不変条件 sum(shares)=total、精算提案の表現 | ✅ | ✅ | **Q-05 対応**: 「精算回数を減らす提案」。転送数 ≤ 債務者+債権者−1 を試験 |
| ストレージの版管理・バックアップ・移行・書き出し/読み込み | ✅ | ✅ | **Q-06 対応**: `schemaVersion 4`、`ci.v4.bak`、v3→v4 移行、Export/Import(検証・確認付き)。ブラウザ試験 28 項目 |
| stale-while-revalidate、provenance 付き永続化 | ✅ | ✅ | `RateCache` |
| 不明要素を 0 とみなさない比較 | ✅ | ✅ | `comparePayments()` |
| 多言語(ja/en/th) | 🟡 | ✅ | `apps/web/i18n.js`(239 語句、iOS は同じ表を `Strings.swift` に生成)。静的テキストとプレースホルダは起動時に置換、動的文字列は `t()`。Playwright で ja / th / auto(en-US)を確認。**未訳**: 一部の固定文(印字ラベル GENERATING/PRINTING/DONE、ブランド名、「Your exchange receipt」等の出典行)、通貨名の th |
| アクセシビリティ(44pt、Reduce Motion) | 🟡 | 🟡 | **Q-03 対応**: OS の Reduce Motion を既定で尊重、アプリ内で On/Off。Playwright の `reducedMotion: "reduce"` で確認。VoiceOver は実機未確認 |
| ダーク/ライト | ✅ | ✅ | システム連動。ダークは Playwright で確認(ホームの見出しが消える不具合を修正、`docs/screenshots/spec02/home-dark.png`) |
| 本番配信 | ⬜ | — | 独立(private)リポジトリと Pages はオーナー操作待ち(MIGRATION_PLAN.md) |
