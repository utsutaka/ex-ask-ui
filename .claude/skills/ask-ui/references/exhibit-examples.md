# 図表の見本

質問の `exhibits` に入れる、図表の見本である。コピーして、内容を書き換える。

共通の約束:

- `svg` と `table` の `html` に、スクリプト要素、イベント属性(`onclick` など)、`javascript:`、外部への参照(`http://` の画像など)を含めない
- 図は、`viewBox` の幅の中に、すべての要素を収める(右端の要素の `x` + 幅が、`viewBox` の幅以下になること)
- `mermaid` の図表は、`html` ではなく `source` に、記述を書く。先頭の行を、6 種の宣言のどれかにし、subgraph には、英数字の ID と角括弧の見出しを付ける(下の「mermaid」の節)
- 色は、`currentColor`(文字と同じ色)を使い、文字でも意味を伝える(色だけに頼らない)
- 1 つの図に入れる要素は、7 つ程度までにする

## 流れ図(手順、処理の流れ)

左から右へ、箱を並べ、矢印でつなぐ。

```html
<svg viewBox="0 0 640 110" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="処理の流れ">
<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>
<rect x="10" y="30" width="170" height="50" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
<text x="95" y="60" text-anchor="middle" font-size="14" fill="currentColor">質問票を書く</text>
<line x1="180" y1="55" x2="225" y2="55" stroke="currentColor" stroke-width="1.5" marker-end="url(#ar)"/>
<rect x="235" y="30" width="170" height="50" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
<text x="320" y="60" text-anchor="middle" font-size="14" fill="currentColor">規則を検証する</text>
<line x1="405" y1="55" x2="450" y2="55" stroke="currentColor" stroke-width="1.5" marker-end="url(#ar)"/>
<rect x="460" y="30" width="170" height="50" rx="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
<text x="545" y="60" text-anchor="middle" font-size="14" fill="currentColor">ブラウザに表示する</text>
</svg>
```

## タイミングチャート(順序、時間の前後、いつ何が動くか)

横軸を時間にし、登場する主体(線)ごとに、動く区間を帯で示す。

```html
<svg viewBox="0 0 640 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="タイミングチャート">
<text x="10" y="45" font-size="13" fill="currentColor">利用者</text>
<line x1="90" y1="40" x2="630" y2="40" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3"/>
<rect x="100" y="30" width="60" height="20" fill="none" stroke="currentColor" stroke-width="1.5"/>
<text x="130" y="44" text-anchor="middle" font-size="11" fill="currentColor">発言</text>
<text x="10" y="95" font-size="13" fill="currentColor">Claude</text>
<line x1="90" y1="90" x2="630" y2="90" stroke="currentColor" stroke-width="1" stroke-dasharray="4 3"/>
<rect x="170" y="80" width="260" height="20" fill="none" stroke="currentColor" stroke-width="1.5"/>
<text x="300" y="94" text-anchor="middle" font-size="11" fill="currentColor">考える、返答を書く</text>
<text x="10" y="135" font-size="13" fill="currentColor">フック</text>
<rect x="440" y="125" width="60" height="20" fill="none" stroke="currentColor" stroke-width="1.5"/>
<text x="470" y="139" text-anchor="middle" font-size="11" fill="currentColor">判定</text>
</svg>
```

## 構造図、オブジェクト図(部品の関係、何が何を持つか)

箱に名前と中身を書き、線で関係をつなぐ。線の上に、関係の名前(「使う」「持つ」)を書く。

```html
<svg viewBox="0 0 560 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="構造図">
<rect x="10" y="20" width="200" height="90" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
<text x="110" y="42" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">質問票</text>
<text x="20" y="66" font-size="12" fill="currentColor">質問(1〜4 件)</text>
<text x="20" y="86" font-size="12" fill="currentColor">経緯、状況、重要度</text>
<line x1="210" y1="65" x2="340" y2="65" stroke="currentColor" stroke-width="1.5"/>
<text x="275" y="58" text-anchor="middle" font-size="12" fill="currentColor">持つ</text>
<rect x="340" y="20" width="200" height="90" rx="4" fill="none" stroke="currentColor" stroke-width="1.5"/>
<text x="440" y="42" text-anchor="middle" font-size="14" font-weight="700" fill="currentColor">選択肢(2〜4 件)</text>
<text x="350" y="66" font-size="12" fill="currentColor">理由、メリット、デメリット</text>
</svg>
```

## 棒グラフ(量の比較)

棒の長さで量を比べる。値は、棒の横に文字でも書く。

```html
<svg viewBox="0 0 560 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="棒グラフ">
<text x="10" y="35" font-size="13" fill="currentColor">案 A</text>
<rect x="70" y="20" width="300" height="22" fill="none" stroke="currentColor" stroke-width="1.5"/>
<text x="380" y="36" font-size="13" fill="currentColor">300 ミリ秒</text>
<text x="10" y="80" font-size="13" fill="currentColor">案 B</text>
<rect x="70" y="65" width="120" height="22" fill="none" stroke="currentColor" stroke-width="1.5"/>
<text x="200" y="81" font-size="13" fill="currentColor">120 ミリ秒</text>
</svg>
```

## mermaid(手順、状態、やり取り、構造、データの関係を、記述で書く)

`kind: "mermaid"` の `source` に、mermaid の記述を書く(`html` は持たない)。票を作るときに、記述が図(SVG)に変換され、図の下に、元の記述が折りたたまれて添えられる。報告・説明の本文では、`<pre class="mermaid">` に書く(`references/report-and-save.md`)。

- 対応する図は、次の 6 種。先頭の行で、種類を宣言する(`graph` と `flowchart`、`sequenceDiagram`、`stateDiagram-v2`、`classDiagram`、`erDiagram`、`xychart-beta`)
- 5,000 文字まで。それより長くなる場合は、図を分けるか、`svg` で書く
- 変換できない記述(対応外の種類、綴りの誤りなど)は、検証が警告を出し、表示では、図の代わりに、原文が展開される。書く前後の確認は、`references/mermaid-notes.md` を読む
- 量の比較や、細かい配置は、今までの `svg`(棒グラフなど)のほうが、向いている
- 下の見本は、JSON の文字列にしてある(改行は `\n`)。そのまま、票の `exhibits` に入れてよい

### フローチャート(手順、処理の流れ)

```json
{ "kind": "mermaid", "caption": "処理の流れ", "source": "graph TD\n  A[質問票を書く] --> B{検証}\n  B -->|合格| C[ブラウザに表示]\n  B -->|不合格| A" }
```

### 状態の図(状態の移り変わり)

```json
{ "kind": "mermaid", "caption": "状態の移り変わり", "source": "stateDiagram-v2\n  [*] --> 待機\n  待機 --> 回答済み: 送信\n  待機 --> 中断: 窓を閉じる\n  回答済み --> [*]" }
```

### シーケンス図(やり取りの順序)

```json
{ "kind": "mermaid", "caption": "やり取りの順序", "source": "sequenceDiagram\n  participant 利用者\n  participant Claude\n  利用者->>Claude: 依頼\n  Claude-->>利用者: 質問を表示" }
```

### クラス図(部品の構造)

```json
{ "kind": "mermaid", "caption": "質問票の構造", "source": "classDiagram\n  class 質問票 {\n    +kind\n    +items\n  }\n  質問票 --> 質問" }
```

### ER 図(データの関係)

```json
{ "kind": "mermaid", "caption": "データの関係", "source": "erDiagram\n  質問票 ||--o{ 質問 : 持つ\n  質問 ||--o{ 選択肢 : 持つ" }
```

### XY の図(量の比較。棒と線)

```json
{ "kind": "mermaid", "caption": "処理時間の比較", "source": "xychart-beta\n  title \"処理時間\"\n  x-axis [A, B, C]\n  y-axis \"ms\" 0 --> 400\n  bar [300, 120, 200]" }
```

### subgraph を使うとき

日本語だけの subgraph 名を、複数使うと、2 つ目以降の見出しが、1 つ目と同じになる。**英数字の ID と、角括弧の見出しを付ける**(`subgraph IN[入力]`)。

```json
{ "kind": "mermaid", "caption": "入力と処理", "source": "graph TD\n  subgraph IN[入力]\n    A[票]\n  end\n  subgraph PR[処理]\n    C[検証]\n  end\n  A --> C" }
```

悪い例(見出しが、両方「入力」になる。警告も出ない): `subgraph 入力` と `subgraph 処理` を、並べて書く

## 表(項目を比べる)

`kind: "table"` の `html` に、`<table>` を書く。1 行目に、見出し(`<th>`)を置く。

```html
<table><thead><tr><th>項目</th><th>案 A</th><th>案 B</th></tr></thead>
<tbody><tr><td>作業量</td><td>小</td><td>大</td></tr></tbody></table>
```

## 画面案(モック)

`kind: "mock"` の `html` に、見た目だけの HTML を書く。CSS(`style` 属性、`<style>`)は使えるが、スクリプトと外部通信は実行されない。外部のフォントと画像は使わない。案を比べるときは、同じ内容を、`display:flex` で並べると、見比べやすい。
