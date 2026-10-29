// 質問・議論の票、報告から、管理用ページを書き込むローダー(admin-loader.js)を生成するスクリプト
// 使い方: node build-pages.mjs <票.json> <出力フォルダ> [--save-to <表示用の保存先の文字>]
//         node build-pages.mjs <report.json> <出力フォルダ> --kind report|explain [--save-to <表示用の保存先の文字>]
// 出力: <出力フォルダ>/admin-loader.js(chrome-devtools の evaluate_script の sourcePath に渡す)
// 終了コード: 0 = 成功、1 = 入力の検証に失敗、2 = 入出力の失敗(引数の誤りを含む)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandReportBody, renderMermaidFigure } from './mermaid.mjs';
import { validateQuestionSet, validateReport } from './validate-input.mjs';

// テンプレートの場所は、このスクリプトの位置から解決する(固定のパスを書かない)
const TEMPLATE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'templates');

// モックに適用する CSP(外部通信とスクリプトを禁止する)
const MOCK_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:";

// 画面の種別ごとの値(data-model.md の表)
export const KIND_SETTINGS = {
    report: { kindLabel: '報告', saveLabel: 'この報告を保存する', defaultSave: true },
    explain: { kindLabel: '説明', saveLabel: 'この説明を保存する', defaultSave: false }
};

// 画面と保存ファイルで共通の、見出しと項目名(FR-010: 見出しは半角数字とピリオド、項目名は全角コロン)
export const HEADINGS = {
    question: {
        decide: '決めること',
        current: '1. 現状',
        problem: '2. 問題点',
        ideal: '3. あるべき姿',
        recommendation: '4. 推奨',
        options: '5. あなたの選択'
    },
    discussion: {
        topic: '議論したいこと',
        current: '1. 現状',
        problem: '2. 問題点',
        ideal: '3. あるべき姿',
        drafts: '4. 叩き台',
        view: '5. 見立て',
        opinion: '6. ご意見'
    }
};

export const LABELS = {
    content: '内容：',
    topicQuestions: '論点：',
    exhibits: '図表：',
    notes: '採用するときの注意事項：',
    proposal: '推奨案：',
    effect: '効果：',
    feasibility: '実現の可否：',
    risk: 'リスク・デメリット：',
    fit: 'あるべき姿との一致：',
    difference: '推奨との違い：',
    open: '未解決の点：',
    conclusion: '仮の結論：',
    basis: '根拠：',
    unknown: 'まだ分からないこと：',
    confidence: '確信の度合い：',
    guide: '書いてほしい観点：'
};

/** 質問の選択肢の見出し(単一選択、複数選択) */
export function optionsHeading(multiple) {
    return `${HEADINGS.question.options}${multiple ? '(複数選択できます)' : '(1 つ選んでください)'}`;
}

/** 水準を、文字で示す(色だけに頼らない。FR-017) */
export function formatLevel(level) {
    return `${level.level}(${level.reason})`;
}

export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// JavaScript の文字列リテラルとして埋め込める JSON にする。
// `<` をエスケープ表記(バックスラッシュ + u003c)にして、`</script` が HTML の構造を壊さないようにする
export function toSafeJson(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c');
}

// 表示物の中だけで使う、最小の見た目(表と図の読みやすさのため)
const EXHIBIT_STYLE = '<style>body{margin:8px;font-family:"Yu Gothic UI","Hiragino Sans","Meiryo",system-ui,sans-serif;font-size:15px;line-height:1.6;color:#1c2430}'
    + 'table{border-collapse:collapse}th,td{border:1px solid #c9d0d9;padding:6px 10px;text-align:left}th{background:#f6f7f9}svg{max-width:100%;height:auto}</style>';

/**
 * 図表を描画する。key は、mermaid の図の id と外枠のクラスの接頭辞に使う、票の中で一意な文字列
 * (`i<項目の番号>e<図表の番号>`。保存ファイルの描画でも、同じ規則で作る)
 */
function renderExhibit(exhibit, key) {
    const caption = `<figcaption>${escapeHtml(exhibit.caption)}</figcaption>`;
    // mermaid は、記述を図(SVG)に変換した断片を使う。変換できないときは、原文を展開した断片になる(mermaid.mjs)
    const html = exhibit.kind === 'mermaid'
        ? renderMermaidFigure(exhibit.source, { caption: exhibit.caption, key }).html
        : exhibit.html;
    // table、svg、mock のすべてを、スクリプト無効の sandbox と、外部通信を禁止する CSP の中でだけ表示する。
    // validate-input.mjs の拒否リストに頼らず、拒否リストをすり抜けた場合も、スクリプトは実行されない。
    // allow-same-origin は、フォーム側が中身の高さを読んで枠を合わせるために付ける。allow-scripts を付けないため、中身のスクリプトは実行できない
    const doc = `<meta http-equiv="Content-Security-Policy" content="${MOCK_CSP}">${EXHIBIT_STYLE}${html}`;
    return `<figure class="exh exh-${exhibit.kind}">${caption}`
        + `<iframe sandbox="allow-same-origin" referrerpolicy="no-referrer" title="${escapeHtml(exhibit.caption)}" srcdoc="${escapeHtml(doc)}"></iframe></figure>`;
}

// 項目名と本文の対
function renderField(label, text) {
    return `<p class="fld"><span class="lbl">${label}</span>${escapeHtml(text)}</p>`;
}

// 項目名をつけない本文(1 つの文章として読む章)
function renderText(text) {
    return `<p class="fld">${escapeHtml(text)}</p>`;
}

// 見出しをつけた塊
function renderBlock(heading, bodyHtml) {
    return `<div class="blk"><h3>${heading}</h3>${bodyHtml}</div>`;
}

// 現状: 本文(概要と、決定済みの事項を含む文章)。原文は、項目名をつけず、引用の見た目で区別する
function renderCurrent(current) {
    return renderText(current.text)
        + (current.original === undefined ? '' : `<p class="fld orig">${escapeHtml(current.original)}</p>`);
}

// 問題点: 本文は項目名をつけない。図表は、題名(caption)があるため項目名をつけない。図表がないときだけ、理由を示す
function renderProblem(problem, itemIndex = 0) {
    const exhibits = (problem.exhibits ?? []).map((exhibit, index) => renderExhibit(exhibit, `i${itemIndex}e${index}`)).join('');
    const exhibitHtml = exhibits !== ''
        ? exhibits
        : `<p class="fld noexh"><span class="lbl">${LABELS.exhibits}</span>なし。理由: ${escapeHtml(problem.noExhibitReason ?? '')}</p>`;
    return renderText(problem.description) + exhibitHtml;
}

function renderIdeal(ideal) {
    return renderText(ideal.vision)
        + (ideal.notes === undefined ? '' : renderField(LABELS.notes, ideal.notes));
}

function renderOption(question, option) {
    const inputType = question.multiple ? 'checkbox' : 'radio';
    const name = `sel-${question.id}`;
    const inputId = `${name}-${option.id}`;
    const recommended = option.recommended ? '<span class="tag">推奨</span>' : '';
    const detail = (label, text) => `<span class="detail"><span class="lbl">${label}</span>${escapeHtml(text)}</span>`;
    return `<label class="opt${option.recommended ? ' rec' : ''}" for="${escapeHtml(inputId)}">`
        + `<input type="${inputType}" id="${escapeHtml(inputId)}" name="${escapeHtml(name)}" value="${escapeHtml(option.id)}" data-askui-control>`
        + `<span class="name">${escapeHtml(option.label)}</span>${recommended}`
        + detail(LABELS.content, option.content)
        + (option.differenceFromRecommended === undefined ? '' : detail(LABELS.difference, option.differenceFromRecommended))
        + detail(LABELS.effect, option.effect)
        + detail(LABELS.feasibility, option.feasibility)
        + detail(LABELS.risk, option.risk)
        + detail(LABELS.fit, formatLevel(option.fit))
        + '</label>';
}

/** 質問の推奨の節の本文(推奨あり、または推奨なし) */
function renderRecommendation(question) {
    const { given, none } = question.recommendation;
    if (given !== undefined) {
        return renderField(LABELS.proposal, question.options[0].label) + renderText(given.text);
    }
    return renderField(LABELS.proposal, 'なし') + renderText(none.text);
}

export function renderQuestion(question, itemIndex = 0) {
    const qid = escapeHtml(question.id);
    const h = HEADINGS.question;
    return `<section class="q" data-qid="${qid}">`
        + `<h2>${escapeHtml(question.title)}<span class="tag warn">回答が必要</span></h2>`
        + renderBlock(h.decide, renderText(question.decide.text))
        + renderBlock(h.current, renderCurrent(question.current))
        + renderBlock(h.problem, renderProblem(question.problem, itemIndex))
        + renderBlock(h.ideal, renderIdeal(question.ideal))
        + renderBlock(h.recommendation, renderRecommendation(question))
        + `<fieldset class="opts"><legend>${optionsHeading(question.multiple)}</legend>`
        + question.options.map((option) => renderOption(question, option)).join('')
        // ラジオボタンは、一度選ぶと無選択に戻せないため、単一選択には解除のボタンを付ける
        + (question.multiple ? '' : '<button type="button" class="clear">選択を解除</button>')
        + '</fieldset>'
        + `<label class="free">自由記入(選択肢に合わない場合など)<textarea name="free-${qid}"></textarea></label>`
        + '<p class="err" role="alert" hidden>エラー: 選択肢を選ぶか、自由記入を入力してください</p>'
        + '</section>';
}

function renderDraft(draft) {
    return `<div class="draft"><h4>${escapeHtml(draft.label)}</h4>`
        + renderField(LABELS.content, draft.content)
        + renderField(LABELS.effect, draft.effect)
        + renderField(LABELS.risk, draft.risk)
        + renderField(LABELS.fit, formatLevel(draft.fit))
        + renderField(LABELS.open, draft.open)
        + '</div>';
}

export function renderDiscussion(item, itemIndex = 0) {
    const qid = escapeHtml(item.id);
    const h = HEADINGS.discussion;
    const topicQuestions = `<p class="fld"><span class="lbl">${LABELS.topicQuestions}</span></p><ol class="topics">`
        + item.topic.questions.map((question) => `<li>${escapeHtml(question)}</li>`).join('') + '</ol>';
    return `<section class="q" data-qid="${qid}">`
        + `<h2>${escapeHtml(item.title)}<span class="tag warn">回答が必要</span></h2>`
        + renderBlock(h.topic, topicQuestions + renderText(item.topic.text))
        + renderBlock(h.current, renderCurrent(item.current))
        + renderBlock(h.problem, renderProblem(item.problem, itemIndex))
        + renderBlock(h.ideal, renderIdeal(item.ideal))
        + renderBlock(h.drafts, item.drafts.map(renderDraft).join(''))
        + renderBlock(h.view, renderField(LABELS.conclusion, item.view.conclusion)
            + renderField(LABELS.basis, item.view.basis)
            + renderField(LABELS.unknown, item.view.unknown)
            + renderField(LABELS.confidence, formatLevel(item.view.confidence)))
        + renderBlock(h.opinion, renderField(LABELS.guide, item.opinion.guide)
            + `<label class="free">自由記入(必須)<textarea name="free-${qid}"></textarea></label>`
            + '<p class="err" role="alert" hidden>エラー: 自由記入を入力してください</p>')
        + '</section>';
}

function readTemplate(name) {
    try {
        return readFileSync(join(TEMPLATE_DIR, name), 'utf8');
    } catch (error) {
        throw new Error(`テンプレートを読み込めません(${name}): ${error.message}`);
    }
}

// 置換は関数で行い、置換文字列の中の `$` が特別扱いされないようにする
function replaceMarker(text, marker, value) {
    if (!text.includes(marker)) {
        throw new Error(`テンプレートに目印がありません: ${marker}`);
    }
    return text.replace(marker, () => value);
}

// 保存先の表示(渡されたときだけ示す。FR-004)
function renderSaveTo(saveTo) {
    return saveTo ? `<span class="note" id="save-to">保存先: ${escapeHtml(saveTo)}</span>` : '';
}

// 票の種別ごとの値(ページの題名、保存のチェックボックスの文言)
const BOARD_SETTINGS = {
    question: { pageTitle: 'ask-ui 質問', saveLabel: 'この質問を保存する' },
    discussion: { pageTitle: 'ask-ui 議論', saveLabel: 'この議論を保存する' }
};

/** フォーム本体の HTML を生成する */
export function buildFormHtml(board, { saveTo } = {}) {
    const isQuestion = board.kind === 'question';
    const settings = BOARD_SETTINGS[board.kind];
    // 議論は、選択肢を持たない(optionIds が空)。自由記入が空なら、判断のロジックが、未回答として扱う(form-logic.js は変更しない)
    const meta = {
        questions: board.items.map((item) => ({
            id: item.id,
            multiple: isQuestion ? item.multiple : false,
            optionIds: isQuestion ? item.options.map((option) => option.id) : []
        }))
    };
    const render = isQuestion ? renderQuestion : renderDiscussion;
    let html = readTemplate('form.html');
    html = replaceMarker(html, '<!--ASKUI_PAGE_TITLE-->', settings.pageTitle);
    html = replaceMarker(html, '<!--ASKUI_QUESTIONS-->', board.items.map((item, index) => render(item, index)).join('\n'));
    html = replaceMarker(html, '<!--ASKUI_SAVE_LABEL-->', settings.saveLabel);
    html = replaceMarker(html, '<!--ASKUI_SAVE_TO-->', renderSaveTo(saveTo));
    html = replaceMarker(html, '/*ASKUI_META*/', toSafeJson(meta));
    html = replaceMarker(html, '/*ASKUI_FORM_LOGIC*/', readTemplate('form-logic.js'));
    return html;
}

/** 管理用ページの HTML を生成する(画面本体を文字列として埋め込む)。mode は question または report */
export function buildAdminHtml(formHtml, { mode = 'question', defaultSave = false } = {}) {
    const note = mode === 'report'
        ? 'ask-ui の管理用ページです。報告用の窓で読んでください。このページは閉じないでください'
        : 'ask-ui の管理用ページです。質問用の窓で回答してください。このページは閉じないでください';
    let html = readTemplate('admin.html');
    html = replaceMarker(html, '<!--ASKUI_ADMIN_NOTE-->', note);
    html = replaceMarker(html, '/*ASKUI_MODE*/"question"', toSafeJson(mode));
    html = replaceMarker(html, '/*ASKUI_DEFAULT_SAVE*/false', defaultSave ? 'true' : 'false');
    return replaceMarker(html, '/*ASKUI_FORM_HTML*/""', toSafeJson(formHtml));
}

/** 管理用ページを about:blank に書き込む関数の本文を生成する */
export function buildLoader(adminHtml) {
    return `() => { document.open(); document.write(${toSafeJson(adminHtml)}); document.close(); }\n`;
}

/** 質問・議論の票から admin-loader.js の内容を生成する。検証に失敗した場合は例外を投げる */
export function buildAll(board, options = {}) {
    const validation = validateQuestionSet(board, { withWarnings: false });
    if (!validation.ok) {
        const error = new Error('票の検証に失敗しました');
        error.validationErrors = validation.errors;
        throw error;
    }
    const formHtml = buildFormHtml(board, options);
    const adminHtml = buildAdminHtml(formHtml);
    return { formHtml, adminHtml, loader: buildLoader(adminHtml) };
}

// 報告・説明の本文の中だけで使う、最小の見た目
const REPORT_BODY_STYLE = '<style>body{margin:8px;font-family:"Yu Gothic UI","Hiragino Sans","Meiryo",system-ui,sans-serif;font-size:16px;line-height:1.7;color:#1c2430}'
    + 'h1,h2,h3{line-height:1.4}table{border-collapse:collapse}th,td{border:1px solid #c9d0d9;padding:6px 10px;text-align:left}th{background:#f6f7f9}svg,img{max-width:100%;height:auto}</style>';

/** 報告・説明の画面本体の HTML を生成する */
export function buildReportHtml(report, kind, { saveTo } = {}) {
    const settings = KIND_SETTINGS[kind];
    // 本文は、質問の表示物と同じ、スクリプト無効の sandbox と、外部通信を禁止する CSP の iframe の中でだけ表示する
    // 本文の `<pre class="mermaid">` は、図に変換する(mermaid.mjs。FR-011)。ほかの部分は、変えない
    const body = expandReportBody(report.body).body;
    const doc = `<meta http-equiv="Content-Security-Policy" content="${MOCK_CSP}">${REPORT_BODY_STYLE}${body}`;
    const frame = `<iframe sandbox="allow-same-origin" referrerpolicy="no-referrer" title="${escapeHtml(report.title)}" srcdoc="${escapeHtml(doc)}"></iframe>`;
    let html = readTemplate('report.html');
    html = replaceMarker(html, '<!--ASKUI_PAGE_TITLE-->', `ask-ui ${settings.kindLabel}`);
    html = replaceMarker(html, '<!--ASKUI_TITLE-->', escapeHtml(report.title));
    html = replaceMarker(html, '<!--ASKUI_KIND_LABEL-->', settings.kindLabel);
    html = replaceMarker(html, '<!--ASKUI_FRAME-->', frame);
    html = replaceMarker(html, '<!--ASKUI_CHECKED-->', settings.defaultSave ? ' checked' : '');
    html = replaceMarker(html, '<!--ASKUI_SAVE_LABEL-->', settings.saveLabel);
    html = replaceMarker(html, '<!--ASKUI_DEFAULT_TEXT-->', settings.defaultSave ? '既定: チェックあり' : '既定: チェックなし');
    html = replaceMarker(html, '<!--ASKUI_SAVE_TO-->', renderSaveTo(saveTo));
    html = replaceMarker(html, '/*ASKUI_META*/', toSafeJson({ defaultSave: settings.defaultSave }));
    return html;
}

/** 報告・説明から admin-loader.js の内容を生成する。検証に失敗した場合は例外を投げる */
export function buildReportAll(report, kind, options = {}) {
    if (!Object.hasOwn(KIND_SETTINGS, kind)) {
        throw new Error(`--kind は report または explain にしてください: ${kind}`);
    }
    const validation = validateReport(report, { withWarnings: false });
    if (!validation.ok) {
        const error = new Error('報告の検証に失敗しました');
        error.validationErrors = validation.errors;
        throw error;
    }
    const formHtml = buildReportHtml(report, kind, options);
    const adminHtml = buildAdminHtml(formHtml, { mode: 'report', defaultSave: KIND_SETTINGS[kind].defaultSave });
    return { formHtml, adminHtml, loader: buildLoader(adminHtml) };
}

const USAGE = '使い方: node build-pages.mjs <入力.json> <出力フォルダ> [--kind report|explain] [--save-to <表示用の保存先の文字>]';

/** 引数を、位置引数とオプションに分ける。誤りは例外にする */
function parseArgs(args) {
    const positional = [];
    const options = {};
    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        if (arg === '--kind' || arg === '--save-to') {
            const value = args[i + 1];
            if (value === undefined || value.startsWith('--')) {
                throw new Error(`${arg} に値がありません`);
            }
            options[arg === '--kind' ? 'kind' : 'saveTo'] = value;
            i += 1;
        } else if (arg.startsWith('--')) {
            throw new Error(`不明なオプションです: ${arg}`);
        } else {
            positional.push(arg);
        }
    }
    return { positional, options };
}

function main(argv) {
    let parsed;
    try {
        parsed = parseArgs(argv.slice(2));
    } catch (error) {
        console.error(error.message);
        console.error(USAGE);
        return 2;
    }
    const [inputPath, outDir] = parsed.positional;
    const { kind, saveTo } = parsed.options;
    if (!inputPath || !outDir || parsed.positional.length !== 2) {
        console.error(USAGE);
        return 2;
    }
    if (kind !== undefined && !Object.hasOwn(KIND_SETTINGS, kind)) {
        console.error(`--kind は report または explain にしてください: ${kind}`);
        console.error(USAGE);
        return 2;
    }
    const label = kind === undefined ? '票' : '報告';
    let input;
    try {
        input = JSON.parse(readFileSync(inputPath, 'utf8'));
    } catch (error) {
        console.error(`${label}を読み込めません: ${error.message}`);
        return 2;
    }
    let built;
    try {
        built = kind === undefined ? buildAll(input, { saveTo }) : buildReportAll(input, kind, { saveTo });
    } catch (error) {
        if (error.validationErrors) {
            console.error(error.message);
            for (const item of error.validationErrors) {
                console.error(`- ${item.path}: ${item.message}`);
            }
            return 1;
        }
        console.error(error.message);
        return 2;
    }
    try {
        mkdirSync(outDir, { recursive: true });
        const loaderPath = resolve(outDir, 'admin-loader.js');
        writeFileSync(loaderPath, built.loader, 'utf8');
        console.log(loaderPath);
    } catch (error) {
        console.error(`出力に失敗しました: ${error.message}`);
        return 2;
    }
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    process.exitCode = main(process.argv);
}
