const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../osm-logic.js');
const fixture = require('./fixture.json');
const selected = ['surveillance', 'atm', 'restaurant', 'tower', 'hospital'];
const bbox = { south: 35.65, west: 139.69, north: 35.67, east: 139.71 };

test('A-1: 6カテゴリー、21種別、25タグ、重複なし', () => {
    assert.equal(L.CATEGORIES.length, 6);
    assert.equal(L.OBJECT_TYPES.length, 21);
    assert.equal(new Set(L.OBJECT_TYPES.map(type => type.id)).size, 21);
    assert.equal(L.OBJECT_TYPES.flatMap(type => type.tags).length, 25);
    assert.deepEqual(L.CATEGORIES.map(c => L.OBJECT_TYPES.filter(t => t.category === c.id).length), [3, 3, 3, 3, 3, 6]);
    for (const t of L.OBJECT_TYPES) assert.ok(L.CATEGORIES.some(c => t.category === c.id));
});

test('A-2: bboxの型検証とクランプ', () => {
    assert.deepEqual(L.normalizeBbox({ south: -100, west: -200, north: 100, east: 200 }),
        { south: -90, west: -180, north: 90, east: 180 });
    for (const key of Object.keys(bbox)) {
        for (const value of [NaN, '35', Infinity, undefined]) {
            assert.throws(() => L.normalizeBbox({ ...bbox, [key]: value }), RangeError);
        }
    }
});

test('A-3: クエリの厳密一致・固定順・許可リスト・relation対応', () => {
    const expected = '[out:json][timeout:15];\n(\n'
        + '  nwr["man_made"="surveillance"](35.65,139.69,35.67,139.71);\n'
        + '  nwr["internet_access"="wlan"](35.65,139.69,35.67,139.71);\n);\nout center meta;';
    assert.equal(L.buildOverpassQuery(['surveillance', 'wifi'], bbox), expected);
    assert.equal(L.buildOverpassQuery(['wifi', 'surveillance'], bbox), expected);
    const tower = L.buildOverpassQuery(['tower'], bbox);
    assert.equal((tower.match(/^  nwr\[/gm) || []).length, 2);
    assert.ok(tower.includes('nwr["man_made"="communications_tower"]'));
    assert.ok(tower.includes('nwr["man_made"="tower"]'));
    assert.equal(L.buildOverpassQuery([], bbox), null);
    assert.equal(L.buildOverpassQuery(['nope', '"];node(1);out;//'], bbox), null);
    const all = L.buildOverpassQuery(L.OBJECT_TYPES.map(t => t.id), bbox);
    assert.equal((all.match(/^  nwr\[/gm) || []).length, 25);
    assert.doesNotMatch(all, /node\[|way\[/);
    assert.ok(L.buildOverpassQuery(['atm'], { south: -100, west: -200, north: 100, east: 200 })
        .includes('nwr["amenity"="atm"](-90,-180,90,180);'));
});

test('A-4: 選択を優先して分類し、同率は定義順', () => {
    const cafe = { amenity: 'restaurant', internet_access: 'wlan' };
    for (const [ids, expected] of [
        [['restaurant'], 'restaurant'], [['wifi'], 'wifi'], [['wifi', 'restaurant'], 'wifi'],
        [['restaurant', 'wifi'], 'wifi'], [[], 'wifi'], [['atm'], 'wifi']
    ]) assert.equal(L.classify(cafe, ids), expected);
    assert.equal(L.classify({ amenity: 'fuel', atm: 'yes' }, ['atm']), 'fuel_station');
    for (const [tags, expected] of [
        [{ power: 'tower' }, 'power_pole'], [{ man_made: 'tower', 'tower:type': 'observation' }, 'tower'],
        [{ man_made: 'mast' }, 'antenna'], [{ shop: 'convenience' }, 'shop'], [{ shop: 'bakery' }, 'other']
    ]) assert.equal(L.classify(tags, []), expected);
    assert.equal(L.classify(undefined, undefined), 'other');
    for (const type of L.OBJECT_TYPES) {
        for (const [key, value] of type.tags) assert.equal(L.classify({ [key]: value }, []), type.id);
    }
});

test('A-5: 座標0を落とさず、不正値と座標なしは除外', () => {
    for (const point of [{ lat: 0, lon: 139.7 }, { lat: 35.6, lon: 0 }, { lat: 0, lon: 0 }]) {
        assert.deepEqual(L.elementLatLon(point), point);
        assert.deepEqual(L.elementLatLon({ center: point }), point);
    }
    assert.deepEqual(L.elementLatLon(fixture[3]), { lat: 35.661, lon: 139.701 });
    for (const element of [{ lat: '35.6', lon: '139.7' }, { type: 'relation', id: 1 }, { lat: NaN, lon: 1 }, null]) {
        assert.equal(L.elementLatLon(element), null);
    }
});

test('A-6: 座標入力・全角正規化・境界・地名への振り分け', () => {
    for (const input of ['35.6762,139.6503', '35.6762, 139.6503', ' 35.6762 , 139.6503 ', '３５.６７６２，１３９.６５０３']) {
        assert.deepEqual(L.parseCoordinates(input), { ok: true, lat: 35.6762, lng: 139.6503 });
    }
    for (const [input, lat, lng] of [
        ['-33.8688,151.2093', -33.8688, 151.2093], ['0,0', 0, 0], ['90,180', 90, 180],
        ['-90,-180', -90, -180], ['35.,139.', 35, 139]
    ]) assert.deepEqual(L.parseCoordinates(input), { ok: true, lat, lng });
    for (const input of ['91,0', '0,180.1']) {
        assert.deepEqual(L.parseCoordinates(input), { ok: false, reason: 'out_of_range' });
    }
    for (const input of ['35.6762、139.6503', '35.6762 139.6503', '渋谷駅', '', '1e3,5',
        '35.6762,139.6503,10', '+35.6,139.6', '.5,1']) {
        assert.deepEqual(L.parseCoordinates(input), { ok: false, reason: 'not_coordinates' });
    }
});

test('A-7・A-8: URLエンコードとズーム区分', () => {
    const prefix = 'https://nominatim.openstreetmap.org/search?format=json&q=';
    const suffix = '&limit=1&addressdetails=1';
    assert.equal(L.buildNominatimUrl('東京駅'), prefix + '%E6%9D%B1%E4%BA%AC%E9%A7%85' + suffix);
    assert.equal(L.buildNominatimUrl('a&b=c #'), prefix + 'a%26b%3Dc%20%23' + suffix);
    for (const [values, key, label, level] of [
        [[18, 13], 'detail', '詳細範囲', 'ok'], [[12.9, 10], 'medium', '中範囲', 'ok'],
        [[9.9, 7], 'wide', '広範囲（時間要注意）', 'warning'], [[6.9, 0], 'huge', '超広範囲（時間かかる）', 'ng']
    ]) for (const zoom of values) assert.deepEqual(L.zoomCategory(zoom), { key, label, level });
});

test('A-9: HTTP status、JSON構造、警告、途中の結果を区別', () => {
    const read = (body, status = 200, type = 'application/json') => L.interpretOverpassResponse(status, type, body);
    assert.deepEqual(read('{"elements":[{"type":"node","id":1}]}'),
        { kind: 'ok', elements: [{ type: 'node', id: 1 }], remark: '' });
    assert.deepEqual(read('{"elements":[]}'), { kind: 'ok', elements: [], remark: '' });
    const remark = 'runtime error: Query timed out in "bbox-query" at line 1 after 14 seconds.';
    for (const elements of [[], [{ type: 'node', id: 1 }]]) {
        assert.deepEqual(read(JSON.stringify({ version: 0.6, elements, remark })), { kind: 'timeout', elements, remark });
    }
    const memory = 'runtime error: Query run out of memory using about 2048 MB of RAM.';
    assert.deepEqual(read(JSON.stringify({ elements: [], remark: memory })), { kind: 'remark', elements: [], remark: memory });
    assert.equal(read('<html>', 429, 'text/html').kind, 'rate_limited');
    assert.equal(read('<p>Dispatcher_Client::request_read_and_idx::timeout. The server is probably too busy</p>',
        504, 'text/html; charset=utf-8').kind, 'busy');
    assert.equal(read('<html>', 400, 'text/html').status, 400);
    assert.equal(read('<html>', 400, 'text/html').kind, 'http_error');
    for (const input of ['<html>busy</html>', '{"version":0.6}', '{"elements":{}}', 'null']) {
        assert.equal(read(input).kind, 'bad_format');
    }
});

test('A-10・A-11: OSM参照の許可リストと日付', () => {
    assert.equal(L.osmRef({ type: 'relation', id: 123 }), 'relation/123');
    for (const id of [1.5, '1', 0, Number.MAX_SAFE_INTEGER + 1]) assert.equal(L.osmRef({ type: 'node', id }), null);
    for (const type of ['area', 'node"><img src=x onerror="window.__xss=1">']) assert.equal(L.osmRef({ type, id: 1 }), null);
    assert.equal(L.formatDate('2024-01-02T03:04:05Z'), '2024-01-02');
    for (const value of ['yesterday', undefined, 12345]) assert.equal(L.formatDate(value), '不明');
});

test('A-12: ポップアップモデルの順番・生テキスト・安全なリンク', () => {
    const bad = { type: 'node"><img src=x onerror="window.__xss=1">', id: 9, lat: 35.6, lon: 139.7, tags: { amenity: 'bank' } };
    const unsafe = L.buildPopupModel(bad);
    assert.equal(unsafe.label, '銀行');
    assert.equal(unsafe.links.length, 2);
    assert.equal(unsafe.sections.at(-1).items[0].value, '不明');
    assert.doesNotMatch(JSON.stringify(unsafe), /onerror/);
    const model = L.buildPopupModel(fixture[0], ['surveillance']);
    assert.equal(model.label, 'CCTVカメラ');
    assert.equal(model.sections[0].items[0].value, 'cam & <b>bold</b>');
    assert.deepEqual(model.sections[1], { heading: '🔎 詳細', items: [
        { label: '監視の種類', value: 'camera' }, { label: '監視対象', value: 'public' }, { label: 'カメラ形式', value: 'dome' }
    ] });
    assert.deepEqual(model.sections[2], { heading: '📍 住所・位置情報', items: [
        { label: '住所', value: '渋谷区道玄坂' }, { label: '郵便番号', value: '〒150-0043' },
        { label: '座標', value: '35.659500, 139.700600' }
    ] });
    assert.deepEqual(model.sections[3].items.map(i => i.value), ['node/1', '2024-01-02']);
    assert.equal(model.links.length, 3);
    assert.equal(model.links[0].url, 'https://www.openstreetmap.org/node/1');
    const zero = L.buildPopupModel(fixture[1]);
    assert.ok(zero.sections.flatMap(s => s.items).some(i => i.value === '0.000000, 139.700000'));
    assert.equal(zero.links[1].url, 'https://www.google.com/maps/search/?api=1&query=0,139.7');
});

test('A-13・A-14・A-18: サマリーとGeoJSONの件数・分類・帰属・個人情報除外', () => {
    const summary = L.buildSummary(fixture, selected);
    assert.deepEqual([summary.total, summary.skipped, summary.other], [6, 1, 1]);
    assert.deepEqual(summary.categories.flatMap(c => c.items).filter(i => i.count).map(i => [i.id, i.count]),
        [['surveillance', 1], ['tower', 1], ['atm', 2], ['restaurant', 1]]);
    const data = L.toGeoJSON(fixture, selected, '2026-09-19T12:03:03.456Z');
    assert.equal(data.features.length, 6);
    assert.equal(data.metadata.count, 6);
    assert.equal(data.metadata.license, 'ODbL 1.0');
    assert.equal(data.metadata.attribution, '© OpenStreetMap contributors');
    assert.equal(data.metadata.licenseUrl, 'https://opendatacommons.org/licenses/odbl/1-0/');
    assert.deepEqual(data.features.map(f => [f.properties.osmId, f.properties.infraType]), [
        ['node/1', 'surveillance'], ['node/2', 'atm'], ['node/3', 'atm'],
        ['way/4', 'restaurant'], ['node/5', 'tower'], ['node/7', 'other']
    ]);
    assert.deepEqual(data.features[1].geometry.coordinates, [139.7, 0]);
    for (const feature of data.features) {
        assert.equal(feature.properties.exportedAt, '2026-09-19T12:03:03.456Z');
        assert.equal(feature.properties.source, 'OpenStreetMap');
        assert.equal(Object.keys(feature.properties).length, 18);
    }
    assert.doesNotMatch(JSON.stringify(data), /someone|"uid"|"changeset"/);
});

test('A-15・A-16・A-17・A-18: XMLとファイル名の厳密一致', () => {
    assert.equal(L.escapeXml('A&B <Tower> "x" \'y\'\u0001'), 'A&amp;B &lt;Tower&gt; &quot;x&quot; &apos;y&apos;');
    const kml = L.toKML(fixture, selected);
    const expected = [
        '    <Placemark>', '      <name>通信塔・タワー: A&amp;B &lt;Tower&gt; &quot;x&quot; &apos;y&apos;</name>',
        '      <ExtendedData>', '        <Data name="infraType"><value>tower</value></Data>',
        '        <Data name="osmId"><value>node/5</value></Data>', '      </ExtendedData>',
        '      <Point>', '        <coordinates>139.702,35.662,0</coordinates>', '      </Point>', '    </Placemark>'
    ].join('\n');
    assert.ok(kml.includes(expected));
    assert.equal((kml.match(/<Placemark>/g) || []).length, 6);
    assert.doesNotMatch(kml, /<n>/);
    assert.ok(kml.includes('<name>ATM: equator</name>'));
    assert.ok(kml.includes('<coordinates>0,35.66,0</coordinates>'));
    assert.ok(kml.includes('<name>OSM Infrastructure Data</name>'));
    for (const ext of ['geojson', 'kml']) {
        const name = L.exportFileName(new Date('2026-09-19T12:03:03.456Z'), ext);
        assert.equal(name, 'osm-infrastructure-2026-09-19T12-03-03.' + ext);
        assert.ok(!name.includes(':'));
    }
});
