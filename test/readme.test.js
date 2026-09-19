const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CATEGORIES, OBJECT_TYPES } = require('../osm-logic.js');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const readme = read('README.md');
const html = read('index.html');

test('READMEの6つの種別表は定義と21行すべて一致', () => {
    const section = readme.split('## 🗂️ 対応インフラオブジェクト')[1].split('## 📖')[0];
    const headings = [...section.matchAll(/^### (.+)$/gm)].map(m => m[1].trim());
    assert.deepEqual(headings, CATEGORIES.map(c => c.title));
    const rows = [...section.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)]
        .filter(m => m[2].includes('`')).map(m => ({
            label: m[1].trim(), tags: [...m[2].matchAll(/`([^`]+)`/g)].map(t => t[1])
        }));
    assert.equal(rows.length, 21);
    assert.deepEqual(rows, OBJECT_TYPES.map(type => ({ label: type.label, tags: type.tags.map(t => t.join('=')) })));
});

test('SRI・タイルURL・referrerが実装と一致', () => {
    const hashes = [...html.matchAll(/integrity="([^"]+)"/g)].map(m => m[1]);
    assert.equal(hashes.length, 5);
    for (const hash of hashes) assert.ok(readme.includes('`' + hash + '`'), hash);
    const urls = [...read('script.js').matchAll(/https:\/\/tile\.openstreetmap\.org\/[^']+/g)].map(m => m[0]);
    assert.equal(urls.length, 1);
    assert.ok(readme.includes('`' + urls[0] + '`'));
    const referrer = html.match(/name="referrer" content="([^"]+)"/)[1];
    assert.equal(referrer, 'strict-origin-when-cross-origin');
    assert.ok(readme.includes('`' + referrer + '`'));
});

test('画像・ライセンス・シリーズ情報の参照が存在', () => {
    const images = [...readme.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map(m => m[1]).filter(p => !/^https?:/.test(p));
    assert.equal(images.length, 4);
    for (const file of images) assert.ok(fs.existsSync(path.join(root, file)), file);
    assert.ok(fs.existsSync(path.join(root, 'LICENSE')));
    assert.ok(readme.includes('Day011 - 生成AIで作るセキュリティツール100'));
    assert.ok(readme.includes('https://akademeia.info/?page_id=42163'));
});

test('ディレクトリー構造は実在ファイルを指す', () => {
    const tree = readme.split('## 📁 ディレクトリー構造')[1].split('## 💻')[0];
    const lines = tree.split('\n').filter(line => /[├└]──/.test(line));
    assert.ok(lines.length >= 20);
    let folder = '';
    for (const line of lines) {
        const nested = line.startsWith('│');
        const name = line.split(/[├└]── /)[1].split(/\s+#/)[0].trim();
        if (!nested) folder = name.endsWith('/') ? name : '';
        const relative = (nested ? folder : '') + name;
        assert.ok(fs.existsSync(path.join(root, relative)), relative);
    }
});

test('YAMLコメント・ブロック形式・固定キーとキー順を維持', () => {
    const match = readme.match(/^<!--\r?\n---\r?\n([\s\S]*?)\r?\n---\r?\n-->/);
    assert.ok(match);
    const yaml = match[1];
    for (const key of ['category_ja', 'category_en', 'tags']) {
        assert.match(yaml, new RegExp('^' + key + ':\\r?\\n  - ', 'm'));
    }
    const keys = [...yaml.matchAll(/^(\w+):/gm)].map(m => m[1]);
    assert.deepEqual(keys, ['id', 'slug', 'title', 'subtitle_ja', 'subtitle_en', 'description_ja', 'description_en',
        'category_ja', 'category_en', 'difficulty', 'tags', 'repo_url', 'demo_url', 'hub']);
    for (const line of [
        'id: day011', 'slug: osm-infra-viewer', 'title: "OSM Infrastructure Viewer"', 'difficulty: 1',
        'repo_url: "https://github.com/ipusiron/osm-infra-viewer"',
        'demo_url: "https://ipusiron.github.io/osm-infra-viewer/"', 'hub: true'
    ]) assert.ok(yaml.split(/\r?\n/).includes(line), line);
    assert.match(yaml, /category_ja:\r?\n  - OSINT\r?\n  - 地理情報/);
    assert.match(yaml, /category_en:\r?\n  - OSINT\r?\n  - Geospatial/);
    assert.match(yaml, /tags:\r?\n  - OpenStreetMap\r?\n  - Leaflet\r?\n  - OSINT\r?\n  - GIS\r?\n  - Geolocation\r?\n  - Infrastructure/);
});
