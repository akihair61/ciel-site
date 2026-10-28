# iOS を Mac でビルドする手順(Phase 3)

この作業セッションは Linux コンテナで動いていて、あなたの Mac には届きません。
iOS 側のコードはすべて書いてありますが、**コンパイルもテストも未実行**です。以下を Mac で実行してください。

## 1. 計算コア(Swift Package)のテスト

```bash
cd currency-intelligence/ios/CoreMoney
swift test
```

期待: `MoneyTests` と `SpecTwoTests` が通る(期待値は `packages/core/test` と同じ)。
失敗したら、そのログをそのまま Claude Code(Mac で `claude` を起動)に渡してください。`ios/MAC_TASK.md` に貼り付け用の依頼文があります。

## 2. アプリをビルド

```bash
cd currency-intelligence/ios/CurrencyIntelligence
xcodebuild -project CurrencyIntelligence.xcodeproj -scheme CurrencyIntelligence \
  -destination 'generic/platform=iOS Simulator' build
```

または Xcode で `CurrencyIntelligence.xcodeproj` を開き、iPhone シミュレータで Run。

`project.pbxproj` は手書き(Xcode 16 のフォルダ同期形式)です。Xcode が開けない場合は XcodeGen で作り直せます:

```bash
brew install xcodegen
cd currency-intelligence/ios/CurrencyIntelligence && xcodegen generate
```

実機に入れるときは Signing & Capabilities で Team を選んでください(`DEVELOPMENT_TEAM` は空にしてあります)。

## 3. 動作確認(手動)

1. 起動 → Home に ¥0 / サンプルの残高。右上の注記「手動で記録した現金…」が出る。
2. Home → Add で THB 1000 を追加 → Cards に反映。
3. Convert → JPY 1000 → Convert → 「Converted」シートに **Simulation** のタグ、残高は不変。
4. 「Record as a real exchange」→ 確認 → レシートが **EXCHANGE RECORD / RECORDED**、残高が変わる。
5. Settings → Export JSON → Web 版(アーティファクト)の Import で読める。逆方向も可。
6. 設定 → アクセシビリティ → 視差効果を減らす ON で、Convert の 1 秒待ちが消える(Motion = Auto のとき)。

## 4. 結果の報告

`swift test` と `xcodebuild` の最後の数行と、確認できた項目を教えてください。
`docs/FEATURE_MATRIX.md` の iOS 行を「ビルド ✅ / 試験 ✅」に更新できるのは、その結果が来てからです。
