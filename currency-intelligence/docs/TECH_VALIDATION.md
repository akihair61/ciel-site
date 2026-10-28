# 技術検証メモ

ルール: 公式ドキュメントで確認できたものだけ「確認済み」。この作業セッションは外部 Web に到達できなかった(BLOCKERS B-02)ため、**実際に確認できたのは実行環境と npm レジストリのみ**。それ以外は仕様書記載の URL と既知情報に基づく「要検証」。

## 確認済み(この環境で実測)

| 項目 | 結果 | 根拠 |
| --- | --- | --- |
| Node.js | v22.22.0。`node --test` と型注釈の除去(`.ts` 直接実行)が動作 | `node --test test/*.test.ts` で 36/36 通過(2026-10-28) |
| TypeScript | 6.0.2。`erasableSyntaxOnly`, `rewriteRelativeImportExtensions` が利用可 | `tsc --noEmit` 通過、`dist/` 生成 |
| `Intl.NumberFormat` に 10 進文字列を渡す | 期待どおり(`"1234.50"` → `฿1,234.50`) | `money.test.ts` |
| Playwright + Chromium | 同梱版で起動可 | `apps/web` を実際に操作してスクリーンショット取得 |
| npm レジストリ | 到達可(`npm view typescript version` → 7.0.2) | 依存は追加していない |
| Swift / Xcode | **なし** | `which swift swiftc xcodebuild` → 空 |
| 外部 HTTPS(frankfurter, open.er-api, developer.apple.com) | **到達不可**(proxy 403 / ENOTFOUND) | curl と WebFetch の両方で失敗 |

## 要検証(公式ドキュメント未確認)

| 項目 | 仕様書の前提 | 確認すべきこと | URL(仕様書 §16) |
| --- | --- | --- | --- |
| iOS 27 / Apple Foundation Models | iOS 27 対応 API を Availability でガード、iOS 26 向け代替 | Foundation Models framework の現行 API 名、対応端末、オンデバイス実行条件、iOS 27 の存在 | https://developer.apple.com/documentation/updates/foundationmodels / https://developer.apple.com/wwdc26/guides/ios |
| Vision OCR | 値札 OCR に Vision を使用 | `RecognizeTextRequest`(新 API)と `VNRecognizeTextRequest` の対応 OS、日本語/タイ語認識の精度 | developer.apple.com/documentation/vision |
| Frankfurter | ECB 参考レート、日次 | エンドポイント(`/latest`, `/{date}`, `/{start}..{end}`)、利用規約、レート制限、公開時刻。`providers.ts` は `/latest?from=&to=` を前提に実装 | https://www.frankfurter.app/docs/ ・ https://data.ecb.europa.eu/help/api/data |
| open.er-api.com | 無料・日次・出典表示必須 | 商用利用可否、更新頻度、レート制限、`time_next_update_unix` の意味。`providers.ts` は `/v6/latest/{BASE}` の `result/base_code/rates/time_last_update_unix` を前提 | https://www.exchangerate-api.com/docs/free |
| Coinbase `GET /v2/exchange-rates?currency=USD` | 鍵なし・CORS 可・数分ごと更新の為替レート(最も頻繁に更新される参考レート。「Live」とは呼ばない) | 利用規約での商用利用可否、レート制限。観測時刻が返らないため `observedAt = null` とし UI は「観測時刻不明・取得 N 秒前」 | https://docs.cdp.coinbase.com/ (要検証) |
| Wise Platform API | 送金・交換のパートナー候補 | サンドボックス取得条件、KYC 分担、対応国(日本・タイ) | https://docs.wise.com/api-reference |
| Bank of Thailand | 両替・送金の許認可 | Payment Systems Act、Foreign Exchange Business license の要件 | https://www.bot.or.th/ (仕様書記載 URL) |
| ISO 4217 小数桁 | JPY 0 / KWD 3 等 | `currencies.ts` の 43 通貨を ISO list one と突合 | https://www.iso.org/iso-4217-currency-codes.html |
| GitHub Pages で PWA | `apps/web` をそのまま配信 | service worker のスコープ、サブパス配信時の `start_url` | — |

## 実装が依存している API 契約(コードに固定した前提)

```
GET https://open.er-api.com/v6/latest/USD
→ { result:"success", base_code:"USD", time_last_update_unix, time_next_update_unix, rates:{JPY:…} }

GET https://api.frankfurter.app/latest?from=JPY&to=THB,USD
→ { amount:1, base:"JPY", date:"YYYY-MM-DD", rates:{THB:…} }
```

```
GET https://api.coinbase.com/v2/exchange-rates?currency=USD
→ { data:{ currency:"USD", rates:{ JPY:"150.12", … } } }   ← 文字列。観測時刻なし
```

いずれも **参考レート(indicative, estimated)** として扱い、UI では「参考レート」と表記。ライブ・取引レートとは呼ばない。レスポンス形が変わった場合は `RateError("PROVIDER_SHAPE")` で検出し、保存済みレートにフォールバックする。
