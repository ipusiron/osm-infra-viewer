const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I18n = require('../i18n.js');
const { CATEGORIES, OBJECT_TYPES } = require('../osm-logic.js');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const script = read('script.js');
// 和文検出にgフラグを付けない（lastIndexが残り、繰り返し呼ぶと交互にfalseになる）。
const JAPANESE = /[぀-ヿ一-鿿]/;
// コメントの和文は許す。文字列の和文だけを見るため、先にコメントを落とす。
const stripComments = source => source.replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1');

test('日本語と英語で、キーの集合が同じ', () => {
    assert.deepEqual(Object.keys(I18n.ja).filter(key => !(key in I18n.en)), [], '英語に無いキー');
    assert.deepEqual(Object.keys(I18n.en).filter(key => !(key in I18n.ja)), [], '日本語に無いキー');
    assert.ok(Object.keys(I18n.ja).length >= 130, Object.keys(I18n.ja).length);
});

test('差し込みの名前が、日本語と英語で一致する', () => {
    const holes = text => [...String(text).matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
    assert.deepEqual(Object.keys(I18n.ja).filter(key => holes(I18n.ja[key]) !== holes(I18n.en[key])), []);
});

test('index.html が指すキーは、すべて辞書にある', () => {
    const keys = new Set();
    for (const m of html.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) keys.add(m[1]);
    assert.ok(keys.size >= 45, 'data-i18n が少なすぎる: ' + keys.size);
    assert.deepEqual([...keys].filter(key => !(key in I18n.ja)), []);
});

test('script.js が使うキーは、すべて辞書にある', () => {
    // t() の引数だけを見ると showStatus・三項演算子・対応表の値を取りこぼす。
    // キーの形をした文字列をすべて集める。末尾に文字を要求して 'zoom.' のような組み立てを除く。
    const keys = new Set([...stripComments(script).matchAll(/'([a-z][a-zA-Z]*\.[\w.]*[\w])'/g)].map(m => m[1]));
    assert.ok(keys.size >= 40, 'キーの数が少なすぎる: ' + keys.size);
    assert.deepEqual([...keys].filter(key => !(key in I18n.ja)), []);
    // 組み立てるキーは、接頭辞を別に数え上げる
    for (const prefix of ['zoom.']) assert.ok(script.includes("'" + prefix + "' +"), prefix);
});

test('組み立てるキーも辞書にそろっている', () => {
    for (const type of [...OBJECT_TYPES, { id: 'other', labelKey: 'type.other' }]) {
        assert.equal(type.labelKey, 'type.' + type.id);
        assert.ok(I18n.ja[type.labelKey], type.labelKey);
        assert.ok(I18n.en[type.labelKey], type.labelKey);
    }
    for (const category of CATEGORIES) {
        assert.equal(category.titleKey, 'category.' + category.id);
        assert.ok(I18n.ja[category.titleKey] && I18n.en[category.titleKey], category.titleKey);
    }
    for (const key of ['detail', 'medium', 'wide', 'huge']) assert.ok(I18n.ja['zoom.' + key], key);
});

test('英語の辞書に、訳し忘れの日本語が残っていない', () => {
    // 言語の切り替えボタンだけは、相手の言語を出すのが正しい
    const expected = new Set(['app.langButton']);
    assert.deepEqual(Object.keys(I18n.en).filter(key => !expected.has(key) && JAPANESE.test(I18n.en[key])), []);
});

test('t() は差し込みを埋める。知らないキーは黙って通さない', () => {
    assert.equal(I18n.t('status.found', { count: 12 }), '12個のオブジェクトを表示しました');
    assert.equal(I18n.t('summary.skipped', { count: 3 }), '座標のない要素3件は数えていません');
    assert.match(I18n.t('status.timeout', { partial: '/x/' }), /\/x\//);
    assert.throws(() => I18n.t('no.such.key'), /Unknown message/);
});

test('子要素を持つ要素に data-i18n を付けていない', () => {
    // 閉じタグの中で改行することがあるので </\1\s*> にする
    for (const m of html.matchAll(/<(\w+)[^>]*\sdata-i18n="[^"]+"[^>]*>([\s\S]*?)<\/\1\s*>/g)) {
        assert.ok(!m[2].includes('<'), m[1] + ': ' + m[2].slice(0, 60));
    }
});

test('JSが書き込むスロットには data-i18n を付けない', () => {
    // 付けると、結果が出ている状態で言語を変えたときに初期文言へ戻ってしまう
    for (const id of ['searchBtn', 'locationSearchBtn', 'zoomStatus', 'exportMessage', 'summaryContent']) {
        const tag = html.match(new RegExp('<[a-z]+[^>]*\\sid="' + id + '"[^>]*>'));
        assert.ok(tag, id);
        assert.doesNotMatch(tag[0], /data-i18n/, id);
    }
    // 復帰する文言を定数で書き戻していない（dataset.state から組み立てる）
    assert.doesNotMatch(stripComments(script), /textContent\s*=\s*'[^']*[぀-ヿ一-鿿]/);
    assert.match(script, /dataset\.state/);
    assert.match(script, /function renderSearchButton/);
    assert.match(script, /function renderLocationButton/);
});

test('表示中の通知はキーで覚え、言語を変えても訳し直す', () => {
    assert.match(script, /lastStatus = \{ key, type, values \}/);
    assert.match(script, /function renderStatus/);
    // 訳した文字列を差し込み値へ保存せず、描画の直前に訳す
    assert.match(script, /function resolveValues/);
    assert.match(script, /key: 'status\.timeoutPartial'/);
});

test('言語の切り替えで再検索せず、マーカーとポップアップだけ訳し直す', () => {
    const body = script.match(/function applyLanguageToViews\(\) \{([\s\S]*?)\n\}/)[1];
    assert.doesNotMatch(body, /fetch\(|searchInfrastructure/);
    for (const name of ['renderStatus', 'renderSummaryContent', 'retitleMarkers', 'updateZoomIndicator']) {
        assert.ok(body.includes(name + '()'), name);
    }
    assert.match(script, /isPopupOpen\(\)/);
    assert.match(script, /languagechange/);
});

test('状態で変わる属性を data-i18n で上書きしていない', () => {
    // aria-pressed だけがテーマの状態を持つ。aria-label は状態で変わらないので訳してよい。
    assert.doesNotMatch(script, /setAttribute\('aria-label'/);
    assert.match(html, /id="themeToggle"[^>]*data-i18n-aria-label="theme\.aria"/);
});

test('純粋ロジックから文言が消えている', () => {
    const logic = stripComments(read('osm-logic.js'));
    assert.doesNotMatch(logic, JAPANESE);
    assert.match(logic, /labelKey/);
    assert.match(logic, /titleKey/);
    assert.match(logic, /headingKey/);
    // OSMのタグ名は固有名詞なので訳さない
    for (const tag of ['man_made', 'surveillance', 'internet_access', 'power', 'highway', 'amenity']) {
        assert.ok(logic.includes("'" + tag + "'"), tag);
    }
});

test('script.js に残る和文の文字列は、外部データとの照合だけ', () => {
    const strings = [...stripComments(script).matchAll(/'([^'\n]*)'/g)].map(m => m[1])
        .filter(value => JAPANESE.test(value));
    // Nominatimは地域の言語で国名を返すため、日本語のまま比較する
    assert.deepEqual(strings, ['日本']);
});

test('言語の保存は i18n.js に閉じ込める', () => {
    const keys = [...script.matchAll(/localStorage\.(?:get|set)Item\('([^']+)'/g)].map(m => m[1]);
    assert.deepEqual([...new Set(keys)], ['theme']);
    assert.match(read('i18n.js'), /STORAGE_KEY = 'osm-infra-viewer-language'/);
    // 保存できない環境でも init が落ちない
    assert.match(read('i18n.js'), /try \{ saved = localStorage\.getItem\(STORAGE_KEY\); \} catch/);
});

test('i18n.js を他のスクリプトより先に読み込む', () => {
    assert.ok(html.indexOf('<script src="i18n.js">') < html.indexOf('<script src="osm-logic.js">'));
    assert.ok(html.indexOf('<script src="osm-logic.js">') < html.indexOf('<script src="script.js">'));
    assert.match(html, /id="langToggle"/);
});

test('noscript は日英を1つのテキストノードで併記する', () => {
    const body = html.match(/<noscript>([^<]+)<\/noscript>/)[1];
    assert.ok(JAPANESE.test(body), body);
    assert.match(body, /JavaScript to be enabled/);
});

test('HTMLに残る和文は、JSが描き直す箇所と noscript だけ', () => {
    let stripped = html.replace(/<!--[\s\S]*?-->/g, '');
    for (let previous = ''; previous !== stripped;) {
        previous = stripped;
        stripped = stripped.replace(/<(\w+)[^>]*\sdata-i18n="[^"]+"[^>]*>[\s\S]*?<\/\1\s*>/g, '');
    }
    const left = stripped.replace(/<[^>]*>/g, '\n').split('\n')
        .map(line => line.trim()).filter(line => JAPANESE.test(line));
    assert.deepEqual(left, [
        'OSMインフラ可視化ツール',
        'このツールを利用するにはJavaScriptを有効にしてください。 / This tool needs JavaScript to be enabled.',
        '🔍 移動',
        '🔍 検索',
        '詳細範囲',
        'どの形式で出力しますか？',
        '検索結果がありません'
    ]);
});

test('READMEは日英を相互にリンクし、英語版が辞書と一致する', () => {
    const readme = read('README.md');
    const english = read('README.en.md');
    assert.match(readme, /^\[English\]\(README\.en\.md\) · 日本語$/m);
    assert.match(english, /^English · \[日本語\]\(README\.md\)$/m);
    const section = english.split('## 🗂️ Infrastructure objects')[1].split('## 📖')[0];
    const headings = [...section.matchAll(/^### (.+)$/gm)].map(m => m[1].trim());
    assert.deepEqual(headings, CATEGORIES.map(category => I18n.en[category.titleKey]));
    const rows = [...section.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)]
        .filter(m => m[2].includes('`')).map(m => m[1].trim());
    assert.deepEqual(rows, OBJECT_TYPES.map(type => I18n.en[type.labelKey]));
});
