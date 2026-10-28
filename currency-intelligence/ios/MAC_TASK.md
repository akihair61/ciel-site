# Mac の Claude Code に貼り付ける依頼文

Mac でリポジトリ(`ciel-site` のブランチ `currency-intelligence`)を開き、ターミナルで `claude` を起動して、以下をそのまま貼り付けてください。

```
currency-intelligence/ios を Mac でビルド・テストして、通るまで直してください。

前提:
- このコードは Linux 環境で書かれ、コンパイル未確認です(ios/README_MAC.md)。
- ロジックの正本は currency-intelligence/packages/core(TypeScript)。Swift 側の期待値はそれに合わせる。期待値を変えてテストを通さないこと。
- 守ること: Convert は残高を変えないシミュレーション、「Record as a real exchange」だけが残高を変える。レートを「Live」と呼ばない。観測時刻がないレートは「observation time not published」と表示。残高は「手動で記録した現金」であり口座残高ではない、という注記を消さない。
- 金額を Double に通さない(Decimal / Int64 minor units のみ)。

手順:
1. cd currency-intelligence/ios/CoreMoney && swift test。失敗はコンパイルエラーから順に直す。
2. cd ../CurrencyIntelligence && xcodebuild -project CurrencyIntelligence.xcodeproj -scheme CurrencyIntelligence -destination 'generic/platform=iOS Simulator' build。
   project.pbxproj が開けなければ `xcodegen generate`(project.yml あり)で作り直す。
3. シミュレータで起動し、README_MAC.md の「3. 動作確認」を実施。スクリーンショットを docs/screenshots/ios/ に保存。
4. 直した内容と結果を docs/FEATURE_MATRIX.md(iOS 行)と docs/BASELINE.md に追記。
5. ブランチ currency-intelligence にコミットして push(main には触れない。force-push しない)。
```
