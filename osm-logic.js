// DOM・地図・通信に依存しない、検索結果の変換処理。
const OsmInfraLogic = (() => {
    // 表示する文言はi18n.jsが持つ。ここではキー（labelKey・titleKey）だけを扱う。
    const CATEGORIES = ['security', 'network', 'power', 'transport', 'misc', 'facility']
        .map(id => ({ id, titleKey: 'category.' + id }));
    const OBJECT_TYPES = [
        ['surveillance', 'security', '📹', [['man_made', 'surveillance']]],
        ['police', 'security', '🚓', [['amenity', 'police']]],
        ['emergency', 'security', '🆘', [['emergency', 'phone']]],
        ['tower', 'network', '📡', [['man_made', 'communications_tower'], ['man_made', 'tower']]],
        ['wifi', 'network', '📶', [['internet_access', 'wlan']]],
        ['antenna', 'network', '📻', [['man_made', 'mast'], ['man_made', 'antenna']]],
        ['substation', 'power', '⚡', [['power', 'substation']]],
        ['power_pole', 'power', '🗼', [['power', 'pole'], ['power', 'tower']]],
        ['generator', 'power', '🔋', [['power', 'generator']]],
        ['traffic_signals', 'transport', '🚦', [['highway', 'traffic_signals']]],
        ['speed_camera', 'transport', '📸', [['highway', 'speed_camera']]],
        ['fuel_station', 'transport', '⛽', [['amenity', 'fuel']]],
        ['atm', 'misc', '🏧', [['amenity', 'atm']]],
        ['post_box', 'misc', '📮', [['amenity', 'post_box']]],
        ['waste_disposal', 'misc', '🗑️', [['amenity', 'waste_disposal']]],
        ['bank', 'facility', '🏦', [['amenity', 'bank']]],
        ['hospital', 'facility', '🏥', [['amenity', 'hospital']]],
        ['school', 'facility', '🏫', [['amenity', 'school']]],
        ['restaurant', 'facility', '🍽️', [['amenity', 'restaurant']]],
        ['shop', 'facility', '🛒', [['shop', 'supermarket'], ['shop', 'convenience']]],
        ['parking', 'facility', '🅿️', [['amenity', 'parking']]]
    ].map(([id, category, icon, tags]) => ({ id, category, icon, labelKey: 'type.' + id, tags }));
    const OTHER = { id: 'other', category: 'other', icon: '📍', labelKey: 'type.other' };
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
        if (zoom >= 13) return { key: 'detail', level: 'ok' };
        if (zoom >= 10) return { key: 'medium', level: 'ok' };
        if (zoom >= 7) return { key: 'wide', level: 'warning' };
        return { key: 'huge', level: 'ng' };
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

    // 日付が読めないときはnullを返し、表示側がpopup.unknownに訳す。
    function formatDate(timestamp) {
        return typeof timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(timestamp) ? timestamp.slice(0, 10) : null;
    }

    function buildPopupModel(element, selectedIds) {
        const tags = element?.tags || {};
        const type = typeOf(classify(tags, selectedIds));
        const sections = [];
        const addTags = (headingKey, keys) => {
            const items = keys.filter(([key]) => tags[key] != null && tags[key] !== '')
                .map(([key, labelKey]) => ({ labelKey, value: String(tags[key]) }));
            if (items.length) sections.push({ headingKey, items });
        };
        addTags('popup.section.basic', [
            ['name', 'popup.name'], ['operator', 'popup.operator'], ['brand', 'popup.brand']
        ]);
        addTags('popup.section.detail', [
            ['surveillance:type', 'popup.surveillanceType'], ['surveillance', 'popup.surveillance'],
            ['surveillance:zone', 'popup.surveillanceZone'], ['camera:type', 'popup.cameraType'],
            ['camera:mount', 'popup.cameraMount'], ['tower:type', 'popup.towerType'],
            ['height', 'popup.height'], ['generator:source', 'popup.generatorSource'],
            ['generator:output:electricity', 'popup.generatorOutput'],
            ['internet_access:fee', 'popup.wifiFee'], ['internet_access:ssid', 'popup.ssid'],
            ['opening_hours', 'popup.openingHours']
        ]);
        const address = tags.address || ['addr:state', 'addr:city', 'addr:suburb', 'addr:street', 'addr:housenumber']
            .map(key => tags[key] || '').join('');
        const items = [];
        if (address) items.push({ labelKey: 'popup.address', value: String(address) });
        if (tags['addr:postcode']) {
            items.push({ labelKey: 'popup.postcode', valueKey: 'popup.postcodeValue',
                values: { code: String(tags['addr:postcode']) } });
        }
        const point = elementLatLon(element);
        if (point) {
            items.push({ labelKey: 'popup.coordinates',
                value: `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}` });
        }
        sections.push({ headingKey: address ? 'popup.section.location' : 'popup.section.position', items });
        const ref = osmRef(element);
        const date = formatDate(element?.timestamp);
        sections.push({ headingKey: 'popup.section.system', items: [
            ref ? { labelKey: 'popup.osmId', value: ref } : { labelKey: 'popup.osmId', valueKey: 'popup.unknown' },
            date ? { labelKey: 'popup.lastUpdate', value: date }
                : { labelKey: 'popup.lastUpdate', valueKey: 'popup.unknown' }
        ] });
        const links = [];
        if (ref) links.push({ labelKey: 'popup.link.osm', url: `https://www.openstreetmap.org/${ref}` });
        if (point) {
            const coordinate = `${point.lat},${point.lon}`;
            links.push({ labelKey: 'popup.link.gmaps',
                url: `https://www.google.com/maps/search/?api=1&query=${coordinate}` });
            links.push({ labelKey: 'popup.link.streetview',
                url: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coordinate}` });
        }
        return { typeId: type.id, icon: type.icon, labelKey: type.labelKey, sections, links };
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
                    .map(({ id, icon, labelKey }) => ({ id, icon, labelKey, count: counts[id] || 0 }))
            }))
        };
    }

    // labelsは種別IDから表示名への対応表。表示中の言語の文言を画面側から渡す。
    const labelOf = (labels, type) => {
        const label = labels?.[type.id];
        return typeof label === 'string' && label ? label : type.id;
    };

    function toGeoJSON(elements, selectedIds, exportedAtIso, labels) {
        const features = elements.filter(elementLatLon).map(element => {
            const { lat, lon } = elementLatLon(element);
            const type = typeOf(classify(element?.tags, selectedIds));
            const properties = { infraType: type.id, infraLabel: labelOf(labels, type) };
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

    function toKML(elements, selectedIds, labels) {
        const placemarks = elements.filter(elementLatLon).map(element => {
            const { lat, lon } = elementLatLon(element);
            const type = typeOf(classify(element?.tags, selectedIds));
            const label = labelOf(labels, type);
            const name = element?.tags?.name ? `${label}: ${element.tags.name}` : label;
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
