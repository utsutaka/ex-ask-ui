// 報告・説明・質問を、単独で読める HTML として保存するスクリプト
// 保存先のフォルダ名と、ファイル名の規則は、このスクリプトに書かない(本エージェントが引数で渡す)
// 使い方:
//   node save-html.mjs --report <report.json> --kind report|explain --dir <保存先> [--prefix <名前の先頭>] [--title <ファイル名のもとにする題名>]
//   node save-html.mjs --question <票.json> [--answers <answers.json>] --title <名前のもとになる題名> --dir <保存先> [--prefix <名前の先頭>]   (票は、質問と議論の両方)
//   共通: [--work-dir <作業フォルダ>] [--again] [--update] [--now <ISO 日時>]
// 出力: 標準出力に、書き込んだファイルの絶対パスを 1 行
// 終了コード: 0 = 保存した、1 = 入力の不正、2 = 書き込みの失敗、3 = 同名のファイルがある、4 = 保存済み(--work-dir の saved.txt がある)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandReportBody, renderMermaidFigure } from './mermaid.mjs';
import { SECRET_PATTERNS, validateQuestionSet, validateReport } from './validate-input.mjs';
import { HEADINGS, KIND_SETTINGS, LABELS, escapeHtml, formatLevel, optionsHeading } from './build-pages.mjs';

const SAVED_RECORD = 'saved.txt';
const MAX_NAME_LENGTH = 60;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const REDACTED_TEXT = '機密情報らしい文字列のため、保存から除外した';
const UNANSWERED_TEXT = '未回答';

// 保存ファイルの CSP(スクリプトと外部通信を禁止する。メタ要素の CSP の効き方は research.md の U1)
const SAVED_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'";

const USAGE = '使い方: node save-html.mjs (--report <report.json> --kind report|explain | --question <票.json> [--answers <answers.json>] --title <題名>) --dir <保存先> [--prefix <先頭>] [--work-dir <作業フォルダ>] [--again] [--update] [--now <ISO 日時>]';

/** 入力の不正を表す例外(終了コード 1) */
class InputError extends Error {}

/** 保存ファイルの名前に使えるように、題名を整える */
export function safeFileName(title) {
    const replaced = String(title ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    const trimEnd = (text) => text.replace(/[.\s]+$/u, '');
    let name = trimEnd(replaced.trim());
    name = trimEnd(Array.from(name).slice(0, MAX_NAME_LENGTH).join('').trim());
    return name === '' ? '無題' : name;
}

/** ファイル名(拡張子を除く)を組み立てる。名前に使えない文字は prefix からも取り除く */
export function buildFileName(prefix, title) {
    const safePrefix = String(prefix ?? '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    let stem = safePrefix + safeFileName(title);
    if (RESERVED_NAMES.test(stem)) {
        stem = `_${stem}`;
    }
    return `${stem}.html`;
}

// 本文から、スクリプトと外部参照になりうる要素・属性を取り除く(多重の防御。本体の防御は CSP)
const STRIP_PATTERNS = [
    /<\s*script\b[\s\S]*?<\s*\/\s*script\s*>/gi,
    /<\s*script\b[\s\S]*$/gi,
    /<\s*\/\s*script\s*>/gi,
    /<\s*(iframe|object|embed|frame|frameset)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
    /<\s*(link|meta|base)\b[^>]*>/gi,
    /<\s*(iframe|object|embed|frame|frameset|form)\b[^>]*>/gi,
    // 外部への読み込み(画像など)。保存ファイルを単独で開けるように、参照そのものを取り除く(<a href> の移動先は残す)
    /\s(src|srcset|poster|data)\s*=\s*("\s*(https?:)?\/\/[^"]*"|'\s*(https?:)?\/\/[^']*'|(https?:)?\/\/[^\s>]*)/gi,
    /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi,
    /\s(href|src|xlink:href|action|formaction)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi
];

/** 本文から、スクリプトなどを取り除く。変化がなくなるまで繰り返す */
export function stripActiveContent(html) {
    let current = String(html);
    for (let round = 0; round < 10; round += 1) {
        const before = current;
        for (const pattern of STRIP_PATTERNS) {
            current = current.replace(pattern, '');
        }
        if (current === before) {
            break;
        }
    }
    if (/<\s*script/i.test(current)) {
        throw new InputError('本文からスクリプトを取り除けませんでした');
    }
    return current;
}

function pad(number) {
    return String(number).padStart(2, '0');
}

/** 作成日時を YYYY-MM-DD HH:mm にする(ローカル時刻) */
export function formatDateTime(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const SAVED_STYLE = `
:root { --ink: #1c2430; --muted: #4d5968; --line: #c9d0d9; --accent: #0b5a8a; --accent-soft: #e3f0f8; --paper: #f6f7f9; }
* { box-sizing: border-box; }
body { margin: 0; padding: 24px 16px 48px; background: var(--paper); color: var(--ink); font-family: "Yu Gothic UI", "Hiragino Sans", "Meiryo", system-ui, sans-serif; font-size: 16px; line-height: 1.7; }
main { max-width: 860px; margin: 0 auto; padding: 20px; background: #fff; border: 1px solid var(--line); border-radius: 6px; }
h1 { margin: 0 0 4px; font-size: 1.5rem; line-height: 1.5; }
.meta-line { margin: 0 0 16px; color: var(--muted); font-size: 0.9rem; }
table { border-collapse: collapse; max-width: 100%; }
th, td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; }
th { background: var(--paper); }
svg, img { max-width: 100%; height: auto; }
section.q { margin: 0 0 28px; padding-top: 4px; border-top: 2px solid var(--line); }
section.q h2 { margin: 12px 0 4px; font-size: 1.2rem; line-height: 1.5; }
section.q h3 { margin: 14px 0 4px; font-size: 0.95rem; color: var(--accent); }
section.q p { margin: 0; white-space: pre-line; }
dl.meta { margin: 0; color: var(--muted); font-size: 0.92rem; }
dl.meta dt { float: left; clear: left; width: 4.5em; font-weight: 600; }
dl.meta dd { margin: 0 0 6px 4.5em; white-space: pre-line; }
figure.exh { margin: 12px 0; overflow-x: auto; }
figure.exh figcaption { margin-bottom: 4px; color: var(--muted); font-size: 0.9rem; }
ul.opts { margin: 0; padding: 0; list-style: none; }
ul.opts li { margin: 0 0 8px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 4px; }
ul.opts li.sel { border-color: var(--accent); background: var(--accent-soft); }
ul.opts .mark { display: inline-block; margin-right: 8px; font-weight: 600; color: var(--accent); }
ul.opts .detail { display: block; margin-top: 2px; color: var(--muted); font-size: 0.92rem; }
p.free { margin-top: 8px; white-space: pre-wrap; }
p.fld { margin: 0 0 6px; }
p.fld.orig { padding-left: 10px; border-left: 3px solid var(--line); color: var(--muted); white-space: pre-wrap; }
.lbl { font-weight: 600; color: var(--muted); margin-right: 0.3em; }
section.q h4 { margin: 10px 0 4px; font-size: 1rem; }
.draft { margin: 0 0 12px; padding: 8px 12px; border: 1px solid var(--line); border-radius: 4px; }
ol.topics { margin: 0 0 6px; padding-left: 1.4em; }
@media print {
    body { padding: 0; background: #fff; }
    main { max-width: none; padding: 0; border: 0; }
    h1, h2, h3 { break-after: avoid; }
    table, svg, figure, section.q li, .draft { break-inside: avoid; }
}
`;

function renderDocument({ title, kindLabel, createdAt, content }) {
    return '<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n'
        + `<meta http-equiv="Content-Security-Policy" content="${SAVED_CSP}">\n`
        + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        + `<title>${escapeHtml(title)}</title>\n<style>${SAVED_STYLE}</style>\n</head>\n<body>\n<main>\n`
        + `<h1>${escapeHtml(title)}</h1>\n`
        + `<p class="meta-line">種別: ${escapeHtml(kindLabel)} / 作成日時: ${escapeHtml(createdAt)}</p>\n`
        + `${content}\n</main>\n</body>\n</html>\n`;
}

/** 報告・説明の保存用 HTML を作る */
export function buildReportDocument(report, kind, now) {
    const settings = KIND_SETTINGS[kind];
    return renderDocument({
        title: report.title,
        kindLabel: settings.kindLabel,
        createdAt: formatDateTime(now),
        // 本文の `<pre class="mermaid">` は、画面と同じに、図に変換する(FR-011)。そのあと、スクリプトなどを取り除く
        content: `<div class="content">\n${stripActiveContent(expandReportBody(report.body).body)}\n</div>`
    });
}

function isSecretText(text) {
    return SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

// 項目名と本文の対(画面と同じ文言)
function field(label, text) {
    return `<p class="fld"><span class="lbl">${label}</span>${escapeHtml(text)}</p>`;
}

function block(heading, bodyHtml) {
    return `<h3>${heading}</h3>${bodyHtml}`;
}

// 項目名をつけない本文(1 つの文章として読む章。画面と同じ)
function plainText(body) {
    return `<p class="fld">${escapeHtml(body)}</p>`;
}

function savedCurrent(current) {
    return plainText(current.text)
        + (current.original === undefined ? '' : `<p class="fld orig">${escapeHtml(current.original)}</p>`);
}

// 保存ファイルは、図表を、iframe を使わず、文書に直接置く。mermaid の図は、画面と同じ規則の key
// (`i<項目の番号>e<図表の番号>`)で、id と <style> を、ほかの図から分ける(FR-021)
function savedProblem(problem, itemIndex = 0) {
    const exhibits = (problem.exhibits ?? []).map((exhibit, index) => {
        const html = exhibit.kind === 'mermaid'
            ? renderMermaidFigure(exhibit.source, { caption: exhibit.caption, key: `i${itemIndex}e${index}` }).html
            : exhibit.html;
        return `<figure class="exh"><figcaption>${escapeHtml(exhibit.caption)}</figcaption>${stripActiveContent(html)}</figure>`;
    }).join('');
    const exhibitHtml = exhibits !== ''
        ? exhibits
        : `<p class="fld"><span class="lbl">${LABELS.exhibits}</span>なし。理由: ${escapeHtml(problem.noExhibitReason ?? '')}</p>`;
    return plainText(problem.description) + exhibitHtml;
}

function savedIdeal(ideal) {
    return plainText(ideal.vision) + (ideal.notes === undefined ? '' : field(LABELS.notes, ideal.notes));
}

function savedDetail(label, text) {
    return `<span class="detail"><span class="lbl">${label}</span>${escapeHtml(text)}</span>`;
}

function renderSavedOption(option, selectedIds) {
    const selected = selectedIds.includes(option.id);
    return `<li class="${selected ? 'sel' : 'unsel'}"><span class="mark">${selected ? '【選択】' : '【未選択】'}</span>`
        + `<strong>${escapeHtml(option.label)}</strong>${option.recommended ? ' (推奨)' : ''}`
        + savedDetail(LABELS.content, option.content)
        + (option.differenceFromRecommended === undefined ? '' : savedDetail(LABELS.difference, option.differenceFromRecommended))
        + savedDetail(LABELS.effect, option.effect)
        + savedDetail(LABELS.feasibility, option.feasibility)
        + savedDetail(LABELS.risk, option.risk)
        + savedDetail(LABELS.fit, formatLevel(option.fit))
        + '</li>';
}

/** 自由記入の欄(未回答、機密情報の置き換え、なし、本文)を、文字で示す */
function savedFreeText(item, answer, redacted) {
    if (!answer) {
        return `<p class="free">自由記入: ${UNANSWERED_TEXT}</p>`;
    }
    if (typeof answer.freeText === 'string' && answer.freeText !== '') {
        if (isSecretText(answer.freeText)) {
            redacted.push(item.id);
            return `<p class="free">自由記入: ${REDACTED_TEXT}</p>`;
        }
        return `<p class="free">自由記入: ${escapeHtml(answer.freeText)}</p>`;
    }
    return '<p class="free">自由記入: (なし)</p>';
}

function savedRecommendation(question) {
    const { given, none } = question.recommendation;
    if (given !== undefined) {
        return field(LABELS.proposal, question.options[0].label) + plainText(given.text);
    }
    return field(LABELS.proposal, 'なし') + plainText(none.text);
}

function renderSavedQuestion(question, answer, redacted, itemIndex = 0) {
    const h = HEADINGS.question;
    const selectedIds = answer ? answer.selected : [];
    const answerState = answer ? '' : `<p class="free">回答: ${UNANSWERED_TEXT}</p>`;
    return `<section class="q" data-qid="${escapeHtml(question.id)}">`
        + `<h2>${escapeHtml(question.title)}</h2>`
        + block(h.decide, plainText(question.decide.text))
        + block(h.current, savedCurrent(question.current))
        + block(h.problem, savedProblem(question.problem, itemIndex))
        + block(h.ideal, savedIdeal(question.ideal))
        + block(h.recommendation, savedRecommendation(question))
        + block(optionsHeading(question.multiple), `<ul class="opts">${question.options.map((option) => renderSavedOption(option, selectedIds)).join('')}</ul>${answerState}${savedFreeText(question, answer, redacted)}`)
        + '</section>';
}

function renderSavedDraft(draft) {
    return `<div class="draft"><h4>${escapeHtml(draft.label)}</h4>`
        + field(LABELS.content, draft.content)
        + field(LABELS.effect, draft.effect)
        + field(LABELS.risk, draft.risk)
        + field(LABELS.fit, formatLevel(draft.fit))
        + field(LABELS.open, draft.open)
        + '</div>';
}

function renderSavedDiscussion(item, answer, redacted, itemIndex = 0) {
    const h = HEADINGS.discussion;
    const topics = `<p class="fld"><span class="lbl">${LABELS.topicQuestions}</span></p><ol class="topics">`
        + item.topic.questions.map((question) => `<li>${escapeHtml(question)}</li>`).join('') + '</ol>';
    const answerState = answer ? '' : `<p class="free">回答: ${UNANSWERED_TEXT}</p>`;
    return `<section class="q" data-qid="${escapeHtml(item.id)}">`
        + `<h2>${escapeHtml(item.title)}</h2>`
        + block(h.topic, topics + plainText(item.topic.text))
        + block(h.current, savedCurrent(item.current))
        + block(h.problem, savedProblem(item.problem, itemIndex))
        + block(h.ideal, savedIdeal(item.ideal))
        + block(h.drafts, item.drafts.map(renderSavedDraft).join(''))
        + block(h.view, field(LABELS.conclusion, item.view.conclusion)
            + field(LABELS.basis, item.view.basis)
            + field(LABELS.unknown, item.view.unknown)
            + field(LABELS.confidence, formatLevel(item.view.confidence)))
        + block(h.opinion, field(LABELS.guide, item.opinion.guide) + answerState + savedFreeText(item, answer, redacted))
        + '</section>';
}

/** 回答の入力(結果の JSON 全体、answers を持つオブジェクト、または配列)から、回答の配列を取り出す */
function extractAnswers(raw) {
    const list = Array.isArray(raw) ? raw : raw?.answers;
    if (!Array.isArray(list)) {
        throw new InputError('回答の形が不正です(answers の配列が必要です)');
    }
    return list;
}

/** 票と回答の対応を確かめる。合わなければ InputError */
function matchAnswers(board, list) {
    const byId = new Map();
    for (const item of list) {
        if (typeof item !== 'object' || item === null || typeof item.questionId !== 'string' || !Array.isArray(item.selected)) {
            throw new InputError('回答の形が不正です(questionId と selected が必要です)');
        }
        if (byId.has(item.questionId)) {
            throw new InputError(`回答の questionId が重複しています: ${item.questionId}`);
        }
        byId.set(item.questionId, item);
    }
    const ids = new Set(board.items.map((item) => item.id));
    for (const id of byId.keys()) {
        if (!ids.has(id)) {
            throw new InputError(`回答が票と合いません(票にない questionId: ${id})`);
        }
    }
    for (const item of board.items) {
        const answer = byId.get(item.id);
        if (!answer) {
            throw new InputError(`回答が票と合いません(回答がない項目: ${item.id})`);
        }
        if (board.kind === 'discussion') {
            // 議論の回答は、選択を持たず、自由記入が必須
            if (answer.selected.length !== 0) {
                throw new InputError(`回答が票と合いません(議論 ${item.id} は、選択肢を持ちません)`);
            }
            if (typeof answer.freeText !== 'string' || answer.freeText.trim() === '') {
                throw new InputError(`回答が票と合いません(議論 ${item.id} は、自由記入が必要です)`);
            }
            continue;
        }
        const optionIds = new Set(item.options.map((option) => option.id));
        for (const selected of answer.selected) {
            if (!optionIds.has(selected)) {
                throw new InputError(`回答が票と合いません(質問 ${item.id} にない選択肢: ${selected})`);
            }
        }
    }
    return byId;
}

/** 質問・議論の保存用 HTML を作る。answersRaw が null なら、回答の欄は「未回答」 */
export function buildQuestionDocument(board, answersRaw, title, now) {
    const byId = answersRaw === null ? new Map() : matchAnswers(board, extractAnswers(answersRaw));
    const redacted = [];
    const render = board.kind === 'discussion' ? renderSavedDiscussion : renderSavedQuestion;
    const content = board.items.map((item, index) => render(item, byId.get(item.id) ?? null, redacted, index)).join('\n');
    return {
        html: renderDocument({ title, kindLabel: board.kind === 'discussion' ? '議論' : '質問', createdAt: formatDateTime(now), content }),
        redacted
    };
}

function readJson(path, label) {
    try {
        return JSON.parse(readFileSync(path, 'utf8'));
    } catch (error) {
        throw new InputError(`${label}を読み込めません: ${error.message}`);
    }
}

const VALUE_OPTIONS = ['--report', '--kind', '--question', '--answers', '--title', '--dir', '--prefix', '--work-dir', '--now'];
const FLAG_OPTIONS = ['--again', '--update'];

function parseArgs(args) {
    const options = {};
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (VALUE_OPTIONS.includes(arg)) {
            const value = args[i + 1];
            if (value === undefined) {
                throw new InputError(`${arg} に値がありません`);
            }
            options[arg.slice(2)] = value;
            i += 1;
        } else if (FLAG_OPTIONS.includes(arg)) {
            options[arg.slice(2)] = true;
        } else {
            throw new InputError(`不明な引数です: ${arg}`);
        }
    }
    return options;
}

/** 引数から、書き込む内容と題名を決める */
function prepare(options) {
    if (!options.dir) {
        throw new InputError('--dir が必要です');
    }
    const now = options.now === undefined ? new Date() : new Date(options.now);
    if (Number.isNaN(now.getTime())) {
        throw new InputError(`--now を日時として読めません: ${options.now}`);
    }
    if (options.report !== undefined && options.question !== undefined) {
        throw new InputError('--report と --question は同時に指定できません');
    }
    if (options.report !== undefined) {
        if (!Object.hasOwn(KIND_SETTINGS, options.kind ?? '')) {
            throw new InputError('--kind は report または explain にしてください');
        }
        const report = readJson(options.report, '報告');
        const validation = validateReport(report, { withWarnings: false });
        if (!validation.ok) {
            throw new InputError(`報告の検証に失敗しました: ${validation.errors.map((e) => e.path).join(', ')}`);
        }
        // --title は、ファイル名だけを変える(同名のときの再試行用)。画面の見出しは、報告の題名のまま
        const fileTitle = options.title ?? report.title;
        if (typeof fileTitle !== 'string' || isSecretText(fileTitle)) {
            throw new InputError('--title が不正です(文字列で、機密情報らしい文字列を含まないこと)');
        }
        return { title: fileTitle, html: buildReportDocument(report, options.kind, now), redacted: [] };
    }
    if (options.question !== undefined) {
        if (typeof options.title !== 'string' || options.title.trim() === '') {
            throw new InputError('--title が必要です(名前のもとになる題名)');
        }
        if (isSecretText(options.title)) {
            throw new InputError('--title に機密情報らしい文字列を検出しました(値は表示しません)');
        }
        const board = readJson(options.question, '票');
        const validation = validateQuestionSet(board, { withWarnings: false });
        if (!validation.ok) {
            // 古い形式は、理由を示す。それ以外は、検証に失敗した項目名を示す
            const detail = validation.legacy ? validation.errors[0].message : validation.errors.map((e) => e.path).join(', ');
            throw new InputError(`票の検証に失敗しました: ${detail}`);
        }
        let answers = options.answers === undefined ? null : readJson(options.answers, '回答');
        // evaluate_script の出力を、そのまま保存した場合は、JSON が文字列として入っている(もう一度解釈する)
        if (typeof answers === 'string') {
            try {
                answers = JSON.parse(answers);
            } catch (error) {
                throw new InputError(`回答を読み込めません: ${error.message}`);
            }
        }
        const built = buildQuestionDocument(board, answers, options.title, now);
        return { title: options.title, html: built.html, redacted: built.redacted };
    }
    throw new InputError('--report または --question が必要です');
}

function main(argv) {
    let options;
    let job;
    try {
        options = parseArgs(argv.slice(2));
        job = prepare(options);
    } catch (error) {
        if (error instanceof InputError) {
            console.error(error.message);
            console.error(USAGE);
            return 1;
        }
        console.error(`予期しない失敗: ${error.message}`);
        return 2;
    }

    const recordPath = options['work-dir'] === undefined ? null : join(resolve(options['work-dir']), SAVED_RECORD);

    // 保存済みの確認(--work-dir があり、--again も --update もないとき)
    if (recordPath !== null && !options.update && !options.again && existsSync(recordPath)) {
        try {
            console.log(readFileSync(recordPath, 'utf8').trim());
        } catch (error) {
            console.error(`保存済みの記録を読めません: ${error.message}`);
            return 2;
        }
        return 4;
    }

    // 回答を加えるための置き換え: 記録された保存先だけを書き換える
    if (options.update) {
        if (recordPath === null || !existsSync(recordPath)) {
            console.error('--update には、保存済みの記録(作業フォルダの saved.txt)が必要です');
            return 1;
        }
        try {
            const target = readFileSync(recordPath, 'utf8').trim();
            if (target === '' || !existsSync(target)) {
                console.error('記録された保存先のファイルがありません');
                return 1;
            }
            writeFileSync(target, job.html, 'utf8');
            reportRedaction(job.redacted);
            console.log(target);
            return 0;
        } catch (error) {
            console.error(`書き込みに失敗しました: ${error.message}`);
            return 2;
        }
    }

    const dir = resolve(options.dir);
    const target = join(dir, buildFileName(options.prefix, job.title));
    try {
        mkdirSync(dir, { recursive: true });
        // 既存のファイルは上書きしない(排他的な作成)
        writeFileSync(target, job.html, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
        if (error.code === 'EEXIST') {
            console.error(`同名のファイルがあります: ${target}`);
            return 3;
        }
        console.error(`書き込みに失敗しました: ${error.message}`);
        return 2;
    }
    if (recordPath !== null) {
        try {
            writeFileSync(recordPath, `${target}\n`, 'utf8');
        } catch (error) {
            // 保存そのものは成功している。記録できないと二度目の保存を防げないため、伝える
            console.error(`保存済みの記録を書けませんでした(保存は成功しています): ${error.message}`);
        }
    }
    reportRedaction(job.redacted);
    console.log(target);
    return 0;
}

function reportRedaction(redacted) {
    if (redacted.length > 0) {
        console.error(`置き換えた自由記入: ${redacted.join(', ')}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    process.exitCode = main(process.argv);
}
