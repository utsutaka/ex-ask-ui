# 質問と議論の票の例

`SKILL.md` の書式の説明に対応する、検証に合格する例。コピーして、内容を書き換える。図表の見本は `references/exhibit-examples.md` を参照する。票の `kind`(`question` または `discussion`)は、`build-pages.mjs` の `--kind report|explain`(報告・説明の種別)とは別のものである。

## 書き方の指針

- 質問の題名は、完全な疑問文にする(題名だけで、何を決める質問か分かるように)。議論の題名は、疑問文にせず、論点の名前にする。題名の形は、検証では確かめない
- 「決めること」「1. 現状」「推奨」(議論は「議論したいこと」)は、項目名をつけず、1 つの自然な文章で書く。含める要素と、良い例、悪い例は、`SKILL.md` の「文章にする章の書き方」を参照する
- 「現状」の文章には、すでに決まったことと、その反映先(文書名と節)を含める(なければ「決定済みの事項はまだない」と書く)
- 「効果」は、案を実行して得られる結果。「あるべき姿との一致」は、案が、あるべき姿にどれだけ近いかの評価(高、中、低と、その理由)。同じことを重複して書かない
- 質問の「推奨案」は、先頭の選択肢の名前が表示される。複数選択の質問でも、推奨は先頭の 1 件(組み合わせを推奨したいときは、「最適である理由」に書く)
- 推奨を示せないときは、`recommendation` を `none`(「推奨案：なし」)にし、示せない理由と、判断に必要な情報を書く。このとき、どの選択肢も、`recommended` は偽で、`differenceFromRecommended` を持たない
- 推奨があるとき、先頭の選択肢は `recommended` が真で、`differenceFromRecommended`(推奨との違い)を持たない。先頭以外は、`recommended` が偽で、`differenceFromRecommended` を持つ
- 「戻せない可能性：」は、ファイルやデータの削除、データの書き換え、外部への送信や公開、未コミットの変更の上書きのときだけ、`risk`(リスク・デメリット)の先頭に書く。通常の文書や設定の変更では書かない
- 議論の「見立て」は、選ばせるための推奨ではなく、議論の出発点となる仮の結論。確信の度合い(高、中、低)と、理由を書く
- 図表は、問題点に付ける。付けない場合は、`noExhibitReason` に、要らない理由を書く(図表がある場合は、書かない)

## 質問(推奨あり)

```json
{
    "kind": "question",
    "items": [
        {
            "id": "q-example",
            "title": "設定ファイルの形式は、どれにしますか?",
            "decide": {
                "text": "設定ファイルの形式を決めてください。以降の作業が、この形式を前提に進むため、先に決めておく必要があります。回答がないと次に進めないので必須で、今日中に決めたい事項です。うつたかさんの指示がきっかけで、根拠は確実です。"
            },
            "current": {
                "text": "設定は今、3 つのファイルに分かれていて、読み込みの処理もファイルごとに別々です。決定済みなのは、設定を 1 つにまとめる方針だけで、spec.md の「設定」の節に書いてあります。形式は、まだ決まっていません。"
            },
            "problem": {
                "description": "今のままだと、何が困るのかを書きます",
                "exhibits": [
                    {
                        "kind": "table",
                        "caption": "案の比較",
                        "html": "<table><thead><tr><th>項目</th><th>案 A</th><th>案 B</th></tr></thead><tbody><tr><td>導入</td><td>不要</td><td>必要</td></tr></tbody></table>"
                    }
                ]
            },
            "ideal": {
                "vision": "成果物の利用者が、喜ぶ状態を書きます",
                "notes": "採用するときの注意があれば書きます"
            },
            "recommendation": {
                "given": {
                    "text": "案 A を推奨します。あるべき姿に最も近く、導入の手間も最小のためです。採用すると、3 つの設定ファイルを 1 つにまとめ、読み込みの処理を 1 か所に集約します。"
                }
            },
            "multiple": false,
            "allowFreeText": true,
            "options": [
                {
                    "id": "a",
                    "label": "案 A",
                    "recommended": true,
                    "content": "案 Aの内容",
                    "effect": "案 Aの効果",
                    "feasibility": "可能",
                    "risk": "特筆するリスクはありません",
                    "fit": {
                        "level": "高",
                        "reason": "あるべき姿に最も近い"
                    }
                },
                {
                    "id": "b",
                    "label": "案 B",
                    "recommended": false,
                    "content": "案 Bの内容",
                    "effect": "案 Bの効果",
                    "feasibility": "可能",
                    "risk": "戻せない可能性：未コミットの設定ファイルを上書きします",
                    "fit": {
                        "level": "中",
                        "reason": "理由を書きます"
                    },
                    "differenceFromRecommended": "案 A より、導入が重い"
                }
            ]
        }
    ]
}
```

## 質問(推奨なし)

```json
{
    "kind": "question",
    "items": [
        {
            "id": "q-none",
            "title": "推奨を示せない場合は、どう書きますか?",
            "decide": {
                "text": "設定ファイルの形式を決めてください。以降の作業が、この形式を前提に進むため、先に決めておく必要があります。回答がないと次に進めないので必須で、今日中に決めたい事項です。うつたかさんの指示がきっかけで、根拠は確実です。"
            },
            "current": {
                "text": "設定は今、3 つのファイルに分かれていて、読み込みの処理もファイルごとに別々です。決定済みなのは、設定を 1 つにまとめる方針だけで、spec.md の「設定」の節に書いてあります。形式は、まだ決まっていません。"
            },
            "problem": {
                "description": "今のままだと、何が困るのかを書きます",
                "exhibits": [
                    {
                        "kind": "table",
                        "caption": "案の比較",
                        "html": "<table><thead><tr><th>項目</th><th>案 A</th><th>案 B</th></tr></thead><tbody><tr><td>導入</td><td>不要</td><td>必要</td></tr></tbody></table>"
                    }
                ]
            },
            "ideal": {
                "vision": "成果物の利用者が、喜ぶ状態を書きます",
                "notes": "採用するときの注意があれば書きます"
            },
            "recommendation": {
                "none": {
                    "text": "判断の材料が足りず、推奨を決められません。案 A と案 B の運用コストを実測すれば、推奨を示せます。"
                }
            },
            "multiple": false,
            "allowFreeText": true,
            "options": [
                {
                    "id": "a",
                    "label": "案 A",
                    "recommended": false,
                    "content": "案 Aの内容",
                    "effect": "案 Aの効果",
                    "feasibility": "可能",
                    "risk": "特筆するリスクはありません",
                    "fit": {
                        "level": "中",
                        "reason": "理由を書きます"
                    }
                },
                {
                    "id": "b",
                    "label": "案 B",
                    "recommended": false,
                    "content": "案 Bの内容",
                    "effect": "案 Bの効果",
                    "feasibility": "可能",
                    "risk": "特筆するリスクはありません",
                    "fit": {
                        "level": "中",
                        "reason": "理由を書きます"
                    }
                }
            ]
        }
    ]
}
```

## 議論

```json
{
    "kind": "discussion",
    "items": [
        {
            "id": "d-example",
            "title": "設定ファイルの管理方針",
            "topic": {
                "questions": [
                    "設定は、1 つにまとめるべきか",
                    "環境ごとの違いは、どこに置くか"
                ],
                "text": "設定の管理方針は、以降の作業の前提になるため、先に議論しておく価値があります。決めなくても作業は進められますが、早いほど手戻りが少なくなります。うつたかさんの発言がきっかけで、根拠は確実です。"
            },
            "current": {
                "text": "今の設定は、3 つのファイルに分かれています。決定済みの事項は、まだありません。"
            },
            "problem": {
                "description": "設定の場所が分かりにくい、という問題があります",
                "noExhibitReason": "論点が、文章だけで足りるため"
            },
            "ideal": {
                "vision": "成果物の利用者が、喜ぶ状態を書きます",
                "notes": "採用するときの注意があれば書きます"
            },
            "drafts": [
                {
                    "id": "x",
                    "label": "叩き台 X",
                    "content": "叩き台 Xの内容",
                    "effect": "叩き台 Xの効果",
                    "risk": "叩き台 Xのリスク",
                    "fit": {
                        "level": "中",
                        "reason": "理由を書きます"
                    },
                    "open": "叩き台 Xで、まだ決まっていない点"
                },
                {
                    "id": "y",
                    "label": "叩き台 Y",
                    "content": "叩き台 Yの内容",
                    "effect": "叩き台 Yの効果",
                    "risk": "叩き台 Yのリスク",
                    "fit": {
                        "level": "中",
                        "reason": "理由を書きます"
                    },
                    "open": "叩き台 Yで、まだ決まっていない点"
                }
            ],
            "view": {
                "conclusion": "叩き台 X を軸にするのがよさそうです",
                "basis": "あるべき姿との一致が高いため",
                "unknown": "運用コストの実測がありません",
                "confidence": {
                    "level": "中",
                    "reason": "根拠に、推測を含むため"
                }
            },
            "opinion": {
                "guide": "賛成できる点、引っかかる点、足りない視点を書いてください"
            }
        }
    ]
}
```
