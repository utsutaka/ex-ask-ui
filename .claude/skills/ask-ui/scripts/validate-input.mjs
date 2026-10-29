// 質問・議論の票と、報告の検証スクリプト(書式の規則と、機密情報らしい文字列の検出)
// 使い方: node validate-input.mjs <票.json>
//         node validate-input.mjs --report <report.json>
// 終了コード: 0 = 合格、1 = 規則違反または機密情報の検出(古い形式を含む)、2 = 読み込みの失敗
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MERMAID_MAX_LENGTH, UNSAFE_HTML_PATTERNS, collectWarnings, expandReportBody } from './mermaid.mjs';

const ID_PATTERN = /^[A-Za-z0-9-]+$/;
const LEVELS = ['高', '中', '低'];
// 図表の種類ごとの項目。table、svg、mock は html(HTML の断片)を持ち、mermaid は source(記述のテキスト)を持つ
const HTML_EXHIBIT_KEYS = ['kind', 'caption', 'html'];
const EXHIBIT_KEYS = {
    table: HTML_EXHIBIT_KEYS,
    svg: HTML_EXHIBIT_KEYS,
    mock: HTML_EXHIBIT_KEYS,
    mermaid: ['kind', 'caption', 'source']
};
const EXHIBIT_KINDS = Object.keys(EXHIBIT_KEYS);

const BOARD_KINDS = ['question', 'discussion'];
const QUESTION_KEYS = ['id', 'title', 'decide', 'current', 'problem', 'ideal', 'recommendation', 'multiple', 'allowFreeText', 'options'];
const DISCUSSION_KEYS = ['id', 'title', 'topic', 'current', 'problem', 'ideal', 'drafts', 'view', 'opinion'];
const OPTION_KEYS = ['id', 'label', 'recommended', 'differenceFromRecommended', 'content', 'effect', 'feasibility', 'risk', 'fit'];
const DRAFT_KEYS = ['id', 'label', 'content', 'effect', 'risk', 'fit', 'open'];

// 機能 001 の形式の目印(古い形式として拒否する)
const LEGACY_ITEM_KEYS = ['history', 'background', 'intent', 'consequence'];

const LEGACY_MESSAGE = '古い形式(機能 001)の質問票です。新しい書式(ルートは kind と items。質問の項目は decide、current、problem、ideal、recommendation、multiple、allowFreeText、options。議論の項目は topic、current、problem、ideal、drafts、view、opinion)に書き直してください';

// 機密情報らしい文字列の形式(誤検知を許容し、拒否する側に倒す)
export const SECRET_PATTERNS = [
    /sk-[A-Za-z0-9_-]{20,}/,
    /AKIA[0-9A-Z]{16}/,
    /gh[pousr]_[A-Za-z0-9]{30,}/,
    /github_pat_[A-Za-z0-9_]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{10,}/,
    /AIza[0-9A-Za-z_-]{30,}/,
    /Bearer\s+[A-Za-z0-9._~+/-]{20,}/,
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    // キー名と値の形。値が、ASCII の文字(英数字と記号)の列(6 文字以上)のときだけ検出する。
    // 引用符で始まる値(password: "hunter2")や、記号で始まる値(password: !secret123)も検出する。
    // 日本語の文章(password: 不要と決めた)は、ASCII の文字ではないため、検出しない
    /(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token)\s*[=:：]\s*["'`]?[\x21-\x7E]{6,}/i,
    /^[A-Z][A-Z0-9_]{2,}=\S+/m
];

// table と svg の html に含めてはならないもの(UNSAFE_HTML_PATTERNS)は、mermaid.mjs で定義し、import して使う
// (変換の結果にも同じ規則を適用するため。mermaid.mjs が、このファイルを import すると循環するため、定義を向こうに置く)

function isObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim() !== '';
}

// 旧項目(機能 003 の最初の書式)の案内。該当する旧項目が渡されたときだけ、新しい欄の名前を示す
const DECIDE_HINT = '「決めること」は text に、何を決めるか、意義と狙い、重要度(必須か任意か。根拠と期限)、きっかけ(出所と、根拠の確かさ)を含めた 1 つの文章を書いてください';
const CURRENT_HINT = '「1. 現状」は text に、概要と、決定済みの事項(反映先を含む)を含めた 1 つの文章を書いてください。原文は original のままです';
const GIVEN_HINT = '推奨ありは text に、最適である理由と、修正イメージ(何をどう変えるか)を含めた 1 つの文章を書いてください';
const NONE_HINT = '推奨なしは text に、示せない理由と、判断に必要な情報を含めた 1 つの文章を書いてください';
const TOPIC_HINT = '「議論したいこと」は text に、意義と狙い、重要度、きっかけ(出所と、根拠の確かさ)を含めた 1 つの文章を書いてください。論点は questions のままです';
const OLD_TEXT_KEYS = ['content', 'significance', 'importance', 'source', 'summary', 'decided', 'reason', 'image', 'info'];

function checkUnknownKeys(obj, allowed, path, errors, hint) {
    for (const key of Object.keys(obj)) {
        if (!allowed.includes(key)) {
            const message = hint !== undefined && OLD_TEXT_KEYS.includes(key)
                ? `定義にない項目です(旧項目)。${hint}`
                : '定義にない項目です';
            errors.push({ path: `${path}.${key}`, message });
        }
    }
}

function checkRequiredText(obj, keys, path, errors) {
    for (const key of keys) {
        if (!isNonEmptyString(obj[key])) {
            errors.push({ path: `${path}.${key}`, message: '必須の項目が空です' });
        }
    }
}

function checkId(value, path, seen, errors) {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
        errors.push({ path, message: '英数字とハイフンのみの id が必要です' });
        return;
    }
    if (seen.has(value)) {
        errors.push({ path, message: 'id が重複しています' });
    }
    seen.add(value);
}

/** 文字の項目だけを持つオブジェクトを検証する。必須の項目と、書く場合だけの項目(optional)を分ける */
function checkTextFields(obj, path, required, optional, errors, hint) {
    if (!isObject(obj)) {
        errors.push({ path, message: 'オブジェクトにしてください' });
        return false;
    }
    checkUnknownKeys(obj, [...required, ...optional], path, errors, hint);
    checkRequiredText(obj, required, path, errors);
    for (const key of optional) {
        if (obj[key] !== undefined && !isNonEmptyString(obj[key])) {
            errors.push({ path: `${path}.${key}`, message: '書く場合は、空にしないでください' });
        }
    }
    return true;
}

/** 水準(高、中、低)と理由の組を検証する */
function checkLevel(value, path, errors) {
    if (!isObject(value)) {
        errors.push({ path, message: '水準(level)と理由(reason)のオブジェクトにしてください' });
        return;
    }
    checkUnknownKeys(value, ['level', 'reason'], path, errors);
    if (!LEVELS.includes(value.level)) {
        errors.push({ path: `${path}.level`, message: '高、中、低のいずれかにしてください' });
    }
    checkRequiredText(value, ['reason'], path, errors);
}

function checkExhibits(exhibits, path, errors) {
    if (!Array.isArray(exhibits)) {
        errors.push({ path, message: '図表は配列にしてください' });
        return;
    }
    exhibits.forEach((exhibit, index) => {
        const exhibitPath = `${path}[${index}]`;
        if (!isObject(exhibit)) {
            errors.push({ path: exhibitPath, message: '図表はオブジェクトにしてください' });
            return;
        }
        const known = EXHIBIT_KINDS.includes(exhibit.kind);
        // 種類が分からないときは、どちらの項目も許し、種類のエラーだけを示す
        checkUnknownKeys(exhibit, known ? EXHIBIT_KEYS[exhibit.kind] : [...HTML_EXHIBIT_KEYS, 'source'], exhibitPath, errors);
        if (!known) {
            errors.push({ path: `${exhibitPath}.kind`, message: 'table、svg、mock、mermaid のいずれかにしてください' });
        }
        if (exhibit.kind === 'mermaid') {
            // 空白だけの source は、部品に渡す前に、検証エラー(拒否)で止める。部品のエラーは、警告(拒否しない)
            checkRequiredText(exhibit, ['caption', 'source'], exhibitPath, errors);
            if (typeof exhibit.source === 'string' && exhibit.source.length > MERMAID_MAX_LENGTH) {
                errors.push({ path: `${exhibitPath}.source`, message: `${MERMAID_MAX_LENGTH.toLocaleString('en-US')} 文字以下にしてください` });
            }
            return;
        }
        checkRequiredText(exhibit, ['caption', 'html'], exhibitPath, errors);
        if ((exhibit.kind === 'table' || exhibit.kind === 'svg') && isNonEmptyString(exhibit.html)) {
            for (const { pattern, label } of UNSAFE_HTML_PATTERNS) {
                if (pattern.test(exhibit.html)) {
                    errors.push({ path: `${exhibitPath}.html`, message: `${label}を含めないでください` });
                }
            }
        }
    });
}

function checkCurrent(current, path, errors) {
    checkTextFields(current, path, ['text'], ['original'], errors, CURRENT_HINT);
}

function checkIdeal(ideal, path, errors) {
    checkTextFields(ideal, path, ['vision'], ['notes'], errors);
}

// 問題点: 図表が 1 件以上ある場合は noExhibitReason を書かない。0 件(欠落、または空の配列)の場合は noExhibitReason が必要
function checkProblem(problem, path, errors) {
    if (!isObject(problem)) {
        errors.push({ path, message: 'オブジェクトにしてください' });
        return;
    }
    checkUnknownKeys(problem, ['description', 'exhibits', 'noExhibitReason'], path, errors);
    checkRequiredText(problem, ['description'], path, errors);
    if (problem.exhibits !== undefined) {
        checkExhibits(problem.exhibits, `${path}.exhibits`, errors);
        if (!Array.isArray(problem.exhibits)) {
            return;
        }
    }
    const hasExhibits = Array.isArray(problem.exhibits) && problem.exhibits.length > 0;
    if (hasExhibits && problem.noExhibitReason !== undefined) {
        errors.push({ path: `${path}.noExhibitReason`, message: '図表がある場合には、図表が要らない理由を書かないでください(矛盾するため)' });
    }
    if (!hasExhibits && !isNonEmptyString(problem.noExhibitReason)) {
        errors.push({ path: `${path}.exhibits`, message: '図表を付けるか、図表が要らない理由(noExhibitReason)を書いてください' });
    }
}

/** 項目の定義にない項目を、種別に合わない項目と、それ以外に分けて報告する */
function checkItemKeys(item, own, other, path, kindLabel, errors) {
    for (const key of Object.keys(item)) {
        if (own.includes(key)) {
            continue;
        }
        if (other.includes(key)) {
            errors.push({ path: `${path}.${key}`, message: `${kindLabel}の票には、入れられない項目です(種別に合わない項目)` });
        } else {
            errors.push({ path: `${path}.${key}`, message: '定義にない項目です' });
        }
    }
}

/** 推奨(あり、なし)を検証し、'given'、'none'、または null を返す */
function checkRecommendation(recommendation, path, errors) {
    if (!isObject(recommendation)) {
        errors.push({ path, message: '推奨は given(推奨あり)か none(推奨なし)のオブジェクトにしてください' });
        return null;
    }
    checkUnknownKeys(recommendation, ['given', 'none'], path, errors);
    const hasGiven = recommendation.given !== undefined;
    const hasNone = recommendation.none !== undefined;
    if (hasGiven === hasNone) {
        errors.push({ path, message: '推奨は given(推奨あり)か none(推奨なし)のどちらか 1 つだけにしてください' });
        return null;
    }
    if (hasGiven) {
        checkTextFields(recommendation.given, `${path}.given`, ['text'], [], errors, GIVEN_HINT);
        return 'given';
    }
    checkTextFields(recommendation.none, `${path}.none`, ['text'], [], errors, NONE_HINT);
    return 'none';
}

function checkOptions(options, recommendationKind, path, errors) {
    if (!Array.isArray(options) || options.length < 2 || options.length > 4) {
        errors.push({ path, message: '選択肢は 2〜4 件にしてください' });
        return;
    }
    const seen = new Set();
    options.forEach((option, index) => {
        const optionPath = `${path}[${index}]`;
        if (!isObject(option)) {
            errors.push({ path: optionPath, message: '選択肢はオブジェクトにしてください' });
            return;
        }
        checkUnknownKeys(option, OPTION_KEYS, optionPath, errors);
        checkId(option.id, `${optionPath}.id`, seen, errors);
        checkRequiredText(option, ['label', 'content', 'effect', 'feasibility', 'risk'], optionPath, errors);
        checkLevel(option.fit, `${optionPath}.fit`, errors);
        if (typeof option.recommended !== 'boolean') {
            errors.push({ path: `${optionPath}.recommended`, message: '真偽値が必要です' });
        }
        const hasDifference = option.differenceFromRecommended !== undefined;
        if (hasDifference && !isNonEmptyString(option.differenceFromRecommended)) {
            errors.push({ path: `${optionPath}.differenceFromRecommended`, message: '書く場合は、空にしないでください' });
        }
        if (recommendationKind === 'given') {
            // 推奨あり: 先頭だけが推奨。先頭は推奨との違いを持たず、先頭以外は持つ
            if (index === 0 && option.recommended !== true) {
                errors.push({ path: `${optionPath}.recommended`, message: '推奨がある場合、先頭の選択肢は推奨(true)にしてください' });
            }
            if (index > 0 && option.recommended === true) {
                errors.push({ path: `${optionPath}.recommended`, message: '推奨は先頭の 1 件だけです' });
            }
            if (index === 0 && hasDifference) {
                errors.push({ path: `${optionPath}.differenceFromRecommended`, message: '推奨の選択肢(先頭)には、推奨との違いを書かないでください(矛盾するため)' });
            }
            if (index > 0 && !hasDifference) {
                errors.push({ path: `${optionPath}.differenceFromRecommended`, message: '推奨以外の選択肢には、推奨との違いが必要です' });
            }
        } else if (recommendationKind === 'none') {
            // 推奨なし: 推奨の印も、推奨との違いも持たない
            if (option.recommended === true) {
                errors.push({ path: `${optionPath}.recommended`, message: '推奨がない場合、推奨(true)にしないでください' });
            }
            if (hasDifference) {
                errors.push({ path: `${optionPath}.differenceFromRecommended`, message: '推奨がない場合、推奨との違いを書かないでください(矛盾するため)' });
            }
        }
    });
}

function checkQuestionItem(item, path, seenIds, errors) {
    if (!isObject(item)) {
        errors.push({ path, message: '質問はオブジェクトにしてください' });
        return;
    }
    checkItemKeys(item, QUESTION_KEYS, DISCUSSION_KEYS, path, '質問', errors);
    checkId(item.id, `${path}.id`, seenIds, errors);
    checkRequiredText(item, ['title'], path, errors);
    checkTextFields(item.decide, `${path}.decide`, ['text'], [], errors, DECIDE_HINT);
    checkCurrent(item.current, `${path}.current`, errors);
    checkProblem(item.problem, `${path}.problem`, errors);
    checkIdeal(item.ideal, `${path}.ideal`, errors);
    const recommendationKind = checkRecommendation(item.recommendation, `${path}.recommendation`, errors);
    if (typeof item.multiple !== 'boolean') {
        errors.push({ path: `${path}.multiple`, message: '真偽値が必要です' });
    }
    if (item.allowFreeText !== true) {
        errors.push({ path: `${path}.allowFreeText`, message: '自由記入の余地(true)が必要です' });
    }
    checkOptions(item.options, recommendationKind, `${path}.options`, errors);
}

function checkDiscussionItem(item, path, seenIds, errors) {
    if (!isObject(item)) {
        errors.push({ path, message: '議論はオブジェクトにしてください' });
        return;
    }
    checkItemKeys(item, DISCUSSION_KEYS, QUESTION_KEYS, path, '議論', errors);
    checkId(item.id, `${path}.id`, seenIds, errors);
    checkRequiredText(item, ['title'], path, errors);

    const topic = item.topic;
    if (isObject(topic)) {
        checkUnknownKeys(topic, ['questions', 'text'], `${path}.topic`, errors, TOPIC_HINT);
        checkRequiredText(topic, ['text'], `${path}.topic`, errors);
        // 論点(問い)は、1〜3 件の文字列の配列
        const topicPath = `${path}.topic.questions`;
        if (!Array.isArray(topic.questions) || topic.questions.length < 1 || topic.questions.length > 3) {
            errors.push({ path: topicPath, message: '論点(問い)は 1〜3 件にしてください' });
        } else {
            topic.questions.forEach((question, index) => {
                if (!isNonEmptyString(question)) {
                    errors.push({ path: `${topicPath}[${index}]`, message: '論点が空です' });
                }
            });
        }
    } else {
        errors.push({ path: `${path}.topic`, message: 'オブジェクトにしてください' });
    }

    checkCurrent(item.current, `${path}.current`, errors);
    checkProblem(item.problem, `${path}.problem`, errors);
    checkIdeal(item.ideal, `${path}.ideal`, errors);

    const draftsPath = `${path}.drafts`;
    if (!Array.isArray(item.drafts) || item.drafts.length < 2 || item.drafts.length > 4) {
        errors.push({ path: draftsPath, message: '叩き台は 2〜4 件にしてください' });
    } else {
        const seen = new Set();
        item.drafts.forEach((draft, index) => {
            const draftPath = `${draftsPath}[${index}]`;
            if (!isObject(draft)) {
                errors.push({ path: draftPath, message: '叩き台はオブジェクトにしてください' });
                return;
            }
            checkUnknownKeys(draft, DRAFT_KEYS, draftPath, errors);
            checkId(draft.id, `${draftPath}.id`, seen, errors);
            checkRequiredText(draft, ['label', 'content', 'effect', 'risk', 'open'], draftPath, errors);
            checkLevel(draft.fit, `${draftPath}.fit`, errors);
        });
    }

    const view = item.view;
    if (isObject(view)) {
        checkUnknownKeys(view, ['conclusion', 'basis', 'unknown', 'confidence'], `${path}.view`, errors);
        checkRequiredText(view, ['conclusion', 'basis', 'unknown'], `${path}.view`, errors);
        // 確信の度合いは、水準(level と reason の組)
        checkLevel(view.confidence, `${path}.view.confidence`, errors);
    } else {
        errors.push({ path: `${path}.view`, message: 'オブジェクトにしてください' });
    }
    checkTextFields(item.opinion, `${path}.opinion`, ['guide'], [], errors);
}

// 文字列の欄を再帰的にたどり、機密情報らしい文字列を含む欄の名前だけを集める(値は返さない)
function findSecretPaths(value, path, found) {
    if (typeof value === 'string') {
        if (SECRET_PATTERNS.some((pattern) => pattern.test(value))) {
            found.push(path);
        }
    } else if (Array.isArray(value)) {
        value.forEach((item, index) => findSecretPaths(item, `${path}[${index}]`, found));
    } else if (typeof value === 'object' && value !== null) {
        for (const [key, item] of Object.entries(value)) {
            findSecretPaths(item, path === '' ? key : `${path}.${key}`, found);
        }
    }
    return found;
}

function isLegacyBoard(data) {
    if ('questions' in data) {
        return true;
    }
    return Array.isArray(data.items) && data.items.some((item) => isObject(item) && LEGACY_ITEM_KEYS.some((key) => key in item));
}

/**
 * 質問・議論の票を検証する
 * 検証エラー(errors)は、票の形の誤りで、画面に出さない。警告(warnings)は、mermaid の記述の中身の誤り(部品のエラー)で、
 * 表示を止めない(ok に影響しない)。警告は、検証エラーがないときだけ計算する(変換を伴うため)。
 * 画面の生成と保存が、内部で呼ぶときは、{ withWarnings: false } で、警告の計算(= 変換)を省く
 * @param {object} data 票
 * @param {{ withWarnings?: boolean }} [options]
 * @returns {{ ok: boolean, errors: {path: string, message: string}[], warnings: {path: string, message: string}[], legacy?: boolean }}
 */
export function validateQuestionSet(data, { withWarnings = true } = {}) {
    if (!isObject(data)) {
        return { ok: false, errors: [{ path: '(root)', message: '票はオブジェクトにしてください' }], warnings: [] };
    }
    if (isLegacyBoard(data)) {
        return { ok: false, legacy: true, errors: [{ path: '(root)', message: LEGACY_MESSAGE }], warnings: [] };
    }
    const errors = [];
    checkUnknownKeys(data, ['kind', 'items'], '(root)', errors);
    if (!BOARD_KINDS.includes(data.kind)) {
        errors.push({ path: 'kind', message: 'question か discussion にしてください' });
    }
    if (!Array.isArray(data.items) || data.items.length < 1 || data.items.length > 4) {
        errors.push({ path: 'items', message: '項目は 1〜4 件にしてください' });
    } else if (BOARD_KINDS.includes(data.kind)) {
        const seenIds = new Set();
        data.items.forEach((item, index) => {
            const path = `items[${index}]`;
            if (data.kind === 'question') {
                checkQuestionItem(item, path, seenIds, errors);
            } else {
                checkDiscussionItem(item, path, seenIds, errors);
            }
        });
    }
    for (const path of findSecretPaths(data, '', [])) {
        errors.push({ path, message: '機密情報らしい文字列を検出しました(値は表示しません)' });
    }
    const warnings = withWarnings && errors.length === 0 ? collectWarnings(data.items) : [];
    return { ok: errors.length === 0, errors, warnings };
}

const REPORT_KEYS = ['title', 'body'];

/**
 * 報告・説明(題名と本文)を検証する。本文の構成は検証せず、スクリプトや外部通信も拒否しない(表示のとき実行されない形にするため)。
 * 本文の `<pre class="mermaid">` が、部品のエラーのとき(上限を超えたとき、空のときを含む)は、拒否せず、警告(warnings)を返す。
 * 警告は、検証エラーがないときだけ計算する(変換を伴うため)。{ withWarnings: false } で、警告の計算(= 変換)を省ける
 * @param {object} data 報告
 * @param {{ withWarnings?: boolean }} [options]
 * @returns {{ ok: boolean, errors: {path: string, message: string}[], warnings: {path: string, message: string}[] }}
 */
export function validateReport(data, { withWarnings = true } = {}) {
    const errors = [];
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
        return { ok: false, errors: [{ path: '(root)', message: '報告はオブジェクトにしてください' }], warnings: [] };
    }
    checkUnknownKeys(data, REPORT_KEYS, '(root)', errors);
    checkRequiredText(data, REPORT_KEYS, '(root)', errors);
    for (const path of findSecretPaths(data, '', [])) {
        errors.push({ path, message: '機密情報らしい文字列を検出しました(値は表示しません)' });
    }
    const warnings = withWarnings && errors.length === 0 ? expandReportBody(data.body).warnings : [];
    return { ok: errors.length === 0, errors, warnings };
}

/** ファイルを読み込んで検証する。読み込みの失敗は例外にせず、status で返す。kind が report のときは報告として検証する */
export function validateFile(filePath, kind = 'question') {
    const label = kind === 'report' ? '報告' : '票';
    let data;
    try {
        data = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (error) {
        return { status: 'unreadable', message: `${label}を読み込めません: ${error.message}` };
    }
    const result = kind === 'report' ? validateReport(data) : validateQuestionSet(data);
    return { status: result.ok ? 'ok' : 'invalid', errors: result.errors, warnings: result.warnings ?? [] };
}

/** 警告を、標準出力に出す(終了コードは変えない。contracts/validation-output.md) */
function printWarnings(label, warnings) {
    if (warnings.length === 0) {
        return;
    }
    console.log(`警告 ${warnings.length} 件(${label}は、表示できます。内容を確認してください)`);
    for (const warning of warnings) {
        console.log(`- ${warning.path}: ${warning.message}`);
    }
}

function main(argv) {
    const isReport = argv[2] === '--report';
    const filePath = isReport ? argv[3] : argv[2];
    const label = isReport ? '報告' : '票';
    if (!filePath) {
        console.error('使い方: node validate-input.mjs <票.json> | --report <report.json>');
        return 2;
    }
    const result = validateFile(filePath, isReport ? 'report' : 'question');
    if (result.status === 'unreadable') {
        console.error(result.message);
        return 2;
    }
    if (result.status === 'invalid') {
        console.error(`${label}の検証に失敗しました。画面には出しません。`);
        for (const error of result.errors) {
            console.error(`- ${error.path}: ${error.message}`);
        }
        return 1;
    }
    console.log(`${label}の検証に合格しました`);
    printWarnings(label, result.warnings);
    return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    process.exitCode = main(process.argv);
}
