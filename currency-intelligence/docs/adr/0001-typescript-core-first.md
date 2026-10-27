# ADR-0001: Shared Core は TypeScript を正本にし、Web PWA を最初のクライアントにする

日付: 2026-10-27 / 状態: 採用

## 文脈

仕様書は iOS 優先(SwiftUI、Shared Core を Swift で)を求めている。しかし実装環境は Linux コンテナで、Swift ツールチェーンも Xcode もない(BLOCKERS B-01)。検証できないコードを「実装済み」と納品することは仕様書 §13 が禁じている。

一方で仕様書 §14 は Web PWA を事業拡張先として挙げ、§08 はバックエンドに TypeScript を候補としている。

## 決定

1. 計算エンジン(Money / Rates / Convert / Compare / Split)を **TypeScript(`packages/core`)で実装し、テストで検証する**。依存パッケージはゼロ。これを正本とする。
2. 最初に動くクライアントは **Web PWA(`apps/web`)**。静的ファイルだけで GitHub Pages に置ける。
3. Swift 版(`ios/CoreMoney`)は同じテストケースを持つ「鏡」として用意するが、**未ビルド**と明記する。macOS 環境が得られた時点で `swift test` を実行し、TS 版と期待値が一致することを確認してから iOS 開発に進む。
4. バックエンド(§08)を作る際は同じ `packages/core` を Node.js でそのまま使う。

## 影響

- iOS の価値(Vision OCR、Widget、Watch)は macOS 環境が必要。優先度は落とさないが、順序が後になる。
- 計算ロジックが 2 言語になる。期待値を共有するテストで整合を担保する。
