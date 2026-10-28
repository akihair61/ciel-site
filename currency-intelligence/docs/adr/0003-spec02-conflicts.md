# ADR-0003: IMPLEMENTATION SPEC 02 と既存実装の衝突と決定

日付: 2026-10-28 / 状態: 採用

## 文脈

2026-10-28 に受け取った IMPLEMENTATION SPEC 02 は、参照動画に合わせて作った既存の Web クライアントの一部の判断と衝突する。衝突点ごとに、何を採り、何を捨て、どう両立させるかを記録する。

## 1. Reduce Motion

- 以前の判断: 利用者の「アニメーションが何も付いていない」という指摘を受け、`prefers-reduced-motion` の尊重をやめ `REDUCED = false` に固定した(動画と「全く同じ」動きを最優先)。
- SPEC 02: Reduce Motion を尊重し、短い状態変化に置き換える。
- **決定**: 既定は OS 設定を尊重(`motion: "auto"`)。ただし設定シートで **On**(OS 設定を無視して常に動かす)/ **Off** を選べる。reduced 時は CSS で全アニメーション・トランジションを 1ms にし、JS の待ち(スプラッシュ、CTA のローディング、レシート印字、進捗演出)を 0 にする。最終状態は同じ画面になる。
- 理由: アクセシビリティ要件を既定で満たしつつ、動画どおりの体験を求める利用者が自分で選べる。利用者の以前の指摘(動きが消えて見えた)は、自分の端末で Reduce Motion が有効だった可能性があるため、設定シートに「Your device asks for reduced motion」と現在の OS 設定を表示する。

## 2. 「Live」という表現

- 以前の判断: Coinbase の数分更新レートを 1 分ごとに取得し、UI で `Live · Coinbase · Ns ago` と表示。観測時刻がないため取得時刻を `observedAt` に入れていた。
- SPEC 02: 「Live」は検証済みの場合のみ。観測時刻が不明なら「取得 N 秒前・観測時刻不明」。基本は「参考レート・定期更新」。
- **決定**: `RateQuote.observedAt` を `string | null` にし、Coinbase は `null`。`staleness()` は `basis: "receivedAt"` を返し、`cross()` は片脚でも不明なら `estimated`。UI は「Coinbase · fetched Ns ago · observation time not published」、ECB は「ECB reference · daily」、同梱値は「Sample rate · not current」。「Live」の語は UI・コード(状態名 `live`)から削除。1 分ポーリングの点滅は「polling」として残す。
- 捨てたもの: 「リアルタイム」の訴求。残したもの: 1 分ごとの更新と 1D ティックチャート(「開いている間に集めたティック」と明記)。

## 3. 変換シミュレーションと実両替記録

- 以前の判断: 参照動画の Convert → Converted → Receipt の流れをそのまま実装し、Convert が残高を減算・加算していた。
- SPEC 02: シミュレーションは残高を変えない。実両替の記録は明示的操作。既存の記録は意味を変えずに保持。
- **決定**: Convert = **シミュレーション**(履歴に `kind: "simulation"`、参照 `SIM-`、台帳には入れない)。結果シートに「Simulation · no balance changed, no money moved」のタグと「Record as a real exchange」ボタンを置き、確認ダイアログ後に **実両替記録**(`kind: "exchange"`、`EXC-`、2 脚と残高を 1 回の `save()` で書く)。レシートは「SIMULATION NOTE / SIMULATED」と「EXCHANGE RECORD / RECORDED」で区別し、末尾に「記録控え/シミュレーション控えであり明細書ではない」旨を表示。v3 の変換は `legacy_convert` として「Made before v4, when Convert changed balances」と表示し、残高を遡って直さない。
- 捨てたもの: ワンタップで残高が動く手軽さ。理由: 実際に両替していないのに残高が変わるのは「手動で記録した現金」という製品の前提と矛盾する。

## 4. `REDUCED` フラグと `wait()`

- 以前: `const REDUCED = false` と `wait(ms)` が `REDUCED ? 0 : ms`。
- **決定**: `reduced()` を関数化し、設定と OS 設定から毎回判定。`wait()` と各シーケンスはこの関数を見る。

## 5. 数値の精度(Q-01)

- 以前: ADR-0002 で「API の JSON number は受け取った瞬間に文字列化」としていたが、`res.json()` の時点で double になっており、文字列化は double の桁数しか保てなかった。
- **決定**: 依存ゼロのまま自前 JSON パーサ(`json.ts`)で数値トークンを文字列のまま取り出す。`FetchLike` は `text()` を要求。サイズ上限 2 MB、深さ 64、`__proto__` キーは無害化。

## 6. 同梱レートの呼び方

- 以前: 「Built-in reference」。
- **決定**: 「Sample」(サンプル・現在値ではない)と明記。status 名も `sample`。

## 影響

- 既存 29 テストの期待値は変更せず、7 件追加して 36 件。
- Web の localStorage スキーマは v4(ADR-0003 と MIGRATION_PLAN に従い、v3 は残す)。
- 参照動画と見た目が変わる点: 結果シートのタグと 1 ボタン追加、レシートの見出し語、レート行の文言。動きのタイミングは変えていない(motion = On / Auto で OS が許す場合)。
