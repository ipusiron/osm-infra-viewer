// OSMインフラ可視化ツール - JavaScript
(() => {
const logic = OsmInfraLogic;

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

// 場所検索機能
async function searchLocation() {
    if (isLocationSearching) return;
    const input = document.getElementById('locationInput').value.trim();
    if (!input) {
        showStatus('場所を入力してください', 'error');
        return;
    }
    const coordinates = logic.parseCoordinates(input);
    if (coordinates.ok) {
        map.setView([coordinates.lat, coordinates.lng], 15);
        showStatus('📍 入力した座標にジャンプしました', 'success');
        return;
    }
    if (coordinates.reason === 'out_of_range') {
        showStatus('座標の範囲が正しくありません', 'error');
        return;
    }
    if (Date.now() - lastLocationRequest < 1000) {
        showStatus('場所検索は1秒に1回までです。少し待ってから押してください', 'warning');
        return;
    }
    isLocationSearching = true;
    const searchBtn = document.getElementById('locationSearchBtn');
    searchBtn.disabled = true;
    searchBtn.textContent = '検索中...';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    try {
        showStatus('🔍 場所を検索中...', 'loading');
        lastLocationRequest = Date.now();
        const response = await fetch(logic.buildNominatimUrl(input), { signal: controller.signal });
        if (!response.ok) throw new Error('検索サービスにアクセスできません');
        const data = await response.json();
        if (!Array.isArray(data) || !data.length) throw new Error('該当する場所が見つかりませんでした');
        const result = data[0];
        const lat = Number(result.lat);
        const lng = Number(result.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('場所の座標が正しくありません');
        const isJapan = result.address && (result.address.country_code === 'jp' || result.address.country === '日本');
        map.setView([lat, lng], isJapan ? 15 : 12);
        showStatus('📍 ' + (result.display_name || lat + ', ' + lng) + 'にジャンプしました', 'success');
    } catch (error) {
        showStatus(error.name === 'AbortError' ? '場所検索の応答がありませんでした' : error.message, 'error');
    } finally {
        clearTimeout(timer);
        isLocationSearching = false;
        searchBtn.disabled = false;
        searchBtn.textContent = '🔍 移動';
    }
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
    statusElement.textContent = category.label;
    statusElement.className = 'zoom-status zoom-' + category.level;
}

// ボタン無効化・有効化
function setSearchButtonLoading(loading) {
    const searchBtn = document.getElementById('searchBtn');
    isSearching = loading;
    
    if (loading) {
        searchBtn.disabled = true;
        searchBtn.classList.add('loading');
        searchBtn.textContent = '検索中...';
    } else {
        searchBtn.disabled = false;
        searchBtn.classList.remove('loading');
        searchBtn.textContent = '🔍 検索';
    }
}

// ステータス表示
function showStatus(message, type = 'loading') {
    clearTimeout(statusTimer);
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = 'status ' + type;
    status.hidden = false;
    if (type === 'success') statusTimer = setTimeout(() => { status.hidden = true; }, 5000);
}

// 全選択/全解除
function selectAll() {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    showStatus('すべてのオブジェクトを選択しました', 'success');
}

function selectNone() {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    showStatus('すべての選択を解除しました', 'success');
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
        || { id: 'other', category: 'other', icon: '📍', label: 'その他' };
}

// ポップアップ内容は開くときにDOMで生成する
function createPopup(element, selectedIds) {
    const model = logic.buildPopupModel(element, selectedIds);
    const content = createNode('div', 'popup-content');
    content.append(createNode('h2', 'popup-header', model.icon + ' ' + model.label));
    for (const section of model.sections) {
        const wrapper = createNode('section', 'popup-section');
        wrapper.append(createNode('h3', '', section.heading));
        for (const item of section.items) {
            const row = createNode('div', 'popup-item');
            row.append(createNode('span', 'popup-label', item.label + ':'),
                createNode('span', 'popup-value', item.value));
            wrapper.append(row);
        }
        content.append(wrapper);
    }
    const links = createNode('div', 'popup-links');
    for (const link of model.links) {
        const anchor = createNode('a', '', link.label);
        anchor.href = link.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        links.append(anchor);
    }
    content.append(links);
    return content;
}

function addMarkersToMap(elements, selectedIds) {
    markersGroup.clearLayers();
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
        const title = element?.tags?.name ? info.label + ': ' + element.tags.name : info.label;
        const marker = L.marker([point.lat, point.lon], { icon, title, keyboard: true });
        marker.bindPopup(() => createPopup(element, selectedIds), { maxWidth: 300 });
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
        showStatus('検索するオブジェクトを選択してください', 'error');
        scrollToStatus();
        return;
    }
    showStatus('🔍 検索中です。広範囲では時間がかかる場合があります...', 'loading');
    setSearchButtonLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    // 前回の結果を今回の成功と取り違えないよう、開始時にクリアする。
    lastSearch = null;
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
        showStatus(error.name === 'AbortError'
            ? '45秒以内に応答がありませんでした。範囲を狭めるか、しばらく待ってから再検索してください'
            : 'Overpass APIに接続できませんでした。ネットワークを確認してください', 'error');
    } finally {
        clearTimeout(timer);
        setSearchButtonLoading(false);
        scrollToStatus();
    }
}

function showSearchOutcome(result, count) {
    if (result.kind === 'ok') {
        showStatus(count ? count + '個のオブジェクトを表示しました'
            : 'この範囲には該当するオブジェクトが見つかりませんでした', count ? 'success' : 'warning');
    } else if (result.kind === 'timeout') {
        let message = '⏱️ Overpass APIの処理が時間切れになりました（15秒）。地図を拡大するか、選択する種別を減らしてください';
        if (count) message += '（途中までの' + count + '個を表示しています）';
        showStatus(message, 'warning');
    } else if (result.kind === 'remark') {
        showStatus('Overpass APIが警告を返しました: ' + result.remark, 'warning');
    } else {
        const errors = {
            rate_limited: 'Overpass APIの利用制限に達しました。30秒ほど待ってから再検索してください',
            busy: 'Overpass APIが混雑しています（HTTP 504）。30秒ほど待ってから再検索してください',
            http_error: 'データ取得に失敗しました（HTTP ' + result.status + '）',
            bad_format: 'Overpass APIから想定外の形式の応答が返りました。しばらく待ってから再検索してください'
        };
        showStatus(errors[result.kind], 'error');
    }
}

function scrollToStatus() {
    if (matchMedia('(max-width: 1023px)').matches) {
        document.getElementById('status').scrollIntoView({
            block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
    }
}

// 検索時の選択内容に基づくサマリー表示
function showResultSummary() {
    if (!lastSearch) {
        showStatus('先に検索を実行してください', 'error');
        return;
    }
    const summary = logic.buildSummary(lastSearch.elements, lastSearch.selectedIds);
    const content = document.getElementById('summaryContent');
    content.replaceChildren();
    for (const category of summary.categories) {
        const table = createNode('table', 'summary-table');
        table.append(createNode('caption', '', category.title));
        for (const item of category.items) {
            const row = createNode('tr');
            const heading = createNode('th', '', item.icon + ' ' + item.label);
            heading.scope = 'row';
            row.append(heading, createNode('td', item.count ? 'summary-count' : 'summary-zero', item.count + '件'));
            table.append(row);
        }
        content.append(table);
    }
    content.append(createNode('p', '', '📍 その他: ' + summary.other + '件'));
    content.append(createNode('p', 'summary-total', '🔢 合計: ' + summary.total + '件'));
    if (summary.skipped) content.append(createNode('p', '', '座標のない要素' + summary.skipped + '件は数えていません'));
    document.getElementById('summaryDialog').showModal();
}

function closeSummaryDialog() {
    document.getElementById('summaryDialog').close();
}

// エクスポート関連
function showExportDialog() {
    const count = lastSearch ? logic.buildSummary(lastSearch.elements, lastSearch.selectedIds).total : 0;
    if (!count) {
        showStatus('エクスポートするデータがありません', 'error');
        return;
    }
    document.getElementById('exportMessage').textContent = count + '個のオブジェクトをどの形式で出力しますか？';
    document.getElementById('exportDialog').showModal();
}

function closeExportDialog() {
    document.getElementById('exportDialog').close();
}

function exportToGeoJSON() {
    if (!lastSearch) return;
    const data = logic.toGeoJSON(lastSearch.elements, lastSearch.selectedIds, new Date().toISOString());
    downloadData(JSON.stringify(data, null, 2), 'application/geo+json', 'geojson');
    showStatus('GeoJSON形式で' + data.features.length + '個のオブジェクトを出力しました', 'success');
}

function exportToKML() {
    if (!lastSearch) return;
    const data = logic.toKML(lastSearch.elements, lastSearch.selectedIds);
    downloadData(data, 'application/vnd.google-earth.kml+xml', 'kml');
    const count = logic.buildSummary(lastSearch.elements, lastSearch.selectedIds).total;
    showStatus('KML形式で' + count + '個のオブジェクトを出力しました', 'success');
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
    showStatus(debugMode ? 'デバッグモードを有効にしました' : 'デバッグモードを無効にしました', 'success');
}

function showDebugInfo() {
    document.getElementById('debugOutput').textContent = JSON.stringify({
        bounds: currentBbox(), zoom: map.getZoom(), center: map.getCenter(),
        markers: markersGroup.getLayers().length, isSearching,
        searchType: logic.zoomCategory(map.getZoom()).label
    }, null, 2);
}

function jumpToTestLocation() {
    map.setView([35.6595, 139.7006], 15); // ズーム15で渋谷（検索可能な範囲）
    showStatus('✅ テスト地点（渋谷・ズーム15）にジャンプしました', 'success');
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
    setupLocationSearch(); // 場所検索機能のセットアップ
    updateZoomIndicator(); // 初期表示を更新
    showStatus('🗺️ 検索範囲の制限はありません。広範囲の検索は時間切れになる場合があります', 'success');
}
initialize();
})();
