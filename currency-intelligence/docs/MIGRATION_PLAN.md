# MIGRATION PLAN — 独立リポジトリへの安全な分離(SPEC 02 Phase 0)

状態: **計画のみ。未実行。** リポジトリ作成はオーナーの操作が必要(このセッションからの作成は GitHub API が 403 を返す。BLOCKERS B-06)。

## 方針(SPEC 02 の指示に従う)

1. 新リポジトリは **private** を既定にする(例: `akihair61/currency-intelligence`)。公開はオーナーが後で切り替える。
2. `ciel-site` の `main`・GitHub Pages・ドメインには **触れない**。`currency-intelligence` ブランチも履歴を書き換えない(force-push しない)。
3. 既存の `.github/workflows/pages.yml` は **そのまま有効化しない**。新リポジトリで base path と公開範囲を確認してから有効化する。
4. 利用者データ(localStorage)は削除しない。別オリジンへ移る場合は Export / Import で移す。

## 手順(オーナー実施分と Claude 実施分)

| # | 作業 | 誰が | 状態 |
| --- | --- | --- | --- |
| 1 | GitHub で private リポジトリ `currency-intelligence` を作成(README なし、空) | オーナー | 未 |
| 2 | このセッションの GitHub 連携にそのリポジトリを追加(claude.ai → Settings → Connectors、または `add_repo`) | オーナー | 未 |
| 3 | `git subtree split --prefix=currency-intelligence -b ci-main` で履歴ごと切り出し、新リポジトリの `main` に push(通常 push。force なし) | Claude(2 完了後) | 未 |
| 4 | 新リポジトリで `npm test`(36 件)と `tsc` を CI(`.github/workflows/ci.yml`、Node 22)で実行。Pages は別ワークフローとし、Settings → Pages → Source = GitHub Actions を **オーナーが** 有効化 | Claude / オーナー | 未 |
| 5 | Pages の base path を確認: `https://<owner>.github.io/currency-intelligence/` で配信するなら `manifest.webmanifest` の `start_url`/`scope` と `sw.js` のキャッシュ対象が `./` 相対で動くことを確認(現在は相対パスで記述済み。実機未確認) | Claude | 未 |
| 6 | `ciel-site` 側: ブランチ `currency-intelligence` は履歴保存のため残す。削除や `main` へのマージはしない | — | 方針決定済み |

## 利用者データの移行(オリジンが変わる場合)

localStorage はオリジン単位なので、Claude アーティファクト → GitHub Pages のように配信元が変わると自動では引き継がれない。

1. 旧オリジンで「Rate, motion & data」→ **Export JSON**(`currency-intelligence-YYYY-MM-DD.json`)。
2. 新オリジンで **Import JSON**。検証(スキーマ版数 ≤ 4、残高は 10 進文字列、通貨コードは既知、台帳は `at` 付き)に通った場合のみ、件数を示して確認してから置換。置換前の内容は `ci.v4.bak` に残る。
3. 失敗した場合は理由をトースト表示し、何も変更しない。

## スキーマ移行(同一オリジン)

| 版 | キー | 変更点 | 移行 |
| --- | --- | --- | --- |
| v3 | `ci.v3` | 版数なし。Convert が残高を変更 | 初回起動時に読み取り、v4 形式へ変換。**`ci.v3` は削除しない** |
| v4 | `ci.v4` | `schemaVersion: 4`、`motion`、`migrations[]`、`split`。既存の変換履歴は `kind: "legacy_convert"`、台帳の `convert` は `legacy: true` | 保存ごとに直前の値を `ci.v4.bak` に退避。読み取り不能なら `.bak` から復旧、それも無理なら初期値(旧データは残す) |

## 確認事項(未解決)

- Pages を private リポジトリで使うには GitHub のプランによって制約がある(要確認)。private のまま配信できない場合は、公開に切り替えるか、別のホスティングを選ぶ。
- 新リポジトリの Actions 権限(`pages: write`, `id-token: write`)の設定はオーナー側。
