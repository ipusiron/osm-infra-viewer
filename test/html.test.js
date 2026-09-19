const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CATEGORIES, OBJECT_TYPES } = require('../osm-logic.js');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const attr = (tag, name) => tag.match(new RegExp(name + '="([^"]*)"'))?.[1];
const tags = name => [...html.matchAll(new RegExp('<' + name + '\\b[^>]*>', 'g'))].map(m => m[0]);
const byId = id => tags('[a-z][a-z0-9]*').find(tag => attr(tag, 'id') === id);
const sri = [
    ['leaflet/1.9.4/leaflet.css', 'sha512-Zcn6bjR/8RZbLEpLIeOwNtzREBAJnUKESxces60Mpoj+2okopSAcSUIUOseddDm0cxnGQzxIR7vJgsLZbdLE3w=='],
    ['leaflet/1.9.4/leaflet.min.js', 'sha512-puJW3E/qXDqYp9IfhAI54BJEaWIfloJ7JWs7OeD5i6ruC9JZL1gERT1wjtwXFlh7CjE7ZJ+/vcRZRkIYIb6p4g=='],
    ['leaflet.markercluster/1.5.3/MarkerCluster.css',
        'sha512-mQ77VzAakzdpWdgfL/lM1ksNy89uFgibRQANsNneSTMD/bj0Y/8+94XMwYhnbzx8eki2hrbPpDm0vD0CiT2lcg=='],
    ['leaflet.markercluster/1.5.3/MarkerCluster.Default.css',
        'sha512-6ZCLMiYwTeli2rVh3XAPxy3YoR5fVxGdH/pz+KMCzRY2M65Emgkw00Yqmhh8qLGeYQ3LbVZGdmOX9KUjSKr0TA=='],
    ['leaflet.markercluster/1.5.3/leaflet.markercluster.min.js',
        'sha512-TiMWaqipFi2Vqt4ugRzsF8oRoGFlFFuqIi30FFxEPNw58Ov9mOy6LgC05ysfkxwLE0xVeZtmr92wVg9siAFRWA==']
];

test('CSP・Referer・SRI・古典スクリプトの順番', () => {
    assert.ok(tags('meta').some(t => attr(t, 'name') === 'viewport'));
    const csp = attr(tags('meta').find(t => attr(t, 'http-equiv') === 'Content-Security-Policy'), 'content');
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|frame-ancestors/);
    for (const directive of ["default-src 'self'", "script-src 'self' https://cdnjs.cloudflare.com",
        "style-src 'self' https://cdnjs.cloudflare.com", "img-src 'self' data: https://tile.openstreetmap.org",
        'connect-src https://overpass-api.de https://nominatim.openstreetmap.org',
        "object-src 'none'", "base-uri 'self'", "form-action 'self'"]) assert.ok(csp.includes(directive));
    // OSMタイル利用規約が有効なRefererを求めるため、no-referrerにしてはいけない。
    assert.equal(attr(tags('meta').find(t => attr(t, 'name') === 'referrer'), 'content'), 'strict-origin-when-cross-origin');
    assert.doesNotMatch(html, /no-referrer/);
    const resources = [...tags('script'), ...tags('link')];
    const external = resources.filter(t => /^https:/.test(attr(t, 'src') || attr(t, 'href') || ''));
    assert.equal(external.length, 5);
    for (const [file, hash] of sri) {
        const tag = external.find(t => (attr(t, 'src') || attr(t, 'href')) === 'https://cdnjs.cloudflare.com/ajax/libs/' + file);
        assert.ok(tag, file);
        assert.equal(attr(tag, 'integrity'), hash);
        assert.equal(attr(tag, 'crossorigin'), 'anonymous');
    }
    assert.deepEqual(tags('script').map(t => attr(t, 'src')), [
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.min.js',
        'osm-logic.js', 'script.js'
    ]);
    assert.doesNotMatch(html, /type="module"|\son\w+\s*=|\sstyle\s*=/i);
    assert.match(html, /<noscript>/);
    assert.ok(tags('link').some(t => attr(t, 'rel') === 'icon'));
});

test('カテゴリー・種別の表とチェックボックスが一致', () => {
    const inputs = tags('input').filter(t => attr(t, 'type') === 'checkbox');
    assert.equal(inputs.length, 21);
    assert.deepEqual(inputs.map(t => attr(t, 'id')), OBJECT_TYPES.map(t => t.id));
    assert.deepEqual(inputs.filter(t => /\bchecked\b/.test(t)).map(t => attr(t, 'id')), ['surveillance', 'wifi']);
    const labels = [...html.matchAll(/<label\b([^>]*)>([\s\S]*?)<\/label>/g)];
    for (const type of OBJECT_TYPES) {
        const label = labels.find(m => attr(m[1], 'for') === type.id);
        assert.ok(label, type.id);
        const text = label[2].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        assert.equal(text, type.icon + ' ' + type.label);
    }
    assert.equal(tags('fieldset').length, 6);
    assert.deepEqual([...html.matchAll(/<legend[^>]*>([^<]*)<\/legend>/g)].map(m => m[1]), CATEGORIES.map(c => c.title));
});

test('地図検索は補助ボタンの前に独立した主操作として配置', () => {
    assert.match(attr(byId('searchBtn'), 'class'), /\binfra-search-btn\b/);
    assert.match(html, /<div class="panel-actions">\s*<button[^>]*id="searchBtn"[^>]*>[^<]*<\/button>\s*<div class="buttons">/);
    const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
    const rule = css.match(/\.btn\.infra-search-btn\s*\{([^}]+)\}/)?.[1];
    assert.ok(rule);
    assert.match(rule, /width:\s*100%/);
    assert.match(rule, /min-height:\s*56px/);
    assert.match(rule, /font-weight:\s*700/);
});

test('ランドマーク・ダイアログ・読み上げ・見出し', () => {
    for (const id of ['locationInput', 'locationSearchBtn', 'searchBtn', 'selectAllBtn', 'selectNoneBtn', 'summaryBtn',
        'exportBtn', 'debugToggleBtn', 'themeToggle', 'status', 'map', 'zoomLevel', 'zoomStatus',
        'summaryContent', 'exportMessage', 'debugOutput']) assert.ok(byId(id), id);
    assert.equal(attr(byId('status'), 'role'), 'status');
    assert.equal(attr(byId('status'), 'aria-live'), 'polite');
    assert.equal(tags('dialog').length, 2);
    for (const id of ['exportDialog', 'summaryDialog']) {
        assert.ok(byId(id).startsWith('<dialog'));
        assert.ok(byId(attr(byId(id), 'aria-labelledby')));
    }
    for (const tag of ['main', 'header', 'footer']) assert.equal(tags(tag).length, 1);
    for (const tag of tags('a').filter(t => /^https:/.test(attr(t, 'href')))) {
        assert.equal(attr(tag, 'rel'), 'noopener noreferrer');
    }
    const levels = [...html.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]));
    assert.equal(levels[0], 1);
    for (let i = 1; i < levels.length; i++) assert.ok(levels[i] <= levels[i - 1] + 1);
});
