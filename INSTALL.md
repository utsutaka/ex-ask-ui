# ask-ui インストール手順(リポジトリからコピーする方法)

このリポジトリの `.claude/skills/ask-ui/` フォルダを、そのままコピーして、ask-ui を入れる手順です。ask-ui の使い方は [README.md](./README.md) を参照してください。

手順の流れは、次のとおりです。

1. 前提のソフト(Node.js、Chrome、chrome-devtools-mcp など)を入れる
2. `.claude/skills/ask-ui/` フォルダを、インストール先の `.claude/skills/` にコピーする
3. `.claude/` 直下の `settings.json`(なければ新規作成)に、2 つのフックを設定する
4. 動作を確認する

フックは、置き場所(スコープ)を、プロジェクトスコープとユーザースコープの 2 つから選べます。どちらも、この手順に書いています。

## 1. 前提のソフトを入れる

### 1.1 必要なもの

| 名前 | 区分 | 提供元 | 条件 |
| --- | --- | --- | --- |
| Node.js(LTS)と npm | 必須 | Node.js | ask-ui のスクリプトと chrome-devtools-mcp の実行に必要。動作を検証したバージョンは v26.12.1 |
| Chrome | 必須 | Google | 現行の安定版以降 |
| chrome-devtools-mcp | 必須 | claude-plugins-official | 窓を表示する設定(既定)で動かすこと |
| yomiyasu | 任意 | nanaism/yomiyasu | 質問文の推敲に使う。Python が必要。なくても質問は表示される。検証したバージョンは 2.4.0 |
| Python | 任意 | python.org | yomiyasu の同梱スクリプトの実行に必要。検証したバージョンは 3.14.7(必要なバージョンは未確認) |
| frontend-design | 任意 | claude-plugins-official | 画面デザインの指針。実行時には使わない |


### 1.2 依存するプラグインを入れる

プラグインはすべて「マーケットプレイスを導入してから、`/plugin` のパネルでインストールする」方法で入れます。

| プラグイン | マーケットプレイス | マーケットプレイスの導入 |
| --- | --- | --- |
| chrome-devtools-mcp | `claude-plugins-official` | 不要(最初から使えます) |
| frontend-design(任意) | `claude-plugins-official` | 不要(最初から使えます) |
| yomiyasu(任意) | `yomiyasu` | 必要 |

`claude-plugins-official` は最初から使えますが、その中のプラグインは、最初は導入されていません。手順 2〜3 で導入してください。

1. マーケットプレイスの導入が必要なプラグインだけ、次のコマンドを実行します

    ```text
    /plugin marketplace add nanaism/yomiyasu
    ```

2. `/plugin` を実行して、パネルを開きます。上部に Discover、Installed、Marketplaces、Errors、Stats のタブが並びます
3. Discover のタブで、プラグインの名前を入力して検索し、`Enter` で詳細を開いて、インストールします(`Ctrl+S` で、マーケットプレイスによる絞り込みができます)
4. chrome-devtools-mcp を入れた場合は、Claude Code を再起動します

パネルの表示や、インストールのボタンの名前は、バージョンによって異なる場合があります。

出典: code.claude.com の「Create a marketplace」と「Install and manage plugins」


### 1.3 Node.js、Chrome、Python を入れる

この 3 つは、マーケットプレイスの対象外です。Windows では、Node.js と Python を winget で入れる方法を推奨します。macOS と Linux では、各公式サイトの案内に従ってください。

Node.js は必須です。Python は yomiyasu を使う場合に必要です。

#### Node.js(必須)

次のコマンドで、LTS を入れます。

```text
winget install OpenJS.NodeJS.LTS
```

Node.js のバージョンを切り替えて使う場合は、nvm-windows を使います。

```text
winget install CoreyButler.NVMforWindows
nvm install lts
nvm use lts
```

- nvm-windows は、Node.js が別に入っていると、バージョンが切り替わらない場合があります。先に、元の Node.js を削除してください
- `nvm install` と `nvm use` は、管理者権限が必要な場合があります

確認するには、新しいターミナルで `node --version` を実行します。

#### Python(yomiyasu を使う場合のみ)

```text
winget install Python.Python.3.14
```

確認するには、新しいターミナルで `python --version` を実行します。必要なバージョンは未確認です。検証したバージョンは 3.14.7 です。

#### Chrome

Google の公式サイトの案内に従って入れます。

出典: winget-pkgs のマニフェスト(OpenJS.NodeJS.LTS、Python.Python.3.14、CoreyButler.NVMforWindows)、nvm-windows の README


## 2. インストール先を決める

スキルとフックは、同じスコープに置きます。

| スコープ | スキルを置く場所 | フックを書く設定ファイル | 効く範囲 |
| --- | --- | --- | --- |
| プロジェクトスコープ | `<プロジェクト>/.claude/skills/` | `<プロジェクト>/.claude/settings.json` | そのプロジェクトだけ(リポジトリに入れて、共有できる) |
| ユーザースコープ | `~/.claude/skills/`(Windows では `C:\Users\<名前>\.claude\skills\`) | `~/.claude/settings.json` | すべてのプロジェクト(自分の端末だけ) |

- 自分だけが使い、リポジトリに入れたくない場合は、プロジェクトスコープの設定ファイルを、`<プロジェクト>/.claude/settings.local.json` にすることもできます(出典: code.claude.com の「Hooks guide」)
- 同じフックを、両方のスコープに登録しないでください。フックは、スコープをまたいで、追加されて動くため、同じ処理が 2 回行われます
- ユーザースコープのフックは、ask-ui を入れていないプロジェクトでも動きます。ask-ui を使うプロジェクトが限られる場合は、プロジェクトスコープを選んでください

## 3. スキルのフォルダをコピーする

このリポジトリの `.claude/skills/ask-ui/` フォルダを、インストール先の `skills` フォルダにコピーします。`skills` フォルダがなければ、先に作ります。

まず、リポジトリを、作業用の場所に取得します(以下、その場所を `<取得した場所>` と書きます)。次のどちらかの方法を使います。

- git を使う場合: `git clone https://github.com/utsutaka/ex-ask-ui.git <取得した場所>`
- git を使わない場合: GitHub のリポジトリのページで、ZIP をダウンロードして解凍する(取得した場所は、解凍してできたフォルダ)

コピーするのは、`<取得した場所>/.claude/skills/ask-ui/` だけです。ほかのファイル(README.md、LICENSE など)は、コピーしなくてかまいません。

### 3.1 プロジェクトスコープ

プロジェクトの最上位のフォルダで、次を実行します。

PowerShell(Windows):

```text
New-Item -ItemType Directory -Force .claude\skills | Out-Null
Copy-Item -Recurse <取得した場所>\.claude\skills\ask-ui .claude\skills\ask-ui
```

bash(macOS、Linux、Git Bash):

```text
mkdir -p .claude/skills
cp -r <取得した場所>/.claude/skills/ask-ui .claude/skills/ask-ui
```

### 3.2 ユーザースコープ

PowerShell(Windows):

```text
New-Item -ItemType Directory -Force "$HOME\.claude\skills" | Out-Null
Copy-Item -Recurse <取得した場所>\.claude\skills\ask-ui "$HOME\.claude\skills\ask-ui"
```

bash(macOS、Linux、Git Bash):

```text
mkdir -p ~/.claude/skills
cp -r <取得した場所>/.claude/skills/ask-ui ~/.claude/skills/ask-ui
```

コピー先に `ask-ui/` がすでにあると、その中に `ask-ui/` が入り、二重になります。すでにある場合は、先に削除してからコピーしてください(「7. 更新と削除」を参照)。

### 3.3 コピーの確認

次のように、コピーされていることを確認します(`.claude/skills/` の直下が `ask-ui/` で、その下に `SKILL.md` があること)。

```text
.claude/skills/ask-ui/
├── SKILL.md
├── references/
├── templates/
└── scripts/
```

`.claude/skills/ask-ui/ask-ui/SKILL.md` のように、`ask-ui` が二重になっている場合は、コピー先を間違えています。`.claude/skills/ask-ui/` を削除して、やり直してください。

## 4. フックを設定する

`.claude/` の直下の `settings.json` に、2 つのフックを書きます。2 つは一組で登録します。

| フック | 動くとき | 役割 | スクリプト |
| --- | --- | --- | --- |
| `Stop` | Claude の返答が終わったとき | 返答の最後が質問の形で終わっていたら、返答を差し戻し、ask-ui で質問し直すよう伝えます | `redirect-text-question.mjs` |
| `UserPromptSubmit` | 依頼を送信したとき | 報告・説明の依頼らしい送信のときだけ、ask-ui の報告・説明の手順で画面に表示するよう、注意を差し込みます(送信は止めません) | `remind-report.mjs` |

- 片方だけでも動きます。`Stop` だけなら、質問の差し戻しだけが、`UserPromptSubmit` だけなら、報告・説明の起動の補助だけが働きます。どちらも、フックを入れない場合は、ask-ui は動きますが、Claude が文章や `AskUserQuestion` で質問したり、報告・説明を文章で書いたりすることがあります(起動は、確率的になります)
- `UserPromptSubmit` の代わりに、CLAUDE.md に、次の 1 行を足す方法もあります。どちらも、起動は確率的です

    ```text
    調査の報告と、UI を使った説明は、文章で長く書かず、ask-ui スキルで HTML の画面に表示する。
    ```

- 起動率の目安(許可モード default、各例文 3〜5 回の測定): 質問は 100%(39 / 39)、説明は、フックなしで 95%、ありで 100%、報告は、フックなしで 44%、ありで 72% でした。報告は、フックを入れても、画面が使われないことがあります

`settings.json` が、すでにあるときは、既存の内容を消さず、`hooks` の中の `Stop` と `UserPromptSubmit` の配列に、次の項目を足します(`hooks` がなければ、`hooks` ごと足します)。`settings.json` がないときは、新規に作成し、次の内容をそのまま書きます。

### 4.1 プロジェクトスコープ(`<プロジェクト>/.claude/settings.json`)

`$CLAUDE_PROJECT_DIR` は、プロジェクトの最上位のフォルダを指します(出典: code.claude.com の「Hooks guide」)。

```json
{
    "hooks": {
        "Stop": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "node \"$CLAUDE_PROJECT_DIR/.claude/skills/ask-ui/scripts/redirect-text-question.mjs\""
                    }
                ]
            }
        ],
        "UserPromptSubmit": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "node \"$CLAUDE_PROJECT_DIR/.claude/skills/ask-ui/scripts/remind-report.mjs\"",
                        "timeout": 10
                    }
                ]
            }
        ]
    }
}
```

### 4.2 ユーザースコープ(`~/.claude/settings.json`)

Windows では、`C:\Users\<名前>\.claude\settings.json` です。

```json
{
    "hooks": {
        "Stop": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "node \"$HOME/.claude/skills/ask-ui/scripts/redirect-text-question.mjs\""
                    }
                ]
            }
        ],
        "UserPromptSubmit": [
            {
                "hooks": [
                    {
                        "type": "command",
                        "command": "node \"$HOME/.claude/skills/ask-ui/scripts/remind-report.mjs\"",
                        "timeout": 10
                    }
                ]
            }
        ]
    }
}
```

`$HOME` の展開: Windows の Git Bash でフックが動く環境では、`"$HOME/.claude/..."` が、`C:/Users/<名前>/.claude/...` に展開され、node に渡ることを確認しています。Git Bash を入れていない Windows(フックが PowerShell で動く環境)は、未確認です。動かない場合は、`$HOME` の部分を、ホームフォルダの絶対のパス(例: `C:/Users/<名前>`)に書き換えてください。

## 5. そのほかの準備

- ask-ui を使うプロジェクトの `.gitignore` に、`.temp/` を追加します(ask-ui が、作業用のフォルダを `.temp/` に作ります)
- chrome-devtools-mcp を、まだ入れていない場合は、本書の「1.2 依存するプラグインを入れる」で入れます
- Claude Code を再起動します

## 6. 動作を確認する

1. Claude Code で `/skills` を実行し、一覧に `ask-ui` が出ることを確認します
2. 2 つのフックのスクリプトが動くことを、ターミナルで確認します(プロジェクトスコープは、プロジェクトの最上位のフォルダで実行します。ユーザースコープは、パスを `~/.claude/skills/ask-ui/...` に読み替えます)

    PowerShell(Windows):

    ```text
    '{"prompt":"調査結果をレポートにして、ブラウザの画面で読めるようにして"}' | node .claude\skills\ask-ui\scripts\remind-report.mjs
    '{"last_assistant_message":"どちらにしますか?"}' | node .claude\skills\ask-ui\scripts\redirect-text-question.mjs
    ```

    bash(macOS、Linux、Git Bash):

    ```text
    echo '{"prompt":"調査結果をレポートにして、ブラウザの画面で読めるようにして"}' | node .claude/skills/ask-ui/scripts/remind-report.mjs
    echo '{"last_assistant_message":"どちらにしますか?"}' | node .claude/skills/ask-ui/scripts/redirect-text-question.mjs
    ```

    期待する結果: 1 つ目は `additionalContext` を含む JSON が、2 つ目は `"decision":"block"` を含む JSON が、出力されます
3. Claude Code で、「どちらの色がいいか、画面で見せて選ばせて」のように頼み、ブラウザの窓に質問が表示されることを確認します

窓が開かない場合は、chrome-devtools-mcp が、窓を表示する設定(`--headless` なし)で動いているかを確認してください。

## 7. 更新と削除

### 更新

リポジトリの新しい内容(`git pull`、または ZIP の再ダウンロード)で、スキルを入れ替えます。古いファイルが残らないよう、インストール先の `.claude/skills/ask-ui/` を削除してから、「3. スキルのフォルダをコピーする」をやり直します。フックの設定は、通常、変更不要です(新しい版で、フックの設定が変わる場合は、新しい版の INSTALL.md の「4. フックを設定する」に従います)。

### 削除

1. `.claude/skills/ask-ui/` フォルダを削除します
2. `settings.json` から、2 つのフックの項目(`redirect-text-question.mjs` と `remind-report.mjs` を呼ぶもの)を削除します
3. Claude Code を再起動します

### winget で入れたソフトの更新と削除

「1.3」で winget を使って入れた Node.js、nvm-windows、Python の更新と削除の方法です。

#### 入れたものを確認する

```text
winget list OpenJS.NodeJS.LTS
winget list Python.Python
winget list CoreyButler.NVMforWindows
```

#### 更新する

更新できるものの一覧を表示します。

```text
winget upgrade
```

パッケージ ID を指定して、更新します。

```text
winget upgrade --id OpenJS.NodeJS.LTS
winget upgrade --id CoreyButler.NVMforWindows
winget upgrade --id Python.Python.3.14
```

- `winget upgrade --all` で、更新できるものを一度にすべて更新できます。ask-ui と関係のないソフトも更新されるため、使う場合は一覧を確認してください
- `OpenJS.NodeJS.LTS` の更新は LTS の範囲で行われます
- Python は、パッケージ ID がマイナーバージョンごとに分かれています(例: `Python.Python.3.14`、`Python.Python.3.15`)。`winget upgrade` で更新されるのは、同じマイナーバージョンの新しいバージョンです。次のマイナーバージョンを使う場合は、そのパッケージ ID を `winget install` で入れてください
- nvm-windows で入れた Node.js の更新は `nvm install lts` で新しいバージョンを入れ、`nvm use lts` で切り替えます

#### 削除する

```text
winget uninstall --id OpenJS.NodeJS.LTS --source winget
winget uninstall --id Python.Python.3.14 --source winget
winget uninstall --id CoreyButler.NVMforWindows --source winget
```

- `--source winget` は、Microsoft Store の契約の確認が表示されるのを避けるための指定です
- winget で削除できない場合は、Windows の「設定」の「アプリ」から削除できます
- nvm-windows で入れた Node.js は、`nvm uninstall <バージョン>` で個別に削除します。`nvm list` で、入っているバージョンを確認できます
- Node.js を削除すると、ask-ui のスクリプトと chrome-devtools-mcp が動かなくなります。Python を削除すると、yomiyasu による推敲が使えなくなります(質問の表示は続けられます)

出典: Microsoft Learn の winget の `upgrade` と `uninstall` コマンド、winget-pkgs のマニフェスト、nvm-windows の README

## 8. うまくいかない場合

| 症状 | 確認すること |
| --- | --- |
| `/skills` に `ask-ui` が出ない | `.claude/skills/ask-ui/SKILL.md` の場所(二重のフォルダになっていないか)。Claude Code の再起動。同じ名前のスキルが、別のスコープにないか(ユーザースコープが優先されます。出典: code.claude.com の「Resolve skills that share a name」) |
| 質問が文章で出る(画面が出ない) | `Stop` フックの設定(JSON の形、パス)。再起動したか。スキルとフックが、同じスコープに入っているか |
| フックが 2 回動く | 同じフックを、プロジェクトスコープとユーザースコープの両方に書いていないか |
| ブラウザの窓が開かない | chrome-devtools-mcp が入っているか。窓を表示する設定か(`--headless` なし)。ポップアップのブロック |
| `node` が見つからない | Node.js が入っているか。新しいターミナルで `node --version` を実行して確認する |
| 報告の依頼で、画面が使われない | `UserPromptSubmit` フックの設定。ただし、フックを入れても、報告は、画面が使われないことがあります(起動率の目安は、「4. フックを設定する」を参照) |

出典: code.claude.com の「Hooks guide」(Configure hook location)、「Extend Claude with skills」(Choose where skills load)
