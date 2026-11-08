// UserPromptSubmit フック: 返答を書き始める前に、これから書くものの出し方を判断するよう、短い注意を差し込む
// 設定: .claude/settings.json の hooks.UserPromptSubmit に登録する
// 判定: 注意を出すかどうかは、送信された文の内容(合図の語)に頼らない。判断の対象は、利用者が何と打ったかではなく、本エージェントがこれから何を書くか。
//       極端に短い入力(確認の返事など)だけを除き、毎回、注意を差し込む(促すだけで、送信は止めない)
//       加えて、報告または説明の語があるときだけ、画面で出すことを名指しした 1 文を足す(混成案)
// 経緯: 2026-11-08 に、合図の語で絞る方式から、毎回の注意に改めた。同日の測定の後、名指しの 1 文を足す混成案にした(機能 002 の FR-026)。スクリプトの名前と登録は、導入済みの設定を変えないため、そのままにしている
// 失敗時の扱い: 何も出力せず終了する(利用者の送信は止めない)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 注意を差し込む入力の最小の長さ(前後の空白を除いた文字数)。これ未満は「極端に短い入力」として、何も出力しない。目安であり、実測で調整する
export const MIN_PROMPT_LENGTH = 10;

export const REMINDER = '返答を書き始める前に、これから書くものが、利用者への質問、議論、調査の報告、説明のどれかを判断してください。'
    + 'どれかなら、ask-ui スキルの書式で出します。'
    + 'SVG、mermaid の図、画面のモックなど、ブラウザでないと表示できない図表がつくときは画面で、'
    + 'つかないときは文章版(報告・説明は、ふつうの返答)で出します。';

// 報告または説明の語。入力にあるときだけ、REPORT_HINT を足す(注意を出すかどうかには使わない)
export const REPORT_WORDS = ['報告', 'レポート', '調査結果', '説明', '解説'];

// 名指しの 1 文。2026-11-08 の測定で、一般的な注意だけでは、報告の起動率が旧方式より低かったため足した(混成案。機能 002 の FR-026)
export const REPORT_HINT = 'この依頼は、報告または説明を求めている可能性があります。'
    + 'SVG、mermaid の図、画面のモックなど、ブラウザでないと表示できない図表がつくなら、文章で長く書かず、ask-ui スキルの報告・説明の手順で画面に表示してください。';

/** 注意を差し込む対象の入力かを判定する(文字列で、極端に短くない) */
export function shouldRemind(prompt) {
    return typeof prompt === 'string' && prompt.trim().length >= MIN_PROMPT_LENGTH;
}

/** 入力に、報告または説明の語があるかを判定する */
export function hasReportWord(prompt) {
    return typeof prompt === 'string' && REPORT_WORDS.some((word) => prompt.includes(word));
}

/** フックの入力から、出力する JSON(出さないときは null)を決める */
export function decide(input) {
    const prompt = input?.prompt;
    if (!shouldRemind(prompt)) {
        return null;
    }
    const context = hasReportWord(prompt) ? `${REMINDER}${REPORT_HINT}` : REMINDER;
    return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: context } };
}

function main() {
    try {
        // 起動率の測定で、フックなしの条件を作るための目印
        if (process.env.ASKUI_REMIND_OFF) {
            return;
        }
        const input = JSON.parse(readFileSync(0, 'utf8'));
        const output = decide(input);
        if (output !== null) {
            process.stdout.write(JSON.stringify(output));
        }
    } catch (error) {
        // 失敗しても、送信を止めないよう、何も出力せずに終了する
        console.error(`ask-ui の UserPromptSubmit フックの処理に失敗しました: ${error.message}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
