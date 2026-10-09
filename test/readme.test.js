const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { CATEGORIES, OBJECT_TYPES } = require('../osm-logic.js');
const I18n = require('../i18n.js');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const readme = read('README.md');
const html = read('index.html');

test('READMEの6つの種別表は定義と21行すべて一致', () => {
    const section = readme.split('## 🗂️ 対応インフラオブジェクト')[1].split('## 📖')[0];
    const headings = [...section.matchAll(/^### (.+)$/gm)].map(m => m[1].trim());
    assert.deepEqual(headings, CATEGORIES.map(c => I18n.ja[c.titleKey]));
    const rows = [...section.matchAll(/^\| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)]
        .filter(m => m[2].includes('`')).map(m => ({
            label: m[1].trim(), tags: [...m[2].matchAll(/`([^`]+)`/g)].map(t => t[1])
        }));
    assert.equal(rows.length, 21);
    assert.deepEqual(rows, OBJECT_TYPES.map(type =>
        ({ label: I18n.ja[type.labelKey], tags: type.tags.map(t => t.join('=')) })));
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
    const screenshots = fs.readdirSync(path.join(root, 'assets'))
        .filter(file => /^screenshot.*\.png$/.test(file)).map(file => 'assets/' + file);
    assert.deepEqual(screenshots.sort(), [...images].sort(), '参照されていない紹介画像を残さない');
    for (const file of screenshots) assert.ok(fs.statSync(path.join(root, file)).size <= 500 * 1024, file);
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

test('ユースケースの「このツールならではの使い方」の例は実ロジックと一致（日英）', () => {
    const L = require('../osm-logic.js');
    const en = read('README.en.md');
    const bbox = { south: 37.7, west: 140.9, north: 37.8, east: 141.0 };
    assert.ok(L.buildOverpassQuery(['wifi'], bbox).endsWith('out center meta;'));
    const wifi = { type: 'node', id: 123, lat: 37.75, lon: 140.95, timestamp: '2019-06-01T09:30:00Z',
        tags: { internet_access: 'wlan', 'internet_access:ssid': 'Sakura_Free' } };
    const model = L.buildPopupModel(wifi, ['wifi']);
    const items = model.sections.flatMap(s => s.items);
    const value = key => items.find(item => item.labelKey === key).value;
    assert.deepEqual([value('popup.ssid'), value('popup.lastUpdate')], ['Sakura_Free', '2019-06-01']);
    assert.equal(model.links[0].url, 'https://www.openstreetmap.org/node/123');
    assert.equal(I18n.ja['popup.link.osm'], '📍 OSMで見る');
    assert.ok(readme.includes('「📍 OSMで見る」') && en.includes('"' + I18n.en['popup.link.osm'] + '"'));
    for (const text of [readme, en]) assert.ok(text.includes('Sakura_Free') && text.includes('2019-06-01'));
    const hospital = { type: 'node', id: 7, lat: 37.79, lon: 140.92,
        tags: { amenity: 'hospital', name: 'さくら病院' } };
    const kml = L.toKML([hospital], ['hospital'], { hospital: I18n.ja['type.hospital'] });
    assert.ok(kml.includes('<name>病院: さくら病院</name>'));
    assert.ok(readme.includes('「病院: さくら病院」'));
    const kmlEn = L.toKML([{ ...hospital, tags: { amenity: 'hospital', name: 'Sakura Hospital' } }],
        ['hospital'], { hospital: I18n.en['type.hospital'] });
    assert.ok(kmlEn.includes('<name>Hospital: Sakura Hospital</name>'));
    assert.ok(en.includes('"Hospital: Sakura Hospital"'));
    assert.equal(L.OBJECT_TYPES.length, 21);
    assert.ok(!L.OBJECT_TYPES.some(t => t.tags.some(([k, v]) => v === 'shelter' || k === 'emergency' && v !== 'phone')));
});
