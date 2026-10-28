# 公開手順(ライブレートを動かすには自分のドメインで配信する必要がある)

Claude のアーティファクト内からは外部 API に届かないため、レートは同梱の参考値になる。
GitHub Pages に置くと、Coinbase(1分ごと)・ExchangeRate-API・Frankfurter(日次チャート)が動く。

## 1. 独立リポジトリにする(推奨。SPEC 02 により **private 既定**)

詳細な手順と確認事項は `docs/MIGRATION_PLAN.md`。

1. GitHub で `currency-intelligence` という **private** リポジトリを新規作成(README なし)。公開はあとで切り替えられる(private のまま Pages を使えるかはプランに依存、要確認)。
2. このフォルダの内容をそのリポジトリの `main` に push する。`ciel-site` から切り出す場合:

   ```bash
   cd ciel-site
   git subtree split --prefix=currency-intelligence -b ci-main
   git push https://github.com/<you>/currency-intelligence.git ci-main:main
   ```

3. 新リポジトリで `npm test` / `tsc` が通ることを CI で確認してから、Settings → Pages → Build and deployment → Source を **GitHub Actions** にする(既存の `pages.yml` をそのまま有効化しない。base path と公開範囲を先に確認)。
4. `https://<you>.github.io/currency-intelligence/` で公開される。

## 2. ciel-site のドメイン配下に置く(最短)

`apps/web` の中身を `ciel-site` の `main` の `currency/` にコピーして push すると、
`https://<ciel のドメイン>/currency/` で動く(美容室サイトの公開リポジトリに同居することになる)。
