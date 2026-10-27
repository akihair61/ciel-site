# BLOCKERS

確認・判断が必要な事項。ブロックされない安全な実装は続行している。

| ID | 内容 | 影響 | 必要なアクション | 状態 |
| --- | --- | --- | --- | --- |
| B-01 | 実行環境が Linux コンテナで **Xcode / Swift ツールチェーンがない**。SwiftUI アプリも `ios/CoreMoney` も **ビルド・テスト未実施**。 | iOS 成果物(STEP 2 の SwiftUI アプリ、WidgetKit、Vision 等)を検証付きで納品できない | macOS + Xcode のある環境で作業する(ローカル、または macOS の CI ランナー)。それまで Shared Core は TypeScript を正本とし、Swift 版は鏡として保守 | 未解決 |
| B-02 | コンテナから **外部 Web に到達できない**(developer.apple.com、docs.wise.com、frankfurter、ECB など全部 403 / 名前解決不可)。npm レジストリのみ可。 | 仕様書が求める「公式ドキュメントで現行 API を確認」ができない。`docs/TECH_VALIDATION.md` の項目は多くが **要検証** | セッションのネットワーク許可に `developer.apple.com`, `api.frankfurter.app`, `open.er-api.com`, `data-api.ecb.europa.eu`, `docs.wise.com` を追加する。または人が確認して結果を TECH_VALIDATION に記入 | 未解決 |
| B-03 | レート API の**商用利用条件が未確認**。open.er-api.com は出典表示が必要とされているが、SLA・再配布・更新頻度の正確な条件は要確認。Frankfurter(ECB)は参考レート用途のみ。 | 商用公開時にライセンス違反のリスク | 各 API の利用規約を確認し、必要なら有料プラン(例: ExchangeRate-API 有料、または他社ライブレート)を契約 | 未解決 |
| B-04 | F08 両替所レート、F09 ATM 手数料、F10 カード手数料は **正式提供データの契約がない**。 | 「不明」表示以外ができない。自動取得(スクレイピング)は規約上やらない | 提携先・データ提供契約の方針決定 | 未解決 |
| B-05 | F16–F20(残高・交換・送金・カード・KYC)は **許認可とパートナー契約が前提**。タイ(BOT)・日本(資金決済法等)の要件未調査。 | 実装しても公開できない。サンドボックス実装も契約先の選定後 | 法務・パートナー選定。確定まで feature flag OFF、コード自体を着手しない | 未解決(着手せず) |
| B-06 | コードが **美容室サイト `ciel-site` のブランチ内**にある。 | リポジトリの責務が混ざる。CI・権限・公開設定を分けられない | 新リポジトリ(例 `akihair61/currency-intelligence`)を作り、`currency-intelligence/` をそのまま移す。作成はオーナーの承認後に実施 | 未解決 |
| B-07 | 対応通貨の ISO 4217 小数桁は一般公開値から転記。**ISO 公式リストとの突合未実施**。 | 稀な通貨で桁誤りの可能性(主要通貨は問題なし) | ISO 4217 list one を取得し `currencies.ts` と突合(B-02 解消後) | 未解決 |
| B-08 | 仕様の「iOS 27 / Apple Foundation Models」は **公式ドキュメント未確認**。 | 存在しない API を前提にした実装をしないため、AI ルーティング層は未着手 | B-02 解消後、`docs/TECH_VALIDATION.md` に確認結果を記録してから着手 | 未解決 |
