# BASELINE — 現物監査と回帰基準(IMPLEMENTATION SPEC 02 Phase 0)

記録日時: 2026-10-28T07:10:36Z(監査コマンド実行時刻、UTC)
作成者: Claude(この作業セッション)。すべてコンテナ内で実測した値で、推定値は「推定」と明記する。

## 1. 監査対象の状態(変更前)

| 項目 | 値 |
| --- | --- |
| リポジトリ | `akihair61/ciel-site`(美容室サイト)。本プロダクトはそのブランチ `currency-intelligence` の `currency-intelligence/` 配下 |
| HEAD(監査時) | `945928538126767e949e9162a66ec4d12b3020e2`(= `origin/currency-intelligence`) |
| `main` | `142f2f0387a4d271a853371f1654821df0bed1cf`(触れていない。差分なし) |
| Node.js | v22.22.0(型注釈の除去で `.ts` を直接実行。`erasableSyntaxOnly`) |
| TypeScript | 6.0.2(`tsc --noEmit` と `dist/` 生成に使用) |
| 実行時依存 | **ゼロ**(`packages/core/package.json` の `dependencies` なし。`apps/web` も外部ライブラリなし) |
| 開発時依存 | typescript のみ。Playwright 1.63.0 は環境同梱(リポジトリには入れていない) |
| テスト | `node --test test/*.test.ts` → **29 件 / 29 通過 / 0 失敗**(監査時点) |
| Web クライアント | `apps/web`(index.html 331 行、app.js 646 行、styles.css 485 行、sw.js VERSION `ci-shell-v4`、localStorage キー `ci.v3`) |
| iOS | `ios/CoreMoney`(Swift Package)。**未ビルド**(Swift/Xcode なし) |
| 外部ネットワーク | npm レジストリのみ到達可。api.coinbase.com / open.er-api.com / api.frankfurter.app は **proxy 403 で到達不可**(ERR_TUNNEL_CONNECTION_FAILED) |

## 2. 変更前に見つかった品質上の問題(SPEC 02 Q-01〜Q-06 への対応表)

| ID | 現物での所在(変更前) | 内容 | 対応(この変更) |
| --- | --- | --- | --- |
| Q-01 | `packages/core/src/providers.ts` 82 / 132 / 180 行 `res.json()`、191 行 `Number(r)` | JSON の数値が JS の double を経由し、桁落ちし得た | `src/json.ts` に数値を文字列のまま保持する JSON パーサを追加。全プロバイダが `res.text()` → `parseJsonPreservingNumbers()`。テストで 24 桁のレートが欠損なく通ることを確認 |
| Q-02 | `app.js` `sourceLabel()`(`Live · Coinbase · Ns ago`)、`providers.ts` Coinbase が `observedAt: now` | Coinbase は観測時刻を返さないのに取得時刻を観測時刻として表示し、「Live」と呼んでいた | `RateQuote.observedAt` を `string \| null` に変更。Coinbase は `null`。UI は「fetched Ns ago · observation time not published」と表示し、「Live」の語を全廃。レート詳細に Freshness 行を追加 |
| Q-03 | `app.js` 16 行 `const REDUCED = false;`、`styles.css` から `prefers-reduced-motion` 規則を削除済み | OS の「視差効果を減らす」を無視していた | 既定で OS 設定を尊重(`motion: "auto"`)。設定シートで On / Off に上書き可。reduced 時は全アニメーションが 1ms で最終状態になり、待ち時間(スプラッシュ 2.15s、変換 1.05s、レシート印字 4.5s)をスキップ |
| Q-04 | `app.js` `doConvert()`(`setBalance(...)` を実行し `ledger` に `kind:"convert"` を追加) | 「変換」が実残高を書き換えていた(シミュレーションと実両替記録の混同) | Convert は **シミュレーション**(残高・取引台帳に触れない、参照番号 `SIM-`)。結果シートの「Record as a real exchange」で確認ダイアログ後に **実両替記録**(両脚と残高を 1 回の保存で書く、`EXC-`)。既存の変換は `legacy_convert` / `legacy:true` として意味を変えずに保持 |
| Q-05 | `packages/core/src/split.ts` 80 行 `minimum-ish`、`README.md` | 貪欲法を「最少」と示唆 | コメントと UI を「精算回数を減らす提案(最少とは限らない)」に変更。不変条件テスト(転送数 ≤ 債務者+債権者−1、収支ゼロ、決定的)を追加 |
| Q-06 | `app.js` `load()/save()`(バージョンなし、破損時は無言で初期化) | スキーマ版数・バックアップ・移行・書き出し/読み込みなし | `schemaVersion: 4`、保存前に前回値を `ci.v4.bak` に退避、v3 → v4 移行(`ci.v3` は削除しない)、JSON の Export / Import(検証付き、置換前に確認) |

## 3. 回帰基準として保存した成果物

| 種類 | 場所 | 取得方法 |
| --- | --- | --- |
| 変更前の画面 | `docs/screenshots/*.png`(home / convert / wallet / add-cash / receipt / progress / onboard / spend)、`app-demo.mp4` | Playwright 1.63.0(Chromium)、393×852、`record.js` |
| 変更後の画面 | `docs/screenshots/spec02/` | 同じ `record.js` + `verify_p1.js`(28 項目の自動確認) |
| API ペイロード形状(テストの固定値) | `packages/core/test/providers_cache.test.ts` | Frankfurter `/latest`、open.er-api `/v6/latest/{BASE}`、Coinbase `/v2/exchange-rates` の各形状をフェイク fetch で固定 |
| 計算の不変条件 | `packages/core/test/*.test.ts` | `node --test`。変更後 **36 件 / 36 通過** |

## 4. 変更後の状態(2026-10-28T07:32Z)

| 項目 | 値 |
| --- | --- |
| テスト | 36 / 36 通過(`json.test.ts` 4 件、`rates.test.ts` に null observedAt 1 件、`compare_split.test.ts` に settle 不変条件 1 件、Q-01 精度 1 件を追加。既存 29 件の期待値は **変更していない**) |
| 型検査 | `tsc --noEmit` 通過 |
| ブラウザ確認 | `verify_p1.js` 28 / 28 通過(移行、シミュレーション、実両替記録、バックアップ、Export/Import、Reduce Motion) |
| localStorage | キー `ci.v4`(+ `ci.v4.bak`)。`ci.v3` は読み取り専用で残す |
| Service Worker | VERSION `ci-shell-v5` |

## 5. 監査で実行したコマンド(再現用)

```bash
cd currency-intelligence/packages/core
node --version && npx tsc --version
npm run typecheck && npm test
cd ../../apps/web && node build.mjs
# ブラウザ確認(環境同梱の Playwright)
node /path/to/record.js apps/web out/   # 画面と動画
node /path/to/verify_p1.js              # 28 項目
```
