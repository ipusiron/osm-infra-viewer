const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
const tokens = text => Object.fromEntries([...text.matchAll(/--([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map(m => [m[1], m[2]]));
const light = tokens(css.match(/:root\s*\{([^}]+)\}/)[1]);
const auto = tokens(css.match(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]+)\}/)[1]);
const dark = tokens(css.match(/:root\[data-theme="dark"\]\s*\{([^}]+)\}/)[1]);
const pairs = [];
for (const fg of ['text', 'muted']) for (const bg of ['surface', 'surface-2', 'bg']) pairs.push([fg, bg, 4.5]);
for (const bg of ['bg', 'surface']) pairs.push(['link', bg, 4.5]);
for (const bg of ['header-a', 'header-b']) pairs.push(['header-fg', bg, 4.5]);
for (const bg of ['primary', 'info', 'success', 'danger', 'secondary']) pairs.push(['btn-fg', 'btn-' + bg, 4.5]);
pairs.push(['btn-disabled-fg', 'btn-disabled-bg', 4.5]);
for (const fg of ['ok', 'warning', 'ng']) pairs.push(['zoom-' + fg, 'surface', 4.5]);
for (const kind of ['loading', 'success', 'warning', 'error']) {
    pairs.push(['status-' + kind + '-fg', 'status-' + kind + '-bg', 4.5]);
}
pairs.push(['tooltip-fg', 'tooltip-bg', 4.5]);
for (const bg of ['surface', 'surface-2']) pairs.push(['input-border', bg, 3]);
for (const bg of ['surface', 'bg']) pairs.push(['focus', bg, 3]);
pairs.push(['marker-border', 'tile-ground', 3]);

function luminance(hex) {
    const channels = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
        .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

test('OS自動テーマと明示ダークは同じ値', () => {
    assert.equal(Object.keys(dark).length, 30);
    assert.deepEqual(auto, dark);
});

for (const [theme, values] of [['light', light], ['dark', { ...light, ...dark }]]) {
    for (const [fg, bg, minimum] of pairs) {
        test(theme + ': ' + fg + ' / ' + bg, () => {
            assert.ok(values[fg] && values[bg], 'CSSから色を取得できる');
            const a = luminance(values[fg]);
            const b = luminance(values[bg]);
            const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            assert.ok(ratio >= minimum, ratio.toFixed(4) + ' < ' + minimum);
        });
    }
}

module.exports = { light, dark, pairs, luminance };
