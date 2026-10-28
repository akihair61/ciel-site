# Currency Intelligence

AI Currency & Global Money Super App の実装リポジトリ(作業ブランチ)。
元仕様: `Claude_AI_Currency_SuperApp_Master_Spec_JA_2026.pdf`(2026-10-28版)。要約は [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)。

## 現在の状態(SPEC 02 Phase 0・1・2 完了、Phase 3 iOS は未着手)

報告の区別: **作成** = 書いた / **ビルド** = この環境で通った / **試験** = 自動テストかブラウザ自動操作で確認 / **本番有効** = 利用者が使える配信。現時点で本番有効なものは **ない**(独立リポジトリ・Pages はオーナー操作待ち。`docs/MIGRATION_PLAN.md`)。

| 成果物 | 場所 | 状態 |
| --- | --- | --- |
| プロダクト要件・機能一覧 F01–F20 | `docs/PRODUCT_SPEC.md`, `docs/FEATURE_MATRIX.md` | 作成済み |
| 技術検証メモ | `docs/TECH_VALIDATION.md` | 作成済み(ネット遮断環境のため多くが **要検証**) |
| ブロッカー一覧 | `BLOCKERS.md` | 作成済み |
| 設計判断記録 | `docs/adr/` | 3件(0003 = SPEC 02 との衝突と決定) |
| 現物監査・回帰基準 / 分離計画 | `docs/BASELINE.md`, `docs/MIGRATION_PLAN.md` | 作成済み(分離は未実行) |
| 計算エンジン(Shared Core) | `packages/core` (TypeScript, 依存ゼロ) | **作成・ビルド・試験済み: 36 テスト通過**。数値を double に通さない JSON パーサ(Q-01)、観測時刻 null 対応(Q-02) |
| Web クライアント(PWA) | `apps/web` | **作成・ビルド・ブラウザ試験済み**(Playwright: 参照フロー録画 + 28 項目の自動確認)。オンボーディング → ホーム → 財布 → Convert(**シミュレーション**)→ 結果シート →「Record as a real exchange」で実両替記録 → レシート(記録控え/シミュレーション控え)。割り勘(F13)、旅行と予算(F11、記録時レートのスナップショット)、ピン留めと All rates(F01/F03)、UI 言語 en/ja/th。設定: 自分レート、ホーム通貨、Language、Motion(Auto/On/Off)、Export/Import JSON。localStorage は schema v4 + バックアップ |
| iOS Shared Core | `ios/CoreMoney` (Swift Package) | **未ビルド**(この環境に Xcode / Swift なし) |
| SwiftUI アプリ | — | 未着手(macOS 環境が必要。BLOCKERS B-01) |

## 動かす

```bash
# 計算エンジン
cd packages/core
npm run typecheck   # tsc --noEmit
npm test            # node --test (Node 22.18+、依存パッケージなし)
npm run build       # dist/ に ESM 出力

# Web クライアント(静的ファイルのみ。ビルドは core のコピーだけ)
cd ../../apps/web
node build.mjs      # packages/core/dist → apps/web/core
python3 -m http.server 8765   # http://localhost:8765/
```

GitHub Pages などに `apps/web` をそのまま置けば動く(手順は [DEPLOY.md](DEPLOY.md))。レートは Coinbase(1分ごと取得。観測時刻を返さないので「取得 N 秒前・観測時刻不明」と表示し、「Live」とは呼ばない)→ open.er-api.com → api.frankfurter.app の順に取得し、取得できない時は端末内に保存した前回レートを「stale / offline」、同梱値を「Sample」と明示して使う。チャートは 1D が開いている間に集めたティック、1W〜1Y が Frankfurter の日次。

## 設計の要点

- **金額は整数の最小通貨単位(BigInt / Int64)**。Double での丸めは禁止。丸めモードは常に明示し、結果に記録する(`ConversionResult.roundingMode`)。
- **すべてのレートに出典・観測時刻・取得時刻・種別(mid / indicative / cash_buy …)・確定/推定** を持たせる(`RateQuote`)。日次の参考レートを「リアルタイム」と呼ばない。
- **自分レート(user_realized)**: 両替レシートの「払った/受け取った」から実効レートを出し、市場中値との差を%で示す。競合アプリにない中核機能。
- **比較エンジンは不明要素を 0 とみなさない**。material な未知があれば `ranking: "undetermined"` を返し、UI は「最安」と言わない。
- **割り勘は決定的**(最大剰余法、同点は先頭優先)。常に `sum(shares) == total`。精算は「回数を減らす提案」であり最少を保証しない(貪欲法)。
- **Convert はシミュレーション**で残高を変えない。実両替は利用者が「Record as a real exchange」で明示的に記録する(2 脚と残高を 1 回の保存で書く)。残高は「手動で記録した現金」であり金融口座残高ではない、と画面に明記。
- **Reduce Motion** は既定で尊重し、設定で On/Off に上書きできる(ADR-0003)。
- 金融機能(F16–F20)は **コードも UI も未着手**。許認可・契約が揃うまでフィーチャーフラグ OFF の前提(BLOCKERS B-03〜B-05)。

## ディレクトリ

```
currency-intelligence/
  docs/            PRODUCT_SPEC, FEATURE_MATRIX, TECH_VALIDATION, adr/
  BLOCKERS.md
  packages/core/   Money / Rates / Convert / Compare / Split / Providers / Cache + tests
  apps/web/        PWA(index.html, app.js, styles.css, sw.js, manifest, core/ = ビルド成果物)
  ios/CoreMoney/   Swift Package(未ビルド)
```

## このリポジトリについて

美容室サイト `ciel-site` の作業ブランチ `currency-intelligence` 配下に置いている。本来は独立リポジトリにすべき(BLOCKERS B-06)。`main` には触れていない。
