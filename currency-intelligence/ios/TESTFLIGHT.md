# TestFlight で確認する手順(あなたがやるのは 2 つだけ)

iPhone 実機に入れるには Apple の署名が必要で、それはあなたの Apple Developer アカウントでしか作れません。
鍵を GitHub に登録してもらえば、以後は GitHub の Mac が自動でビルド・署名・TestFlight へのアップロードまで行います(ワークフロー `testflight-currency-intelligence`)。

前提: Apple Developer Program(有料、年 99 USD)に加入済みであること。

## 1. App Store Connect の API キーを作って、GitHub に登録する(初回だけ、10 分)

1. https://appstoreconnect.apple.com → **ユーザとアクセス** → **統合**(Integrations)→ **App Store Connect API** → 「チームキー」で **＋**。
   - 名前: `github-actions`、アクセス: **App Manager**(Admin でも可)。
2. 作成直後の画面で控える・ダウンロードするもの:
   - **Issuer ID**(画面上部の長い ID)
   - **キー ID**(10 文字)
   - **AuthKey_XXXXXXXXXX.p8** ファイル(**一度しかダウンロードできません**)
3. **Team ID**: https://developer.apple.com/account → Membership details の「Team ID」(10 文字)。
4. GitHub の `akihair61/ciel-site` → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** で 4 つ登録:

   | 名前 | 値 |
   | --- | --- |
   | `ASC_KEY_ID` | キー ID |
   | `ASC_ISSUER_ID` | Issuer ID |
   | `ASC_KEY_P8` | .p8 ファイルの中身(テキストエディタで開いて全部コピー。`-----BEGIN PRIVATE KEY-----` から `-----END PRIVATE KEY-----` まで) |
   | `APPLE_TEAM_ID` | Team ID |

## 2. App Store Connect にアプリを 1 件登録する(初回だけ、3 分)

1. まず GitHub の **Actions** タブ → `testflight-currency-intelligence` → **Run workflow**(upload = true のまま)を 1 回実行します。
   初回は「App Store Connect にアプリがない」という理由で最後のアップロードだけ失敗しますが、この実行で Apple 側に Bundle ID(`com.akihair.currencyintelligence` とウィジェット用の `.widget`)と App Group が自動登録されます。
2. https://appstoreconnect.apple.com → **マイ App** → **＋** → **新規 App**:
   - プラットフォーム: iOS、名前: `Currency Intelligence`(重複なら `Currency Intelligence CI` など)、プライマリ言語: 日本語、
   - バンドル ID: `com.akihair.currencyintelligence`(1 の実行後に一覧に出ます)、SKU: `currency-intelligence`。
3. もう一度 **Run workflow**。成功すると、5〜30 分で TestFlight に「0.1.<番号>」が現れます。

## 3. iPhone で受け取る

- App Store Connect → TestFlight → 内部テスト → グループを作って自分の Apple ID を追加 → iPhone の **TestFlight** アプリにインストール案内が届きます。
- 以後は、私(Claude)がコードを更新するたびにこのワークフローを実行すれば、新しいビルドが TestFlight に届きます(手動実行。自動化もできますが、まず手動で)。

## うまくいかない時

- ワークフローのログ末尾(Summary)に理由を書き出します。Secrets の名前違い、キーの権限不足(App Manager 未満)、Apple の契約未同意(App Store Connect の「契約/税金/口座」で最新の契約に同意が必要)が多いです。
- 署名まわりは `archive.log` / `export.log`(ワークフローの Artifacts)に全文があります。それを貼ってもらえれば私が直します。
