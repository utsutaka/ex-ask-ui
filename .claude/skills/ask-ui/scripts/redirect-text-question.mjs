// Stop フック: Claude の返答が、質問で終わっていたら、ask-ui で質問し直すよう差し戻す
// 設定: .claude/settings.json の hooks.Stop に登録する
// 判定: 返答の最後の行が、質問の形(?、ですか、ますか、でしょうか、など)で終わっているかを、文面から推定する
// 失敗時の扱い: このスクリプト自体が失敗したときは、何も出力せず終了する(返答は止められない)
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const BLOCK_REASON = '返答の最後が、利用者への質問になっています。利用者への質問は、チャットの文章ではなく、'
    + 'ask-ui スキルでブラウザに表示して行ってください。文章の質問は取り除き、ask-ui で質問し直してください。'
    + '質問ではない場合(確認の依頼、報告、説明の終わりなど)は、質問の形で終えないよう、文を言い換えてください。';

// 最後の行が、質問の形かを判定するための表現
const QUESTION_ENDING = /([?？]|(ですか|ますか|ませんか|でしょうか|ましょうか|ませんでしょうか|どれですか|どちらですか)[。.!！]?)$/;

// 行末の、強調の記号(太字、斜体、コード)と、閉じかっこを取り除く
function stripDecoration(line) {
    return line.replace(/[*_`~]+/g, '').replace(/[」』)）"'”’\s]+$/, '').trim();
}

/** 最後の空でない行を返す(コードブロックの中や、引用の行は除く。強調の記号は取り除く) */
export function lastLine(message) {
    let inCode = false;
    let last = '';
    for (const raw of String(message ?? '').split(/\r?\n/)) {
        const line = raw.trim();
        if (line.startsWith('```')) {
            inCode = !inCode;
            continue;
        }
        if (inCode || line === '' || line.startsWith('>')) {
            continue;
        }
        last = line;
    }
    return stripDecoration(last);
}

/** 返答が、質問で終わっているかを推定する */
export function endsWithQuestion(message) {
    return QUESTION_ENDING.test(lastLine(message));
}

/** フックの入力から、出力する JSON(止めないときは null)を決める */
export function decide(input) {
    // すでに、このフックの差し戻しの続きの場合は、止めない(無限に差し戻さないため)
    if (input?.stop_hook_active === true) {
        return null;
    }
    if (!endsWithQuestion(input?.last_assistant_message)) {
        return null;
    }
    return { decision: 'block', reason: BLOCK_REASON };
}

// 観察用の記録: 環境変数 ASKUI_HOOK_LOG にファイルのパスがあるときだけ、判定の結果と、最後の行の末尾を残す(誤判定の確認用)。
// 相対パスは、プロジェクトのフォルダからの位置とする。未設定なら、何も書かない(場所を決め打ちにしない。観察が終わったら、この関数と呼び出しを削除する)
function recordObservation(input, output) {
    const target = process.env.ASKUI_HOOK_LOG;
    if (!target) {
        return;
    }
    try {
        const file = resolve(process.env.CLAUDE_PROJECT_DIR ?? process.cwd(), target);
        mkdirSync(dirname(file), { recursive: true });
        const line = lastLine(input?.last_assistant_message).slice(-60);
        appendFileSync(file, `${new Date().toISOString()} blocked=${output !== null} ${line}
`);
    } catch {
        // 記録に失敗しても、判定には影響させない
    }
}

function main() {
    try {
        const input = JSON.parse(readFileSync(0, 'utf8'));
        const output = decide(input);
        recordObservation(input, output);
        if (output !== null) {
            process.stdout.write(JSON.stringify(output));
        }
    } catch (error) {
        // 失敗しても、返答を止めないよう、何も出力せずに終了する
        console.error(`ask-ui の Stop フックの処理に失敗しました: ${error.message}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
