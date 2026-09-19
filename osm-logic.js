// DOM・地図・通信に依存しない、検索結果の変換処理。
const OsmInfraLogic = (() => {
    const CATEGORIES = [
        { id: 'security', title: '🔒 監視・セキュリティ' },
        { id: 'network', title: '📡 通信・ネットワーク' },
        { id: 'power', title: '⚡ 電力・エネルギー' },
        { id: 'transport', title: '🚦 交通・輸送' },
        { id: 'misc', title: '🏢 その他のインフラ' },
        { id: 'facility', title: '🏛️ 施設・サービス' }
    ];
    const OBJECT_TYPES = [
        ['surveillance', 'security', '📹', 'CCTVカメラ', [['man_made', 'surveillance']]],
        ['police', 'security', '🚓', '警察関連施設', [['amenity', 'police']]],
        ['emergency', 'security', '🆘', '緊急電話', [['emergency', 'phone']]],
        ['tower', 'network', '📡', '通信塔・タワー', [['man_made', 'communications_tower'], ['man_made', 'tower']]],
        ['wifi', 'network', '📶', 'Wi-Fiホットスポット', [['internet_access', 'wlan']]],
        ['antenna', 'network', '📻', 'アンテナ・マスト', [['man_made', 'mast'], ['man_made', 'antenna']]],
        ['substation', 'power', '⚡', '変電所', [['power', 'substation']]],
        ['power_pole', 'power', '🗼', '電柱・鉄塔', [['power', 'pole'], ['power', 'tower']]],
        ['generator', 'power', '🔋', '発電設備', [['power', 'generator']]],
        ['traffic_signals', 'transport', '🚦', '信号機', [['highway', 'traffic_signals']]],
        ['speed_camera', 'transport', '📸', '速度違反取締カメラ', [['highway', 'speed_camera']]],
        ['fuel_station', 'transport', '⛽', 'ガソリンスタンド', [['amenity', 'fuel']]],
        ['atm', 'misc', '🏧', 'ATM', [['amenity', 'atm']]],
        ['post_box', 'misc', '📮', '郵便ポスト', [['amenity', 'post_box']]],
        ['waste_disposal', 'misc', '🗑️', 'ゴミ集積所', [['amenity', 'waste_disposal']]],
        ['bank', 'facility', '🏦', '銀行', [['amenity', 'bank']]],
        ['hospital', 'facility', '🏥', '病院', [['amenity', 'hospital']]],
        ['school', 'facility', '🏫', '学校', [['amenity', 'school']]],
        ['restaurant', 'facility', '🍽️', 'レストラン', [['amenity', 'restaurant']]],
        ['shop', 'facility', '🛒', 'ショップ', [['shop', 'supermarket'], ['shop', 'convenience']]],
        ['parking', 'facility', '🅿️', '駐車場', [['amenity', 'parking']]]
    ].map(([id, category, icon, label, tags]) => ({ id, category, icon, label, tags }));
    const OTHER = { id: 'other', category: 'other', icon: '📍', label: 'その他' };
    const typeOf = id => OBJECT_TYPES.find(type => type.id === id) || OTHER;

    function normalizeBbox(bbox) {
        const result = {};
        for (const key of ['south', 'west', 'north', 'east']) {
            const value = bbox?.[key];
            if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('Invalid bounds');
            const limit = key === 'south' || key === 'north' ? 90 : 180;
            result[key] = Math.max(-limit, Math.min(limit, value));
        }
        return result;
    }

    function buildOverpassQuery(selectedIds, bbox) {
        const selected = OBJECT_TYPES.filter(type => selectedIds?.includes(type.id));
        if (!selected.length) return null;
        const { south, west, north, east } = normalizeBbox(bbox);
        const lines = selected.flatMap(type => type.tags.map(([key, value]) =>
            `  nwr["${key}"="${value}"](${south},${west},${north},${east});`));
        return `[out:json][timeout:15];\n(\n${lines.join('\n')}\n);\nout center meta;`;
    }

    function classify(tags, selectedIds) {
        const matches = type => type.tags.some(([key, value]) => tags?.[key] === value);
        return (OBJECT_TYPES.find(type => selectedIds?.includes(type.id) && matches(type))
            || OBJECT_TYPES.find(matches) || OTHER).id;
    }

    function elementLatLon(element) {
        for (const point of [element, element?.center]) {
            if (typeof point?.lat === 'number' && Number.isFinite(point.lat)
                && typeof point?.lon === 'number' && Number.isFinite(point.lon)) {
                return { lat: point.lat, lon: point.lon };
            }
        }
        return null;
    }

    function parseCoordinates(text) {
        const match = String(text).normalize('NFKC').trim().match(/^(-?\d+(?:\.\d*)?)\s*,\s*(-?\d+(?:\.\d*)?)$/);
        if (!match) return { ok: false, reason: 'not_coordinates' };
        const [lat, lng] = match.slice(1).map(Number);
        if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, reason: 'out_of_range' };
        return { ok: true, lat, lng };
    }

    function buildNominatimUrl(query) {
        return `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
    }

    function zoomCategory(zoom) {
        if (zoom >= 13) return { key: 'detail', label: '詳細範囲', level: 'ok' };
        if (zoom >= 10) return { key: 'medium', label: '中範囲', level: 'ok' };
        if (zoom >= 7) return { key: 'wide', label: '広範囲（時間要注意）', level: 'warning' };
        return { key: 'huge', label: '超広範囲（時間かかる）', level: 'ng' };
    }

    function interpretOverpassResponse(status, contentType, bodyText) {
        const empty = kind => ({ kind, elements: [], remark: '' });
        if (status === 429) return empty('rate_limited');
        if (status === 504) return empty('busy');
        if (status < 200 || status >= 300) return { ...empty('http_error'), status };
        // JSONを返すプロキシのContent-Typeの揺れにも対応し、本文の構造で検証する。
        let data;
        try { data = JSON.parse(bodyText); } catch { return empty('bad_format'); }
        if (!Array.isArray(data?.elements)) return empty('bad_format');
        const remark = typeof data.remark === 'string' ? data.remark : '';
        const kind = remark.trim() ? (/timed out/i.test(remark) ? 'timeout' : 'remark') : 'ok';
        return { kind, elements: data.elements, remark };
    }

    function osmRef(element) {
        return ['node', 'way', 'relation'].includes(element?.type)
            && Number.isSafeInteger(element.id) && element.id > 0 ? `${element.type}/${element.id}` : null;
    }

    function formatDate(timestamp) {
        return typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(timestamp) ? timestamp.slice(0, 10) : '不明';
    }

    function buildPopupModel(element, selectedIds) {
        const tags = element?.tags || {};
        const type = typeOf(classify(tags, selectedIds));
        const sections = [];
        const addTags = (heading, keys) => {
            const items = keys.filter(([key]) => tags[key] != null && tags[key] !== '')
                .map(([key, label]) => ({ label, value: String(tags[key]) }));
            if (items.length) sections.push({ heading, items });
        };
        addTags('📋 基本情報', [['name', '名称'], ['operator', '運営者'], ['brand', 'ブランド']]);
        addTags('🔎 詳細', [
            ['surveillance:type', '監視の種類'], ['surveillance', '監視対象'], ['surveillance:zone', '監視区域'],
            ['camera:type', 'カメラ形式'], ['camera:mount', '設置方法'], ['tower:type', '塔の種類'],
            ['height', '高さ'], ['generator:source', '発電方式'], ['generator:output:electricity', '発電出力'],
            ['internet_access:fee', 'Wi-Fi料金'], ['internet_access:ssid', 'SSID'], ['opening_hours', '営業時間']
        ]);
        const address = tags.address || ['addr:state', 'addr:city', 'addr:suburb', 'addr:street', 'addr:housenumber']
            .map(key => tags[key] || '').join('');
        const items = [];
        if (address) items.push({ label: '住所', value: String(address) });
        if (tags['addr:postcode']) items.push({ label: '郵便番号', value: `〒${tags['addr:postcode']}` });
        const point = elementLatLon(element);
        if (point) items.push({ label: '座標', value: `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}` });
        sections.push({ heading: address ? '📍 住所・位置情報' : '📍 位置情報', items });
        const ref = osmRef(element);
        sections.push({ heading: '🗺️ システム情報', items: [
            { label: 'OSM ID', value: ref || '不明' }, { label: '最終更新', value: formatDate(element?.timestamp) }
        ] });
        const links = [];
        if (ref) links.push({ label: '📍 OSMで見る', url: `https://www.openstreetmap.org/${ref}` });
        if (point) {
            const coordinate = `${point.lat},${point.lon}`;
            links.push({ label: '🗺️ Google Maps', url: `https://www.google.com/maps/search/?api=1&query=${coordinate}` });
            links.push({ label: '👁️ Street View', url: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coordinate}` });
        }
        return { typeId: type.id, icon: type.icon, label: type.label, sections, links };
    }

    function buildSummary(elements, selectedIds) {
        const counts = {};
        let skipped = 0;
        for (const element of elements) {
            if (!elementLatLon(element)) { skipped++; continue; }
            const id = classify(element?.tags, selectedIds);
            counts[id] = (counts[id] || 0) + 1;
        }
        return {
            total: elements.length - skipped, skipped, other: counts.other || 0,
            categories: CATEGORIES.map(category => ({ ...category,
                items: OBJECT_TYPES.filter(type => type.category === category.id)
                    .map(({ id, icon, label }) => ({ id, icon, label, count: counts[id] || 0 }))
            }))
        };
    }

    function toGeoJSON(elements, selectedIds, exportedAtIso) {
        const features = elements.filter(elementLatLon).map(element => {
            const { lat, lon } = elementLatLon(element);
            const type = typeOf(classify(element?.tags, selectedIds));
            const properties = { infraType: type.id, infraLabel: type.label };
            for (const key of ['name', 'operator', 'address', 'addr:street', 'addr:city', 'addr:postcode', 'fee',
                'internet_access:fee', 'opening_hours', 'phone', 'website', 'height', 'surveillance:type']) {
                properties[key] = element?.tags?.[key] ?? '';
            }
            Object.assign(properties, { osmId: osmRef(element) || '', exportedAt: exportedAtIso, source: 'OpenStreetMap' });
            return { type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties };
        });
        return { type: 'FeatureCollection', features, metadata: {
            title: 'OSM Infrastructure Data', description: 'Infrastructure objects from OpenStreetMap',
            generator: 'OSM Infrastructure Viewer by IPUSIRON', attribution: '© OpenStreetMap contributors',
            license: 'ODbL 1.0', licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
            exportedAt: exportedAtIso, count: features.length
        } };
    }

    function escapeXml(text) {
        const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
        return String(text).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, char => entities[char]);
    }

    function toKML(elements, selectedIds) {
        const placemarks = elements.filter(elementLatLon).map(element => {
            const { lat, lon } = elementLatLon(element);
            const type = typeOf(classify(element?.tags, selectedIds));
            const name = element?.tags?.name ? `${type.label}: ${element.tags.name}` : type.label;
            return [
                '    <Placemark>', `      <name>${escapeXml(name)}</name>`, '      <ExtendedData>',
                `        <Data name="infraType"><value>${escapeXml(type.id)}</value></Data>`,
                `        <Data name="osmId"><value>${escapeXml(osmRef(element) || '')}</value></Data>`,
                '      </ExtendedData>', '      <Point>', `        <coordinates>${escapeXml(`${lon},${lat},0`)}</coordinates>`,
                '      </Point>', '    </Placemark>'
            ].join('\n');
        });
        return ['<?xml version="1.0" encoding="UTF-8"?>', '<kml xmlns="http://www.opengis.net/kml/2.2">',
            '  <Document>', '    <name>OSM Infrastructure Data</name>',
            '    <description>© OpenStreetMap contributors (ODbL 1.0) https://opendatacommons.org/licenses/odbl/1-0/</description>',
            ...placemarks, '  </Document>', '</kml>'].join('\n');
    }

    function exportFileName(date, ext) {
        return `osm-infrastructure-${date.toISOString().slice(0, 19).replace(/[:.]/g, '-')}.${ext}`;
    }

    return { CATEGORIES, OBJECT_TYPES, normalizeBbox, buildOverpassQuery, classify, elementLatLon, parseCoordinates,
        buildNominatimUrl, zoomCategory, interpretOverpassResponse, osmRef, formatDate, buildPopupModel, buildSummary,
        toGeoJSON, escapeXml, toKML, exportFileName };
})();
globalThis.OsmInfraLogic = OsmInfraLogic;
if (typeof module === 'object' && module.exports) module.exports = OsmInfraLogic;
