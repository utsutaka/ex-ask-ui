// PreToolUse フック: AskUserQuestion の呼び出しを拒否し、ask-ui スキルを使うよう Claude に伝える
// 現状: 登録していない(2026-10-26 に、Stop フック redirect-text-question.mjs に切り替えた)。使う場合は、.claude/settings.json の hooks.PreToolUse に、matcher "AskUserQuestion" で登録する
// 例外: ask-ui が技術的に失敗したときは、目印のファイル ask-ui-fallback を、一時フォルダ(Claude Code の scratchpad。フックの入力の scratchpad_dir)に作ってから AskUserQuestion を呼ぶ。
//       目印があれば、1 回だけ許可し、目印を削除する(有効期限は 10 分)
// 失敗時の扱い: このスクリプト自体が失敗したときは、何も出力せず終了する(許可として扱われ、質問は止まらない)
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export const FALLBACK_MARKER = 'ask-ui-fallback';
export const MARKER_TTL_MS = 10 * 60 * 1000;

export const DENY_REASON = 'AskUserQuestion は使わないでください。利用者への質問は、すべて ask-ui スキルで、ブラウザに表示して行ってください。'
    + 'ask-ui が技術的に失敗した場合(ブラウザが使えない、窓を開けないなど)だけ、'
    + '作業用の一時フォルダ(scratchpad)に `ask-ui-fallback` というファイルを作ってから、AskUserQuestion を呼び直してください。';

/** 目印のファイルが有効なら true を返し、目印を削除する(1 回だけ許可する)。目印は、一時フォルダの直下に置く */
export function consumeFallbackMarker(tempDir, now = Date.now()) {
    const marker = join(tempDir, FALLBACK_MARKER);
    if (!existsSync(marker)) {
        return false;
    }
    let valid = false;
    try {
        valid = now - statSync(marker).mtimeMs <= MARKER_TTL_MS;
    } finally {
        try {
            unlinkSync(marker);
        } catch (error) {
            console.error(`目印のファイルを削除できませんでした: ${error.message}`);
        }
    }
    return valid;
}

/** フックの入力から、出力する JSON(許可のときは null)を決める */
export function decide(input, now = Date.now()) {
    if (input?.tool_name !== 'AskUserQuestion') {
        return null;
    }
    // 一時フォルダは、フックの入力の scratchpad_dir。ないときは、OS の temp
    const tempDir = input.scratchpad_dir ?? tmpdir();
    if (consumeFallbackMarker(tempDir, now)) {
        return null;
    }
    return {
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: DENY_REASON
        }
    };
}

function main() {
    try {
        const input = JSON.parse(readFileSync(0, 'utf8'));
        const output = decide(input);
        if (output !== null) {
            process.stdout.write(JSON.stringify(output));
        }
    } catch (error) {
        // 失敗しても質問を止めないよう、何も出力せずに終了する
        console.error(`ask-ui のフックの処理に失敗しました: ${error.message}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    main();
}
