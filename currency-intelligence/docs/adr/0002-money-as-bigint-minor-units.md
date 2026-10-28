# ADR-0002: 金額は BigInt の最小通貨単位、レートは 10 進文字列

日付: 2026-10-27 / 状態: 採用

## 文脈

仕様書 §06 は「Decimal / 整数最小通貨単位を使い、Double の金銭丸めを禁止」とする。JavaScript の `number` は IEEE 754 倍精度で、`0.1 + 0.2 !== 0.3` のような誤差が金額に混入する。

## 決定

- `Money` は `{ currency, minor: bigint }`。小数桁は ISO 4217 の通貨メタデータから取る(JPY 0、THB 2、KWD 3)。
- 10 進小数は自前の `Dec = { m: bigint, e: number }`(値 = m × 10^-e)で扱う。外部ライブラリは入れない。
- レートは常に **文字列**(`"0.22333"`)で保持・転送する。API の JSON `number` は受け取った瞬間に `numberToDecString()` で文字列化し、以降は `number` を使わない。
  - 補足(2026-10-28, ADR-0003 §5): `res.json()` の時点で double になっていたため、現在は自前の JSON パーサ(`json.ts`)で数値トークンを文字列のまま取り出す。`numberToDecString()` は UI の表示用途にのみ残る。
- 丸めは 7 モード(`HALF_UP / HALF_DOWN / HALF_EVEN / UP / DOWN / CEILING / FLOOR`)を `roundDiv()` 一か所で実装し、**呼び出し側が必ず指定**する。暗黙の丸めはしない(`Money.of("1.5","JPY")` は例外)。
- 丸めは換算結果に対して 1 回だけ(gross に対して)。手数料は発行者の請求と同じく個別に丸めて合算する。
- 配分(割り勘)は最大剰余法。同点は先頭のインデックス優先で決定的。
- 大きさの上限は 10^24 最小単位。超えたら `MONEY_OVERFLOW`。

## 影響

- `Money` の比較・加算は同一通貨でしか許さない(`MONEY_CURRENCY_MISMATCH`)。
- 表示は `Intl.NumberFormat` に **10 進文字列** を渡す(ES2023 以降対応)。
- Swift 版は `Int64` + `Decimal`。`Int64` の上限は約 9.2×10^18 最小単位で、TS 版より小さい。到達する前に明示的に `overflow` を投げる。
