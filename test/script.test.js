const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');

test('画面処理に危険な描画と古いAPIが残っていない', () => {
    const script = read('script.js');
    for (const pattern of [/innerHTML/, /insertAdjacentHTML/, /document\.write/, /alert\(/, /keypress/,
        /circleMarker/, /window\.lastSearchData/, /\{s\}\.tile/, /style\.display\s*=/]) assert.doesNotMatch(script, pattern);
    assert.ok(script.includes('https://tile.openstreetmap.org/{z}/{x}/{y}.png'));
    assert.ok(script.includes('https://www.openstreetmap.org/copyright'));
    assert.match(script, /AbortController/);
    assert.match(script, /clearTimeout/);
    assert.match(script, /45000/);
});

test('純粋ロジックがDOM・通信・現在時刻に依存しない', () => {
    const logic = read('osm-logic.js');
    for (const pattern of [/document/, /window\./, /fetch\(/, /\bL\./, /Date\.now/, /new Date\(/]) {
        assert.doesNotMatch(logic, pattern);
    }
    const pkg = JSON.parse(read('package.json'));
    assert.deepEqual(pkg, { name: 'osm-infra-viewer', private: true, scripts: { test: 'node --test' } });
    const workflow = read('.github/workflows/test.yml');
    assert.match(workflow, /push, pull_request/);
    assert.match(workflow, /node-version: 22/);
    assert.match(workflow, /contents: read/);
    assert.match(workflow, /npm test/);
});
