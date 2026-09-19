const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('可読性を保つ行長と主要ファイルの行数', () => {
    const names = ['script.js', 'osm-logic.js', 'style.css', 'index.html',
        ...fs.readdirSync(__dirname).filter(name => name.endsWith('.js')).map(name => 'test/' + name)];
    for (const name of names) {
        const lines = fs.readFileSync(path.join(root, name), 'utf8').split(/\r?\n/);
        const maximum = name === 'index.html' ? 250 : 160;
        lines.forEach((line, index) => {
            if (name === 'index.html' && line.includes('integrity=')) return;
            assert.ok(line.length <= maximum, name + ':' + (index + 1) + ' is ' + line.length);
        });
    }
    for (const [name, minimum] of [['style.css', 400], ['script.js', 350], ['osm-logic.js', 150]]) {
        assert.ok(fs.readFileSync(path.join(root, name), 'utf8').split('\n').length >= minimum, name);
    }
});
