// OSMインフラ可視化ツール - JavaScript
(() => {
const logic = OsmInfraLogic;
const t = I18n.t;

// 文言の切り替えは地図より先に用意する。CDNが届かずLeafletが無い環境でも日英を選べる。
I18n.init();
document.getElementById('langToggle').addEventListener('click',
    () => I18n.setLanguage(I18n.language === 'ja' ? 'en' : 'ja'));

// 地図の初期化（初期ズーム14）
let map = L.map('map').setView([35.6762, 139.6503], 14);

// OpenStreetMapタイル追加
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// マーカークラスターグループ
// 30pxの絵文字マーカーが近接しても、ズーム18で個別に選びやすい間隔にする。
let markersGroup = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 50 }).addTo(map);

// ズーム変更時のイベントリスナー
map.on('zoomend moveend', updateZoomIndicator);

// 外部データは文字列としてDOMへ渡す
function createNode(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

// デバッグモード状態
let debugMode = false;

// 検索状態管理
let isSearching = false;
let isLocationSearching = false;
let lastLocationRequest = -Infinity;
let statusTimer;
let lastSearch = null;
// 表示中の通知・出力件数・マーカーは、文言ではなくキーと状態で覚える。
let lastStatus = null;
let exportCount = null;
let markerEntries = [];

// 差し込み値が {key, params} のときは、描画の直前に訳す。訳した文字列を保存しない。
function resolveValues(values) {
    const resolved = {};
    for (const [name, value] of Object.entries(values || {})) {
        resolved[name] = value && typeof value === 'object' && value.key ? t(value.key, value.params) : value;
    }
    return resolved;
}

// 場所検索機能
async function searchLocation() {
    if (isLocationSearching) return;
    const input = document.getElementById('locationInput').value.trim();
    if (!input) {
        showStatus('status.enterPlace', 'error');
        return;
    }
    const coordinates = logic.parseCoordinates(input);
    if (coordinates.ok) {
        map.setView([coordinates.lat, coordinates.lng], 15);
        showStatus('status.jumpedCoordinates', 'success');
        return;
    }
    if (coordinates.reason === 'out_of_range') {
        showStatus('status.outOfRange', 'error');
        return;
    }
    if (Date.now() - lastLocationRequest < 1000) {
        showStatus('status.tooFast', 'warning');
        return;
    }
    isLocationSearching = true;
    setLocationButtonLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
        showStatus('status.searchingPlace', 'loading');
        lastLocationRequest = Date.now();
        const response = await fetch(logic.buildNominatimUrl(input), { signal: controller.signal });
        if (!response.ok) throw new Error('status.nominatimUnavailable');
        const data = await response.json();
        if (!Array.isArray(data) || !data.length) throw new Error('status.noPlaceFound');
        const result = data[0];
        const lat = Number(result.lat);
        const lng = Number(result.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('status.badPlaceCoordinates');
        // Nominatimは地域の言語で国名を返すため、外部データとの照合として日本語のまま比較する。
        const isJapan = result.address && (result.address.country_code === 'jp' || result.address.country === '日本');
        map.setView([lat, lng], isJapan ? 15 : 12);
        showStatus('status.jumped', 'success', { place: result.display_name || lat + ', ' + lng });
    } catch (error) {
        showStatus(error.name === 'AbortError' ? 'status.placeNoResponse' : errorKey(error), 'error');
    } finally {
        clearTimeout(timer);
        isLocationSearching = false;
        setLocationButtonLoading(false);
    }
}

// 例外にはキーを載せている。想定外の例外は通信不能として扱う。
function errorKey(error) {
    const message = String(error && error.message);
    return message.startsWith('status.') ? message : 'status.nominatimUnavailable';
}

// Enterキーで検索実行
function setupLocationSearch() {
    const input = document.getElementById('locationInput');
    input.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            searchLocation();
        }
    });
}

// ズームレベル表示更新（制限撤廃、情報表示）
function updateZoomIndicator() {
    const currentZoom = map.getZoom();
    document.getElementById('zoomLevel').textContent = currentZoom.toFixed(1);
    const statusElement = document.getElementById('zoomStatus');
    const category = logic.zoomCategory(currentZoom);
    statusElement.textContent = t('zoom.' + category.key);
    statusElement.className = 'zoom-status zoom-' + category.level;
}

// ボタンの文言は定数で書き戻さず、dataset.stateから組み立てる
function setSearchButtonLoading(loading) {
    const searchBtn = document.getElementById('searchBtn');
    isSearching = loading;
    searchBtn.disabled = loading;
    searchBtn.classList.toggle('loading', loading);
    searchBtn.dataset.state = loading ? 'loading' : 'idle';
    renderSearchButton();
}

function renderSearchButton() {
    const searchBtn = document.getElementById('searchBtn');
    searchBtn.textContent = searchBtn.dataset.state === 'loading' ? t('search.searching') : t('actions.search');
}

function setLocationButtonLoading(loading) {
    const searchBtn = document.getElementById('locationSearchBtn');
    searchBtn.disabled = loading;
    searchBtn.dataset.state = loading ? 'loading' : 'idle';
    renderLocationButton();
}

function renderLocationButton() {
    const searchBtn = document.getElementById('locationSearchBtn');
    searchBtn.textContent = searchBtn.dataset.state === 'loading' ? t('search.searching') : t('search.go');
}

// ステータス表示（キーで覚えるので、言語を変えても出ている通知が残る）
function showStatus(key, type = 'loading', values = {}) {
    clearTimeout(statusTimer);
    lastStatus = { key, type, values };
    renderStatus();
    if (type === 'success') statusTimer = setTimeout(() => { lastStatus = null; renderStatus(); }, 5000);
}

function renderStatus() {
    const status = document.getElementById('status');
    if (!lastStatus) {
        status.textContent = '';
        status.hidden = true;
        return;
    }
    status.textContent = t(lastStatus.key, resolveValues(lastStatus.values));
    status.className = 'status ' + lastStatus.type;
    status.hidden = false;
}

// 全選択/全解除
function selectAll() {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    showStatus('status.selectedAll', 'success');
}

function selectNone() {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    showStatus('status.selectedNone', 'success');
}

// 地図から検索範囲を取得（範囲の大きさによる制限は設けない）
function currentBbox() {
    const bounds = map.getBounds();
    return logic.normalizeBbox({
        south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast()
    });
}

// マーカー情報取得
function getMarkerInfo(element, selectedIds) {
    const id = logic.classify(element?.tags, selectedIds);
    return logic.OBJECT_TYPES.find(type => type.id === id)
        || { id: 'other', category: 'other', icon: '📍', labelKey: 'type.other' };
}

// ポップアップ内容は開くときにDOMで生成する
function createPopup(element, selectedIds) {
    const model = logic.buildPopupModel(element, selectedIds);
    const content = createNode('div', 'popup-content');
    content.append(createNode('h2', 'popup-header', model.icon + ' ' + t(model.labelKey)));
    for (const section of model.sections) {
        const wrapper = createNode('section', 'popup-section');
        wrapper.append(createNode('h3', '', t(section.headingKey)));
        for (const item of section.items) {
            const row = createNode('div', 'popup-item');
            const value = item.valueKey ? t(item.valueKey, item.values) : item.value;
            row.append(createNode('span', 'popup-label', t(item.labelKey) + ':'),
                createNode('span', 'popup-value', value));
            wrapper.append(row);
        }
        content.append(wrapper);
    }
    const links = createNode('div', 'popup-links');
    for (const link of model.links) {
        const anchor = createNode('a', '', t(link.labelKey));
        anchor.href = link.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        links.append(anchor);
    }
    content.append(links);
    return content;
}

function markerTitle(entry) {
    const label = t(entry.labelKey);
    return entry.name ? label + ': ' + entry.name : label;
}

// 言語を変えたとき、地図に出したままのマーカーとポップアップを訳し直す
function retitleMarkers() {
    for (const entry of markerEntries) {
        const title = markerTitle(entry);
        entry.marker.options.title = title;
        const element = entry.marker.getElement();
        if (element) element.title = title;
        if (entry.marker.isPopupOpen()) entry.marker.getPopup().update();
    }
}

function addMarkersToMap(elements, selectedIds) {
    markersGroup.clearLayers();
    markerEntries = [];
    const markers = [];
    for (const element of elements) {
        const point = logic.elementLatLon(element);
        if (!point) continue;
        const info = getMarkerInfo(element, selectedIds);
        const emoji = createNode('span', '', info.icon);
        emoji.setAttribute('aria-hidden', 'true');
        const icon = L.divIcon({
            html: emoji, className: 'infra-marker infra-marker--' + info.category,
            iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15]
        });
        const entry = { labelKey: info.labelKey, name: element?.tags?.name || '' };
        const marker = L.marker([point.lat, point.lon], { icon, title: markerTitle(entry), keyboard: true });
        marker.bindPopup(() => createPopup(element, selectedIds), { maxWidth: 300 });
        entry.marker = marker;
        markerEntries.push(entry);
        markers.push(marker);
    }
    markersGroup.addLayers(markers);
    return markers.length;
}

// インフラ検索（制限撤廃版）
async function searchInfrastructure() {
    if (isSearching) return;
    const selectedIds = logic.OBJECT_TYPES.filter(type => document.getElementById(type.id).checked).map(type => type.id);
    const bbox = currentBbox();
    const query = logic.buildOverpassQuery(selectedIds, bbox);
    if (!query) {
        showStatus('status.selectObject', 'error');
        scrollToStatus();
        return;
    }
    showStatus('status.searchingInfra', 'loading');
    setSearchButtonLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    // 前回の結果を今回の成功と取り違えないよう、開始時にクリアする。
    lastSearch = null;
    markerEntries = [];
    markersGroup.clearLayers();
    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(query),
            signal: controller.signal
        });
        const result = logic.interpretOverpassResponse(response.status,
            response.headers.get('content-type') || '', await response.text());
        let count = 0;
        if (['ok', 'timeout', 'remark'].includes(result.kind)) {
            lastSearch = { elements: result.elements, selectedIds, bbox };
            count = addMarkersToMap(result.elements, selectedIds);
        }
        showSearchOutcome(result, count);
    } catch (error) {
        showStatus(error.name === 'AbortError' ? 'status.noResponse' : 'status.networkError', 'error');
    } finally {
        clearTimeout(timer);
        setSearchButtonLoading(false);
        scrollToStatus();
    }
}

function showSearchOutcome(result, count) {
    if (result.kind === 'ok') {
        if (count) showStatus('status.found', 'success', { count });
        else showStatus('status.none', 'warning');
    } else if (result.kind === 'timeout') {
        const partial = count ? { key: 'status.timeoutPartial', params: { count } } : '';
        showStatus('status.timeout', 'warning', { partial });
    } else if (result.kind === 'remark') {
        showStatus('status.remark', 'warning', { remark: result.remark });
    } else {
        const errors = {
            rate_limited: 'status.rateLimited',
            busy: 'status.busy',
            http_error: 'status.httpError',
            bad_format: 'status.badFormat'
        };
        showStatus(errors[result.kind], 'error', { status: result.status });
    }
}

function scrollToStatus() {
    if (matchMedia('(max-width: 1023px)').matches) {
        document.getElementById('status').scrollIntoView({
            block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
    }
}

// 検索時の選択内容に基づくサマリー表示。結果の有無はlastSearchで見る。
function renderSummaryContent() {
    const content = document.getElementById('summaryContent');
    content.replaceChildren();
    if (!lastSearch) {
        content.append(createNode('p', '', t('summary.empty')));
        return;
    }
    const summary = logic.buildSummary(lastSearch.elements, lastSearch.selectedIds);
    for (const category of summary.categories) {
        const table = createNode('table', 'summary-table');
        table.append(createNode('caption', '', t(category.titleKey)));
        for (const item of category.items) {
            const row = createNode('tr');
            const heading = createNode('th', '', item.icon + ' ' + t(item.labelKey));
            heading.scope = 'row';
            row.append(heading, createNode('td', item.count ? 'summary-count' : 'summary-zero',
                t('summary.count', { count: item.count })));
            table.append(row);
        }
        content.append(table);
    }
    content.append(createNode('p', '', t('summary.other', { count: summary.other })));
    content.append(createNode('p', 'summary-total', t('summary.total', { count: summary.total })));
    if (summary.skipped) content.append(createNode('p', '', t('summary.skipped', { count: summary.skipped })));
}

function showResultSummary() {
    if (!lastSearch) {
        showStatus('status.searchFirst', 'error');
        return;
    }
    renderSummaryContent();
    document.getElementById('summaryDialog').showModal();
}

function closeSummaryDialog() {
    document.getElementById('summaryDialog').close();
}

// エクスポート関連。件数を覚えておき、言語を変えたら案内文を組み直す。
function renderExportMessage() {
    document.getElementById('exportMessage').textContent =
        exportCount === null ? t('export.choose') : t('export.chooseCount', { count: exportCount });
}

// 出力する種別名は、表示中の言語の文言をロジックへ渡す
function exportLabels() {
    const labels = { other: t('type.other') };
    for (const type of logic.OBJECT_TYPES) labels[type.id] = t(type.labelKey);
    return labels;
}

function showExportDialog() {
    const count = lastSearch ? logic.buildSummary(lastSearch.elements, lastSearch.selectedIds).total : 0;
    if (!count) {
        showStatus('status.noExportData', 'error');
        return;
    }
    exportCount = count;
    renderExportMessage();
    document.getElementById('exportDialog').showModal();
}

function closeExportDialog() {
    document.getElementById('exportDialog').close();
}

function exportToGeoJSON() {
    if (!lastSearch) return;
    const data = logic.toGeoJSON(lastSearch.elements, lastSearch.selectedIds,
        new Date().toISOString(), exportLabels());
    downloadData(JSON.stringify(data, null, 2), 'application/geo+json', 'geojson');
    showStatus('status.exportedGeoJSON', 'success', { count: data.features.length });
}

function exportToKML() {
    if (!lastSearch) return;
    const data = logic.toKML(lastSearch.elements, lastSearch.selectedIds, exportLabels());
    downloadData(data, 'application/vnd.google-earth.kml+xml', 'kml');
    const count = logic.buildSummary(lastSearch.elements, lastSearch.selectedIds).total;
    showStatus('status.exportedKML', 'success', { count });
}

function downloadData(data, mime, ext) {
    const blob = new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const anchor = createNode('a');
    anchor.href = url;
    anchor.download = logic.exportFileName(new Date(), ext);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    closeExportDialog();
}

// デバッグモード
function toggleDebugMode() {
    debugMode = !debugMode;
    document.getElementById('debug-controls').hidden = !debugMode;
    document.getElementById('debugToggleBtn').setAttribute('aria-expanded', String(debugMode));
    map.invalidateSize();
    showStatus(debugMode ? 'status.debugOn' : 'status.debugOff', 'success');
}

function showDebugInfo() {
    document.getElementById('debugOutput').textContent = JSON.stringify({
        bounds: currentBbox(), zoom: map.getZoom(), center: map.getCenter(),
        markers: markersGroup.getLayers().length, isSearching,
        searchType: t('zoom.' + logic.zoomCategory(map.getZoom()).key)
    }, null, 2);
}

function jumpToTestLocation() {
    map.setView([35.6595, 139.7006], 15); // ズーム15で渋谷（検索可能な範囲）
    showStatus('status.testLocation', 'success');
}

function setupTheme() {
    const preference = matchMedia('(prefers-color-scheme: dark)');
    let saved;
    try { saved = localStorage.getItem('theme'); } catch { /* 保存できなくても利用できる。 */ }
    let explicit = saved === 'light' || saved === 'dark';
    const applyTheme = theme => {
        document.documentElement.dataset.theme = theme;
        const button = document.getElementById('themeToggle');
        button.setAttribute('aria-pressed', String(theme === 'dark'));
        button.textContent = theme === 'dark' ? '☀️' : '🌙';
    };
    applyTheme(explicit ? saved : preference.matches ? 'dark' : 'light');
    document.getElementById('themeToggle').addEventListener('click', () => {
        const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
        explicit = true;
        applyTheme(theme);
        try { localStorage.setItem('theme', theme); } catch { /* テーマはページ内でのみ維持する。 */ }
    });
    preference.addEventListener('change', () => {
        if (!explicit) applyTheme(preference.matches ? 'dark' : 'light');
    });
}

// 言語を変えたら、状態から組み立て直す。再検索はしない（空のまま統計を開かないため）。
function applyLanguageToViews() {
    renderStatus();
    renderSearchButton();
    renderLocationButton();
    renderExportMessage();
    renderSummaryContent();
    updateZoomIndicator();
    retitleMarkers();
}

// 初期化（古典スクリプトをbody末尾で読み込む）
function initialize() {
    setupTheme();
    const actions = {
        locationSearchBtn: searchLocation, selectAllBtn: selectAll, selectNoneBtn: selectNone,
        searchBtn: searchInfrastructure, summaryBtn: showResultSummary, exportBtn: showExportDialog,
        debugToggleBtn: toggleDebugMode, debugInfoBtn: showDebugInfo, testLocationBtn: jumpToTestLocation,
        geojsonBtn: exportToGeoJSON, kmlBtn: exportToKML, exportCloseBtn: closeExportDialog, summaryCloseBtn: closeSummaryDialog
    };
    for (const [id, action] of Object.entries(actions)) document.getElementById(id).addEventListener('click', action);
    for (const id of ['exportDialog', 'summaryDialog']) {
        const dialog = document.getElementById(id);
        dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    }
    document.querySelectorAll('.leaflet-control-attribution a').forEach(anchor => {
        anchor.rel = 'noopener noreferrer';
    });
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => map.invalidateSize(), 150);
    });
    document.addEventListener('languagechange', applyLanguageToViews);
    setupLocationSearch(); // 場所検索機能のセットアップ
    setSearchButtonLoading(false); // ボタンの文言を状態から描く
    setLocationButtonLoading(false);
    renderExportMessage();
    renderSummaryContent();
    updateZoomIndicator(); // 初期表示を更新
    showStatus('status.welcome', 'success');
}
initialize();
})();
