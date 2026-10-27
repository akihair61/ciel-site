# プロダクト仕様(要約)

出典: `Claude_AI_Currency_SuperApp_Master_Spec_JA_2026.pdf`(2026-10-28版)。本ファイルは実装者向けの要約で、原本が優先する。

## 目的

為替計算、AIカメラ、旅行予算、カード・現金比較、両替所探索、通貨交換・国際送金までを段階的かつ安全に統合する。
金融機能は認可・契約・法務確認完了までサンドボックスとフィーチャーフラグで隔離し、実資金処理を無許可で公開しない。

## 品質原則(実装上の不変条件)

1. 最初の換算まで 2 操作以内。装飾より速度と情報の信頼性。
2. 金額計算は Decimal / 整数最小通貨単位。Double の金銭丸め禁止。AI は説明と提案に使い、金額計算の正本にしない。
3. すべてのレートに取得時刻・提供元・rate type・買値/売値・手数料・確定/推定を表示。
4. 通信障害、レート劣化、API 契約不在、位置情報拒否、Apple Intelligence 非対応端末でも基本機能は動く。
5. 日本語・英語・タイ語から開始。通貨記号、RTL、桁区切り、旅行先タイムゾーン、アクセシビリティ。

## 対象ユーザーと北極星指標

- 海外旅行者、複数通貨生活者、留学生、出張者、海外通販利用者、旅行グループ。初期は日本とタイを軸に。
- 週次の成功した換算・比較・支出記録のユニーク利用者。1回目の換算までの時間、7日/30日継続率、レート表示の正確性。

## 機能群(詳細は FEATURE_MATRIX.md)

- **P1 Converter Core**: F01 高速コンバーター、F02 レート・チャート、F03 マルチ通貨同時換算
- **P2 AI/Camera**: F04 スマート検索・音声、F05 カメラ・AR 換算、F06 アラート、F07 AI 解説
- **P3 Travel/Compare**: F08 両替所検索、F09 ATM 比較、F10 カード最適化、F11 旅行予算、F12 レシート認識、F13 割り勘、F14 物価情報、F15 ウィジェット/Watch
- **P4 Regulated Sandbox**: F16 マルチ通貨残高、F17 外貨交換、F18 送金、F19 バーチャルカード、F20 KYC/AML
- **P5 Production Readiness**

## レートと計算の規則(§06)

- `RateQuote`: base, quote, rate(Decimal), bid/ask, mid, source, observedAt(UTC), receivedAt(UTC), expiresAt, rateKind, confidence, jurisdiction, quoteId
- `ConversionResult`: originalAmount, convertedAmount, currencyScale, roundingMode, spread, fixedFee, percentageFee, totalCost, estimated
- 市場中値と現地の実売買レートは別物。クロスレートは共通基準の同時刻性を確認し、許容時差外なら不確実性表示。
- 丸めは明示。銀行/カード/店舗固有のルールを汎用丸めで代替しない。
- ECB/Frankfurter は参考・日次レート用途。取引可能なライブレートと混同しない。

## 支払い最適化(§07)

`netCost = convertedPrincipal + knownFees + estimatedFees + travelCost − rewardValue`。
不明要素を 0 と断言しない。欠損が重要なら「順位未確定」。表示軸: 最安見込み / 最も確実 / 現金が必要 / 高還元。

## ナビゲーション(§05)

Home/Converter、Discover、Travel、Wallet(初期は非表示)、Profile。検索・カメラ・音声をホームに配置。
各画面で Loading / Empty / Partial / Error / Offline / Success / PermissionDenied / RateStale を実装。

## 納品形式(§13)

毎回: 変更ファイル一覧、動くコード、設計理由、公式ドキュメント URL、ビルド結果、テスト結果、画面キャプチャ。
未実装 / 未検証 / 要契約 / 要資格 / 要有料 API を明確に区別する。曖昧な「終わりました」は禁止。
