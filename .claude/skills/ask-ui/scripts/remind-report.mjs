// UserPromptSubmit フック: 報告・説明の依頼らしい送信のとき、ask-ui で画面に表示するよう注意を差し込む
// 設定: .claude/settings.json の hooks.UserPromptSubmit に登録する
// 判定: 送信された文に、報告または説明の合図の語があるかを、文面から推定する(誤りがあるため、止めずに注意にとどめる)
// 失敗時の扱い: 何も出力せず終了する(利用者の送信は止めない)
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 合図の語。報告系と説明系のそれぞれで、「何を」と「どこに」の両方が揃ったときだけ当てる
export const REPORT_SUBJECTS = ['報告', 'レポート', '調査結果'];
export const REPORT_PLACES = ['HTML', '画面', 'UI', 'ブラウザ'];
export const EXPLAIN_SUBJECTS = ['説明', '解説'];
export const EXPLAIN_PLACES = ['UI', '画面', 'HTML', '図', 'ブラウザ', '視覚'];

export const REMINDER = 'この依頼が、調査の報告または UI を使った説明の依頼なら、文章で長く書かず、ask-ui スキルの報告・説明の手順で画面に表示してください。'
    + 'そうでなければ、この注意は無視してください。';

function includesAny(text, words) {
    const lower = text.toLowerCase();
    return words.some((word) => lower.includes(word.toLowerCase()));
}

/** 報告・説明の合図があるかを判定する */
export function hasSignal(prompt) {
    if (typeof prompt !== 'string') {
        return false;
    }
    return (includesAny(prompt, REPORT_SUBJECTS) && includesAny(prompt, REPORT_PLACES))
        || (includesAny(prompt, EXPLAIN_SUBJECTS) && includesAny(prompt, EXPLAIN_PLACES));
}

/** フックの入力から、出力する JSON(出さないときは null)を決める */
export function decide(input) {
    if (!hasSignal(input?.prompt)) {
        return null;
    }
    return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: REMINDER } };
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
