# BLOCKERS

確認・判断が必要な事項。ブロックされない安全な実装は続行している。

| ID | 内容 | 影響 | 必要なアクション | 状態 |
| --- | --- | --- | --- | --- |
| B-01 | 作業セッションは Linux コンテナで Xcode / Swift がない。 | — | **解決**: GitHub Actions の macOS ランナー(`.github/workflows/ios.yml`)で `swift test` 11/11、`xcodebuild` 成功、シミュレータ起動のスクリーンショットを取得。実機・XCUITest は未 | 解決(CI 経由) |
| B-02 | 作業コンテナから外部 Web に到達できない。 | — | **一部解決**: GitHub Actions(`.github/workflows/live-check.yml`、毎週 + push 時)が実 API を叩き、結果を `docs/ci/live-check.md` に記録。2026-10-29: Coinbase 42 通貨(観測時刻なし)、open.er-api 42、Frankfurter 27(ECB 非対象 15 通貨は欠落)、日次履歴 22 点。公式ドキュメント(Apple、利用規約)の確認は未 | 一部解決 |
| B-03 | レート API の**商用利用条件が未確認**。open.er-api.com は出典表示が必要とされているが、SLA・再配布・更新頻度の正確な条件は要確認。Frankfurter(ECB)は参考レート用途のみ。 | 商用公開時にライセンス違反のリスク | 各 API の利用規約を確認し、必要なら有料プラン(例: ExchangeRate-API 有料、または他社ライブレート)を契約 | 未解決 |
| B-04 | F08 両替所レート、F09 ATM 手数料、F10 カード手数料は **正式提供データの契約がない**。 | 「不明」表示以外ができない。自動取得(スクレイピング)は規約上やらない | 提携先・データ提供契約の方針決定 | 未解決 |
| B-05 | F16–F20(残高・交換・送金・カード・KYC)は **許認可とパートナー契約が前提**。タイ(BOT)・日本(資金決済法等)の要件未調査。 | 実装しても公開できない。サンドボックス実装も契約先の選定後 | 法務・パートナー選定。確定まで feature flag OFF、コード自体を着手しない | 未解決(着手せず) |
| B-06 | コードが **美容室サイト `ciel-site` のブランチ内**にある。 | リポジトリの責務が混ざる。CI・権限・公開設定を分けられない | 新リポジトリ(例 `akihair61/currency-intelligence`、**private 既定**)をオーナーが作成し、`docs/MIGRATION_PLAN.md` の手順で移す。このセッションからの作成は GitHub API が 403(権限なし) | 未解決(計画書あり) |
| B-07 | 対応通貨の ISO 4217 小数桁。 | — | **解決**: live-check が ISO 4217 list one(165 通貨)と `currencies.ts` 43 通貨を突合、**不一致なし**(`docs/ci/live-check.md`) | 解決 |
| B-08 | 仕様の「iOS 27 / Apple Foundation Models」は **公式ドキュメント未確認**。 | 存在しない API を前提にした実装をしないため、AI ルーティング層は未着手 | B-02 解消後、`docs/TECH_VALIDATION.md` に確認結果を記録してから着手 | 未解決 |

## SPEC 02 との対応表(2026-10-28)

| SPEC 02 の項目 | 対応するブロッカー / 修正 | 状態 |
| --- | --- | --- |
| Phase 0 現物監査・回帰基準 | `docs/BASELINE.md` | 作成済み |
| Phase 0 独立リポジトリへの分離計画 | `docs/MIGRATION_PLAN.md`、B-06 | 計画済み・未実行(オーナー操作待ち) |
| Phase 0 ADR(既存判断との衝突) | `docs/adr/0003-spec02-conflicts.md` | 作成済み |
| Q-01 JSON 数値の精度 | `packages/core/src/json.ts`、providers を `text()` 化 | 修正・試験済み |
| Q-02 「Live」/観測時刻の正直な表示 | `RateQuote.observedAt` null 可、UI 文言 | 修正・試験済み |
| Q-03 Reduce Motion | `motion: auto/on/off`、`body.reduced` | 修正・試験済み |
| Q-04 シミュレーションと実記録の分離 | Convert = simulation、Record as a real exchange、legacy 保持 | 修正・試験済み |
| Q-05 「最少回数」の表現 | split.ts コメント、F13 UI 文言 | 修正・試験済み |
| Q-06 ストレージの原子性・移行・Export/Import | schemaVersion 4、`.bak`、Export/Import | 修正・試験済み |
| Phase 2 F13 割り勘 UI | ホーム MORE → Split a bill | 作成・ブラウザ試験済み |
| Phase 2 F11 旅行・予算(スナップショット)、F01 ピン・ja/en/th、F02 定義、F03 12 通貨一覧 | ホーム MORE → Trips & budget / All rates、ピッカーの ★、レート詳細の定義文、設定の Language | 作成・ブラウザ試験済み(`docs/verify_p2.js` 20 項目) |
| Phase 3 iOS | SwiftUI アプリ + CoreMoney 拡張。macOS ランナーでビルド・テスト・起動確認 | 作成・ビルド・試験(単体 11 件 + 起動)済み |
| 外部 API の実疎通 | GitHub Actions の live-check で実応答をアプリのプロバイダで解析(`docs/ci/live-check.md`) | 解決(3 社とも OK、ISO 突合も一致) |
