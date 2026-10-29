// mermaid の記述を、図(SVG)に変換し、表示用の HTML の断片にするモジュール(機能 004)
// 検証(validate-input.mjs)、画面の生成(build-pages.mjs)、保存(save-html.mjs)が、同じ結果を得るために、変換をここに集める
// 依存の向きは、この 3 つからこのモジュールへの一方向だけ(このモジュールは、3 つを import しない。循環を避けるため)

// 同梱の変換の部品を読み込む(最上位の await)。読み込みに失敗しても、モジュールは読み込めるようにし、
// 失敗は、変換の結果(ok: false)として返す(作業を止めない)
let loadedRenderer = null;
let loadError = null;
try {
    ({ renderMermaidSVG: loadedRenderer } = await import('./vendor/beautiful-mermaid.bundle.mjs'));
} catch (error) {
    loadError = error;
}

/** 記述の長さの上限(文字数)。変換は途中で止められないため、処理時間を抑える。research.md の R11 */
export const MERMAID_MAX_LENGTH = 5000;

/** 対応する図の種類の案内(部品が対応する種類。現時点は 6 種。FR-003) */
export const SUPPORTED_TYPES_NOTE = '対応する図は、フローチャート、状態、シーケンス、クラス、ER、XY の 6 種です。';

/**
 * 図の記述(変換の結果の SVG)に含めてはならないもの。table と svg の html にも、同じ規則を使う(多重の防御。表示は、sandbox と CSP の中で行う)
 * validate-input.mjs が import して使う。FR-008
 */
export const UNSAFE_HTML_PATTERNS = [
    { pattern: /<\s*script\b/i, label: 'スクリプト要素' },
    { pattern: /[\s/"'`]on[a-z]+\s*=/i, label: 'イベント属性' },
    { pattern: /javascript\s*:/i, label: 'javascript:' },
    { pattern: /<\s*(iframe|object|embed|link|meta|base|form|foreignObject)\b/i, label: '埋め込みや外部参照の要素' },
    { pattern: /\b(src|href|xlink:href)\s*=\s*["']?\s*(https?:)?\/\//i, label: '外部への参照' },
    // 機能 004 で足した 2 つ: スタイルの中の外部参照(フォントの読み込みなど)
    { pattern: /url\(\s*["']?\s*(https?:)?\/\//i, label: '外部への参照(url)' },
    { pattern: /@import\b/i, label: '@import' }
];

// 変換の設定(今の図表と同じ文字色と書体。背景は透明)
const RENDER_OPTIONS = { transparent: true, bg: '#ffffff', fg: '#1c2430', font: 'Yu Gothic UI' };

/** 試験用の差し替え口。fn(関数)で変換の実体を差し替える。LOAD_FAILURE で、部品を読み込めない状態にする。null で元に戻す */
export const LOAD_FAILURE = Symbol('load-failure');
let testRenderer = null;
export function setRendererForTest(value) {
    testRenderer = value ?? null;
}

/** HTML の記号を直す(build-pages.mjs と同じ規則。そこから import すると循環するため、ここに持つ) */
export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function firstLine(error) {
    return String(error?.message ?? error).split('\n')[0].slice(0, 200);
}

/** 変換に使う関数を返す。使えないときは、理由(文字列)を返す */
function resolveRenderer() {
    if (testRenderer === LOAD_FAILURE) {
        return { reason: '変換の部品を読み込めません(試験用の状態)' };
    }
    if (typeof testRenderer === 'function') {
        return { fn: testRenderer };
    }
    if (loadedRenderer === null) {
        return { reason: `変換の部品を読み込めません: ${loadError === null ? '不明な理由' : firstLine(loadError)}` };
    }
    return { fn: loadedRenderer };
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 部品の SVG の <style> の規則に、図の外枠のクラスを前置する(ほかの図や本文に及ばないようにする。FR-021)。
 * @import は、先に取り除かれている。それ以外の at-rule や、解釈できない文字があるときは、null を返す(安全に前置できない)
 */
function scopeCss(css, scopeClass) {
    const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
    if (text.includes('@')) {
        return null;
    }
    const rule = /([^{}]+)\{([^{}]*)\}/g;
    const rules = [];
    let match;
    while ((match = rule.exec(text)) !== null) {
        const selectors = match[1].split(',').map((s) => s.trim()).filter((s) => s !== '')
            .map((s) => `.${scopeClass} ${s}`);
        rules.push(`${selectors.join(', ')} {${match[2]}}`);
    }
    // 規則の外に、解釈できない文字が残っていないこと
    if (text.replace(rule, '').trim() !== '') {
        return null;
    }
    return rules.join('\n');
}

/** SVG の id と、その参照に、同じ接頭辞を付ける */
function prefixIds(svg, prefix) {
    const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    if (ids.size === 0) {
        return svg;
    }
    let result = svg.replace(/(\sid=")([^"]+)(")/g, (all, head, id, tail) => `${head}${prefix}${id}${tail}`);
    result = result.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g, (all, quote, id) => (
        ids.has(id) ? `url(${quote}#${prefix}${id}${quote})` : all
    ));
    result = result.replace(/((?:xlink:)?href=")#([^"]+)(")/g, (all, head, id, tail) => (
        ids.has(id) ? `${head}#${prefix}${id}${tail}` : all
    ));
    return result;
}

/** 部品の SVG の後処理: @import の除去、id の接頭辞、<style> の前置。安全に処理できないときは、理由(文字列)を返す */
function postProcess(rawSvg, key) {
    const scopeClass = `mmd-${key}`;
    // @import を取り除く(url の中に ; を含むため、閉じ括弧まで)
    let svg = rawSvg
        .replace(/@import\s+url\(\s*(['"]?)[^)]*?\1\s*\)\s*;?/gi, '')
        .replace(/@import\s+(['"])[^'"]*\1\s*;?/gi, '');
    let failed = false;
    svg = svg.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/gi, (all, open, css, close) => {
        const scoped = scopeCss(css, scopeClass);
        if (scoped === null) {
            failed = true;
            return all;
        }
        return `${open}\n${scoped}\n${close}`;
    });
    if (failed) {
        return { reason: 'スタイルの規則を、ほかの図から分けられないため、図にしませんでした' };
    }
    return { svg: prefixIds(svg, `${scopeClass}-`) };
}

/**
 * mermaid の記述を、図(SVG)に変換する。例外は、すべて捕捉し、呼び出し側へ投げない。
 * @param {string} source mermaid の記述
 * @param {{ key?: string }} [options] key: 文書の中で一意な、英数字とハイフンの文字列(id の接頭辞と、外枠のクラスに使う)
 * @returns {{ ok: true, svg: string } | { ok: false, reason: string }}
 */
export function convertMermaid(source, { key = 'x' } = {}) {
    if (typeof source !== 'string' || source.trim() === '') {
        return { ok: false, reason: '記述が空です' };
    }
    if (source.length > MERMAID_MAX_LENGTH) {
        return { ok: false, reason: `記述が長すぎます(${MERMAID_MAX_LENGTH} 文字まで)` };
    }
    const safeKey = /^[A-Za-z0-9-]+$/.test(String(key)) ? String(key) : String(key).replace(/[^A-Za-z0-9-]/g, '-');
    const renderer = resolveRenderer();
    if (renderer.fn === undefined) {
        return { ok: false, reason: renderer.reason };
    }
    let rawSvg;
    try {
        rawSvg = renderer.fn(source, RENDER_OPTIONS);
    } catch (error) {
        return { ok: false, reason: firstLine(error) };
    }
    if (typeof rawSvg !== 'string' || !/^\s*<svg\b/i.test(rawSvg)) {
        return { ok: false, reason: '変換の結果が、SVG ではありません' };
    }
    const processed = postProcess(rawSvg, safeKey);
    if (processed.svg === undefined) {
        return { ok: false, reason: processed.reason };
    }
    if (UNSAFE_HTML_PATTERNS.some(({ pattern }) => pattern.test(processed.svg))) {
        return { ok: false, reason: '外部への参照などを含むため、図にしませんでした' };
    }
    return { ok: true, svg: processed.svg };
}

// 図の断片の見た目。セレクタは、.mmd で始まるものだけにする(保存ファイルの本文に置いても、ほかの要素に影響しないため)
const FIGURE_STYLE = '.mmd{margin:0}'
    + '.mmd-fig{overflow-x:auto}'
    + '.mmd-fig svg{max-width:100%;height:auto}'
    + '.mmd-src{margin-top:8px}'
    + '.mmd-src summary{cursor:pointer;color:#4d5968;font-size:0.9rem}'
    + '.mmd pre{margin:6px 0 0;padding:8px 10px;background:#f6f7f9;border:1px solid #c9d0d9;border-radius:4px;'
    + 'white-space:pre-wrap;word-break:break-all;font-size:0.85rem;line-height:1.5;overflow-x:auto}'
    + '.mmd-note{margin:0 0 4px;font-weight:600}'
    + '.mmd-reason{margin:0 0 6px;color:#4d5968;font-size:0.9rem}'
    + '.mmd-err{padding-left:10px;border-left:3px solid #b3541e}';

/**
 * 図の断片(HTML)を作る。変換できたときは、図と、折りたたんだ元の記述(FR-012)。
 * 変換できなかったときは、図の代わりに、図にできなかった旨、理由、元の記述を、展開して示す(FR-006)。
 * @returns {{ html: string, ok: boolean, reason?: string }}
 */
export function renderMermaidFigure(source, { caption, key = 'x' } = {}) {
    const result = convertMermaid(source, { key });
    const original = escapeHtml(typeof source === 'string' ? source : '');
    if (result.ok) {
        const safeKey = /^[A-Za-z0-9-]+$/.test(String(key)) ? String(key) : String(key).replace(/[^A-Za-z0-9-]/g, '-');
        return {
            ok: true,
            html: `<style>${FIGURE_STYLE}</style><div class="mmd">`
                + `<div class="mmd-fig mmd-${safeKey}" role="img" aria-label="${escapeHtml(caption ?? 'mermaid の図')}">${result.svg}</div>`
                + `<details class="mmd-src"><summary>元の記述を表示</summary><pre>${original}</pre></details></div>`
        };
    }
    return {
        ok: false,
        reason: result.reason,
        html: `<style>${FIGURE_STYLE}</style><div class="mmd mmd-err">`
            + `<p class="mmd-note">図にできなかったため、記述をそのまま表示しています。${SUPPORTED_TYPES_NOTE}</p>`
            + `<p class="mmd-reason">理由: ${escapeHtml(result.reason)}</p><pre>${original}</pre></div>`
    };
}

/** 警告の文(contracts/validation-output.md) */
export function warningMessage(reason) {
    return `図にできません(部品のエラー: ${reason})。${SUPPORTED_TYPES_NOTE}表示では、原文を展開して示します`;
}

/**
 * 票の項目(items)から、mermaid の図表の警告を集める。変換できない記述(部品のエラー)が対象。
 * 長さの上限を超えた source は、検証エラー(validate-input.mjs)になるため、ここでは扱わない
 * @returns {{ path: string, message: string }[]}
 */
export function collectWarnings(items) {
    const warnings = [];
    if (!Array.isArray(items)) {
        return warnings;
    }
    items.forEach((item, itemIndex) => {
        const exhibits = item?.problem?.exhibits;
        if (!Array.isArray(exhibits)) {
            return;
        }
        exhibits.forEach((exhibit, exhibitIndex) => {
            if (exhibit?.kind !== 'mermaid' || typeof exhibit.source !== 'string'
                || exhibit.source.trim() === '' || exhibit.source.length > MERMAID_MAX_LENGTH) {
                return;
            }
            const result = convertMermaid(exhibit.source, { key: `i${itemIndex}e${exhibitIndex}` });
            if (!result.ok) {
                warnings.push({
                    path: `items[${itemIndex}].problem.exhibits[${exhibitIndex}].source`,
                    message: warningMessage(result.reason)
                });
            }
        });
    });
    return warnings;
}

// HTML の文字参照のうち、報告本文の記述で使うものを、元の文字に戻す。1 回の置換でまとめて戻す
// (& を先に戻すと、&amp;lt; が < に二重に戻ってしまうため。contracts/report-body.md)
const ENTITIES = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&quot;': '"', '&#39;': "'" };
function decodeEntities(text) {
    return text.replace(/&(?:lt|gt|amp|quot|#39);/g, (entity) => ENTITIES[entity]);
}

/** 報告・説明の本文の、図に変換する要素(contracts/report-body.md)。class 属性(引用符つき)に、トークンとして mermaid を含む <pre> */
const REPORT_PRE = /<pre\b([^>]*)>([\s\S]*?)<\/pre\s*>/gi;
function hasMermaidClass(attributes) {
    const match = attributes.match(/\sclass\s*=\s*(["'])([^"']*)\1/i);
    return match !== null && match[2].split(/\s+/).includes('mermaid');
}

/**
 * 報告・説明の本文の、`<pre class="mermaid">` を、図の断片に置き換える(FR-011)。<pre> の外は、1 文字も変えない。
 * 変換しない書き方: class に mermaid を含まない <pre>(例: `<pre><code class="language-mermaid">`。FR-013)
 * 部品のエラーと、上限を超えた記述は、図にせず、原文を展開して示し、警告を返す(拒否しない)
 * @param {string} body 本文の HTML
 * @returns {{ body: string, warnings: { path: string, message: string }[] }}
 */
export function expandReportBody(body) {
    const warnings = [];
    if (typeof body !== 'string') {
        return { body, warnings };
    }
    let index = 0;
    const expanded = body.replace(REPORT_PRE, (whole, attributes, content) => {
        if (!hasMermaidClass(attributes)) {
            return whole;
        }
        const number = index;
        index += 1;
        // <pre> の直後の改行は、HTML が無視するため、取り除く。末尾の空白も、取り除く
        const source = decodeEntities(content).replace(/^\r?\n/, '').trimEnd();
        const figure = renderMermaidFigure(source, { caption: 'mermaid の図', key: `r${number}` });
        if (!figure.ok) {
            warnings.push({ path: `body[mermaid ${number + 1} 番目]`, message: warningMessage(figure.reason) });
        }
        return figure.html;
    });
    return { body: expanded, warnings };
}
