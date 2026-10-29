// yomiyasu の同梱スクリプトで、質問文の推敲(検査)を実行するスクリプト
// 使い方: node polish.mjs <原文.txt> <最終稿.txt>
// 記録は .temp/<作業名>/ に作り、終了時に必ず削除する(リポジトリ直下に .yomiyasu/ を作らない)
// 終了コード: 0 = 検査と照合が成功、1 = 検査の結果が失敗条件に当たった、3 = 推敲を実行できなかった(原文のまま表示する)、2 = 使い方の誤り
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CHECK_RELATIVE = ['skills', 'yomiyasu', 'scripts', 'yomiyasu_check.py'];

function compareVersions(a, b) {
    const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
    const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
        const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (diff !== 0) {
            return diff;
        }
    }
    return 0;
}

/** yomiyasu の同梱スクリプトを探す。版のフォルダ名は書かず、最新の版を選ぶ */
export function findCheckScript(home = homedir()) {
    const base = join(home, '.claude', 'plugins', 'cache', 'yomiyasu');
    if (!existsSync(base)) {
        return null;
    }
    const candidates = [];
    for (const owner of readdirSync(base)) {
        const ownerDir = join(base, owner);
        let versions = [];
        try {
            versions = readdirSync(ownerDir);
        } catch {
            continue;
        }
        for (const version of versions) {
            const script = join(ownerDir, version, ...CHECK_RELATIVE);
            if (existsSync(script)) {
                candidates.push({ version, script });
            }
        }
    }
    candidates.sort((a, b) => compareVersions(b.version, a.version));
    return candidates.length > 0 ? candidates[0].script : null;
}

/** Python の実行方法を探す。`python`、`py -3` の順に試す */
export function findPython(cwd = process.cwd()) {
    for (const [name, prefix] of [['python', []], ['py', ['-3']]]) {
        const command = resolveExecutable(name, cwd);
        if (!command) {
            continue;
        }
        const probe = spawnSync(command, [...prefix, '--version'], { encoding: 'utf8', cwd: dirname(command) });
        if (!probe.error && probe.status === 0) {
            return { command, prefix };
        }
    }
    return null;
}

/** カレントフォルダの配下にある候補を除外する(カレントフォルダに置かれた実行ファイルの実行を防ぐ) */
export function rejectUnderDir(candidates, dir) {
    const base = resolve(dir).toLowerCase();
    return candidates.filter((candidate) => {
        const target = resolve(candidate).toLowerCase();
        return target !== base && !target.startsWith(base + sep);
    });
}

/** 実行ファイルの絶対パスを、PATH から探す。カレントフォルダの配下のものは使わない */
function resolveExecutable(name, cwd) {
    const finder = process.platform === 'win32'
        ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'where.exe')
        : '/usr/bin/which';
    const found = spawnSync(finder, [name], { encoding: 'utf8', cwd: dirname(finder) });
    if (found.error || found.status !== 0) {
        return null;
    }
    const candidates = found.stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
    return rejectUnderDir(candidates, cwd)[0] ?? null;
}

/** 既定の実行方法(python -I で yomiyasu_check.py を実行する)を返す。見つからない場合は null */
export function defaultRunner() {
    const script = findCheckScript();
    const python = findPython();
    if (!script || !python) {
        return null;
    }
    return { command: python.command, args: [...python.prefix, '-I', script] };
}

function callChecker(runner, subArgs, input) {
    const result = spawnSync(runner.command, [...runner.args, ...subArgs], {
        input,
        encoding: 'utf8',
        env: { ...process.env, PYTHONUTF8: '1' },
        timeout: 120000
    });
    if (result.error) {
        throw new Error(`推敲スクリプトを実行できません: ${result.error.message}`);
    }
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

/**
 * 原文と最終稿を検査し、最終稿のハッシュを照合する。記録は終了時に必ず削除する
 * @param {{source: string, final: string, workRoot?: string, runner?: {command: string, args: string[]}|null}} options
 */
export function runPolish({ source, final, workRoot = resolve('.temp'), runner = defaultRunner() }) {
    if (!runner) {
        return { status: 'unavailable', message: '推敲スキル(yomiyasu)か Python が見つかりません' };
    }
    const stateDir = join(workRoot, `ask-ui-polish-${process.pid}-${Date.now()}`);
    try {
        mkdirSync(stateDir, { recursive: true });
        const payload = `<<<yomiyasu:original>>>\n${source}\n<<<yomiyasu:final>>>\n${final}\n`;
        const run = callChecker(runner, ['run', '--stdin', '--state-dir', stateDir, '--json'], payload);
        if (run.status === 2 || run.status === 3) {
            return { status: 'failed', message: `検査を実行できませんでした(終了コード ${run.status})`, stdout: run.stdout, stderr: run.stderr };
        }
        const verify = callChecker(runner, ['verify', '--final', '-', '--state-dir', stateDir], final);
        return {
            status: run.status === 0 && verify.status === 0 ? 'ok' : 'flagged',
            runExit: run.status,
            verifyExit: verify.status,
            stdout: run.stdout,
            verifyOutput: verify.stdout
        };
    } catch (error) {
        return { status: 'failed', message: error.message };
    } finally {
        // 成功しても失敗しても、記録を削除する
        try {
            rmSync(stateDir, { recursive: true, force: true });
        } catch (error) {
            console.error(`記録を削除できませんでした: ${error.message}`);
        }
    }
}

function main(argv) {
    const [sourcePath, finalPath] = argv.slice(2);
    if (!sourcePath || !finalPath) {
        console.error('使い方: node polish.mjs <原文.txt> <最終稿.txt>');
        return 2;
    }
    let source;
    let final;
    try {
        source = readFileSync(sourcePath, 'utf8').replace(/\n+$/, '');
        final = readFileSync(finalPath, 'utf8').replace(/\n+$/, '');
    } catch (error) {
        console.error(`ファイルを読み込めません: ${error.message}`);
        return 2;
    }
    const result = runPolish({ source, final });
    if (result.status === 'unavailable' || result.status === 'failed') {
        console.error(`推敲を実行できませんでした。原文のまま表示してください: ${result.message}`);
        return 3;
    }
    console.log(result.stdout);
    if (result.status === 'flagged') {
        console.error('検査の結果が、失敗条件に当たりました。差分を確認してください');
        return 1;
    }
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    process.exitCode = main(process.argv);
}
