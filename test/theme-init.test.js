const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'theme-init.js'), 'utf8');

// theme-init.jsを、保存値とOS設定を差し替えた仮のwindowで動かし、<html>のdata-themeを返す。
function run({ saved = null, prefersDark = false, storageThrows = false } = {}) {
    const attrs = {};
    const window = {
        localStorage: { getItem: () => { if (storageThrows) throw new Error('blocked'); return saved; } },
        matchMedia: () => ({ matches: prefersDark }),
        document: { documentElement: { setAttribute: (name, value) => { attrs[name] = value; } } }
    };
    vm.runInNewContext(source, { window });
    return attrs['data-theme'];
}

test('保存値がなければOSの設定に従う', () => {
    assert.equal(run({ prefersDark: true }), 'dark');
    assert.equal(run({ prefersDark: false }), 'light');
});

test('保存値はOSの設定より優先する', () => {
    assert.equal(run({ saved: 'light', prefersDark: true }), 'light');
    assert.equal(run({ saved: 'dark', prefersDark: false }), 'dark');
});

test('想定外の保存値は無視してOSの設定に従う', () => {
    assert.equal(run({ saved: 'blue', prefersDark: true }), 'dark');
    assert.equal(run({ saved: 'blue', prefersDark: false }), 'light');
});

test('localStorageが使えなくても落ちず、OSの設定に従う', () => {
    assert.equal(run({ storageThrows: true, prefersDark: false }), 'light');
    assert.equal(run({ storageThrows: true, prefersDark: true }), 'dark');
});

test('index.htmlの<head>で、style.cssのあとに同期で読み込む', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const head = html.slice(0, html.indexOf('</head>'));
    assert.ok(head.includes('<script src="theme-init.js"></script>'), '<head>にtheme-init.jsがない');
    assert.ok(head.indexOf('href="style.css"') < head.indexOf('theme-init.js'));
});
