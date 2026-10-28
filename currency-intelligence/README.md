# Currency Intelligence

AI Currency & Global Money Super App の実装リポジトリ(作業ブランチ)。
元仕様: `Claude_AI_Currency_SuperApp_Master_Spec_JA_2026.pdf`(2026-10-28版)。要約は [docs/PRODUCT_SPEC.md](docs/PRODUCT_SPEC.md)。

## 現在の状態(P0 完了 / P1 Converter Core 進行中)

| 成果物 | 場所 | 状態 |
| --- | --- | --- |
| プロダクト要件・機能一覧 F01–F20 | `docs/PRODUCT_SPEC.md`, `docs/FEATURE_MATRIX.md` | 作成済み |
| 技術検証メモ | `docs/TECH_VALIDATION.md` | 作成済み(ネット遮断環境のため多くが **要検証**) |
| ブロッカー一覧 | `BLOCKERS.md` | 作成済み |
| 設計判断記録 | `docs/adr/` | 2件 |
| 計算エンジン(Shared Core) | `packages/core` (TypeScript, 依存ゼロ) | **実装済み・28テスト通過** |
| Web クライアント(PWA) | `apps/web` | **動作確認済み**(Playwright で操作・スクリーンショット)。オンボーディング → ホーム(残高・今週の支出・取引一覧)→ 財布(通貨カード・現金追加・支払い記録)→ Convert → Converted → Receipt。レート詳細(30日チャート・出典・自分レート・基準通貨) |
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

GitHub Pages などに `apps/web` をそのまま置けば動く(手順は [DEPLOY.md](DEPLOY.md))。レートは Coinbase(1分ごと、ライブ表示)→ open.er-api.com → api.frankfurter.app の順に取得し、取得できない時は端末内に保存した前回レートを「stale」と明示して使う。チャートは 1D がライブのティック、1W〜1Y が Frankfurter の日次。

## 設計の要点

- **金額は整数の最小通貨単位(BigInt / Int64)**。Double での丸めは禁止。丸めモードは常に明示し、結果に記録する(`ConversionResult.roundingMode`)。
- **すべてのレートに出典・観測時刻・取得時刻・種別(mid / indicative / cash_buy …)・確定/推定** を持たせる(`RateQuote`)。日次の参考レートを「リアルタイム」と呼ばない。
- **自分レート(user_realized)**: 両替レシートの「払った/受け取った」から実効レートを出し、市場中値との差を%で示す。競合アプリにない中核機能。
- **比較エンジンは不明要素を 0 とみなさない**。material な未知があれば `ranking: "undetermined"` を返し、UI は「最安」と言わない。
- **割り勘は決定的**(最大剰余法、同点は先頭優先)。常に `sum(shares) == total`。
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
