/*
 * フォームの判断ロジック(画面と切り離した関数)
 * ブラウザ(form.html に埋め込む)と Node(試験)の両方で読み込める形にする
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.AskUiFormLogic = factory();
    }
}(this, function () {
    'use strict';

    // 文字列として空かどうか(空白のみも空とみなす)
    function isBlank(value) {
        return typeof value !== 'string' || value.trim() === '';
    }

    // 1 問分の回答を整える。選択も自由記入も空なら null を返す
    function normalizeAnswer(question, input) {
        var selected = Array.isArray(input && input.selected) ? input.selected.slice() : [];
        var known = {};
        question.optionIds.forEach(function (id) { known[id] = true; });
        selected = selected.filter(function (id) { return known[id] === true; });
        if (!question.multiple && selected.length > 1) {
            // 単一選択では、最初の 1 件だけを採用する
            selected = selected.slice(0, 1);
        }
        var freeText = isBlank(input && input.freeText) ? '' : input.freeText.trim();
        if (selected.length === 0 && freeText === '') {
            return null;
        }
        var answer = { questionId: question.id, selected: selected };
        if (freeText !== '') {
            answer.freeText = freeText;
        }
        return answer;
    }

    // 質問票の全問から回答を組み立てる
    // questions: [{ id, multiple, optionIds }]、state: { [questionId]: { selected, freeText } }
    function collectAnswers(questions, state) {
        var answers = [];
        var missing = [];
        questions.forEach(function (question) {
            var answer = normalizeAnswer(question, state ? state[question.id] : null);
            if (answer === null) {
                missing.push(question.id);
            } else {
                answers.push(answer);
            }
        });
        if (missing.length > 0) {
            return { ok: false, missing: missing };
        }
        return { ok: true, payload: { status: 'answered', answers: answers } };
    }

    // 二重送信の防止。最初の 1 回だけ send を呼び、以降は無視する
    function createSubmitGuard(send) {
        var submitted = false;
        return function submit(payload) {
            if (submitted) {
                return false;
            }
            submitted = true;
            send(payload);
            return true;
        };
    }

    return {
        isBlank: isBlank,
        normalizeAnswer: normalizeAnswer,
        collectAnswers: collectAnswers,
        createSubmitGuard: createSubmitGuard
    };
}));
