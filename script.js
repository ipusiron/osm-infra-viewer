// OSMインフラ可視化ツール - JavaScript

// 地図の初期化（初期ズーム14）
let map = L.map('map').setView([35.6762, 139.6503], 14);

// OpenStreetMapタイル追加
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors'
}).addTo(map);

// マーカークラスターグループ
let markersGroup = L.markerClusterGroup().addTo(map);

// ズーム変更時のイベントリスナー
map.on('zoomend moveend', updateZoomIndicator);

// HTMLエスケープ関数
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// デバッグモード状態
let debugMode = false;

// 検索状態管理
let isSearching = false;
let isLocationSearching = false;

// 場所検索機能
async function searchLocation() {
    if (isLocationSearching) return;

    const input = document.getElementById('locationInput').value.trim();
    if (!input) {
        showStatus('場所を入力してください', 'error');
        return;
    }

    isLocationSearching = true;
    const searchBtn = document.querySelector('.search-btn');
    const originalText = searchBtn.textContent;
    searchBtn.disabled = true;
    searchBtn.textContent = '検索中...';

    try {
        // 座標の直接入力をチェック (例: 35.6762,139.6503)
        const coordMatch = input.match(/^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/);
        if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lng = parseFloat(coordMatch[2]);
            
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
                map.setView([lat, lng], 15);
                showStatus(`📍 座標 ${lat}, ${lng} にジャンプしました`, 'success');
                return;
            } else {
                throw new Error('座標の範囲が正しくありません');
            }
        }

        // Nominatim APIで住所検索
        showStatus('🔍 場所を検索中...', 'loading');
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(input)}&limit=1&addressdetails=1`);
        
        if (!response.ok) {
            throw new Error('検索サービスにアクセスできません');
        }

        const data = await response.json();
        
        if (data.length === 0) {
            throw new Error('該当する場所が見つかりませんでした');
        }

        const result = data[0];
        const lat = parseFloat(result.lat);
        const lng = parseFloat(result.lon);
        
        // 日本国内の場合はズーム15、海外の場合はズーム12
        const isJapan = result.address && (result.address.country_code === 'jp' || result.address.country === '日本');
        const zoomLevel = isJapan ? 15 : 12;
        
        map.setView([lat, lng], zoomLevel);
        
        const displayName = result.display_name || `${lat}, ${lng}`;
        showStatus(`📍 ${displayName} にジャンプしました`, 'success');

    } catch (error) {
        console.error('Location search error:', error);
        showStatus(`❌ ${error.message}`, 'error');
    } finally {
        isLocationSearching = false;
        searchBtn.disabled = false;
        searchBtn.textContent = originalText;
    }
}

// Enterキーで検索実行
function setupLocationSearch() {
    const input = document.getElementById('locationInput');
    input.addEventListener('keypress', function(event) {
        if (event.key === 'Enter') {
            event.preventDefault();
            searchLocation();
        }
    });
}

// ズームレベル表示更新（制限撤廃、情報表示）
function updateZoomIndicator() {
    const currentZoom = map.getZoom();
    const bounds = map.getBounds();
    const latDiff = bounds.getNorth() - bounds.getSouth();
    const lngDiff = bounds.getEast() - bounds.getWest();
    
    document.getElementById('zoomLevel').textContent = currentZoom.toFixed(1);
    
    const statusElement = document.getElementById('zoomStatus');
    
    // 検索範囲の広さに応じたメッセージ表示
    if (currentZoom >= 13) {
        statusElement.textContent = '詳細範囲';
        statusElement.className = 'zoom-status zoom-ok';
    } else if (currentZoom >= 10) {
        statusElement.textContent = '中範囲';
        statusElement.className = 'zoom-status zoom-ok';
    } else if (currentZoom >= 7) {
        statusElement.textContent = '広範囲（時間要注意）';
        statusElement.className = 'zoom-status zoom-warning';
    } else {
        statusElement.textContent = '超広範囲（時間かかる）';
        statusElement.className = 'zoom-status zoom-ng';
    }
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
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = `status ${type}`;
    
    if (type !== 'loading') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 5000);
    }
}

// 全選択/全解除
function selectAll() {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
    showStatus('全てのオブジェクトを選択しました', 'success');
}

function selectNone() {
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    showStatus('全ての選択を解除しました', 'success');
}

// Overpass APIクエリ構築（最適化版）
function buildOverpassQuery(bounds) {
    const objectTypes = {
        surveillance: ['man_made=surveillance'],
        police: ['amenity=police'],
        emergency: ['emergency=phone'],
        tower: ['man_made=communications_tower', 'man_made=tower'],
        wifi: ['internet_access=wlan'],
        antenna: ['man_made=mast', 'man_made=antenna'],
        substation: ['power=substation'],
        power_pole: ['power=pole', 'power=tower'],
        generator: ['power=generator'],
        traffic_signals: ['highway=traffic_signals'],
        speed_camera: ['highway=speed_camera'],
        fuel_station: ['amenity=fuel'],
        atm: ['amenity=atm'],
        post_box: ['amenity=post_box'],
        waste_disposal: ['amenity=waste_disposal'],
        bank: ['amenity=bank'],
        hospital: ['amenity=hospital'],
        school: ['amenity=school'],
        restaurant: ['amenity=restaurant'],
        shop: ['shop=supermarket', 'shop=convenience'],
        parking: ['amenity=parking']
    };

    const selectedTypes = [];
    Object.keys(objectTypes).forEach(type => {
        if (document.getElementById(type)?.checked) {
            selectedTypes.push({type: type, tags: objectTypes[type]});
        }
    });

    if (selectedTypes.length === 0) return null;

    const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
    // タイムアウトを15秒に短縮（範囲制限により可能）
    let query = '[out:json][timeout:15];\n(\n';
    
    selectedTypes.forEach(typeInfo => {
        typeInfo.tags.forEach(tag => {
            const [key, value] = tag.split('=');
            query += `  node["${key}"="${value}"](${bbox});\n`;
            query += `  way["${key}"="${value}"](${bbox});\n`;
        });
    });
    
    query += ');\nout center meta;';
    return query;
}

// マーカー情報取得
function getMarkerInfo(element) {
    const tags = element.tags || {};
    
    const typeMap = {
        surveillance: {color: '#e74c3c', icon: '📹', type: 'CCTVカメラ'},
        police: {color: '#c0392b', icon: '🚓', type: '警察関連'},
        emergency: {color: '#e67e22', icon: '🆘', type: '緊急電話'},
        tower: {color: '#3498db', icon: '📡', type: '基地局'},
        wifi: {color: '#f39c12', icon: '📶', type: 'Wi-Fi'},
        antenna: {color: '#9b59b6', icon: '📻', type: 'アンテナ'},
        substation: {color: '#f1c40f', icon: '⚡', type: '変電所'},
        power_pole: {color: '#d68910', icon: '🗼', type: '電柱'},
        generator: {color: '#28b463', icon: '🔋', type: '発電機'},
        traffic_signals: {color: '#dc143c', icon: '🚦', type: '信号機'},
        speed_camera: {color: '#8b0000', icon: '📸', type: '交通監視'},
        fuel_station: {color: '#ff6b6b', icon: '⛽', type: 'ガソリンスタンド'},
        atm: {color: '#2ecc71', icon: '🏧', type: 'ATM'},
        post_box: {color: '#e74c3c', icon: '📮', type: '郵便ポスト'},
        waste_disposal: {color: '#7f8c8d', icon: '🗑️', type: 'ゴミ処理'},
        bank: {color: '#2c3e50', icon: '🏦', type: '銀行'},
        hospital: {color: '#e91e63', icon: '🏥', type: '病院'},
        school: {color: '#673ab7', icon: '🏫', type: '学校'},
        restaurant: {color: '#ff9800', icon: '🍽️', type: 'レストラン'},
        shop: {color: '#4caf50', icon: '🛒', type: 'ショップ'},
        parking: {color: '#607d8b', icon: '🅿️', type: '駐車場'}
    };

    // タグから種類を判定（すべてのパターンをチェック）
    // 監視・セキュリティ
    if (tags.man_made === 'surveillance') return {...typeMap.surveillance, infraType: 'surveillance'};
    if (tags.amenity === 'police') return {...typeMap.police, infraType: 'police'};
    if (tags.emergency === 'phone') return {...typeMap.emergency, infraType: 'emergency'};
    
    // 通信・ネットワーク
    if (tags.man_made === 'communications_tower' || tags.man_made === 'tower') return {...typeMap.tower, infraType: 'tower'};
    if (tags.internet_access === 'wlan') return {...typeMap.wifi, infraType: 'wifi'};
    if (tags.man_made === 'mast' || tags.man_made === 'antenna') return {...typeMap.antenna, infraType: 'antenna'};
    
    // 電力・エネルギー
    if (tags.power === 'substation') return {...typeMap.substation, infraType: 'substation'};
    if (tags.power === 'pole' || tags.power === 'tower') return {...typeMap.power_pole, infraType: 'power_pole'};
    if (tags.power === 'generator') return {...typeMap.generator, infraType: 'generator'};
    
    // 交通・輸送
    if (tags.highway === 'traffic_signals') return {...typeMap.traffic_signals, infraType: 'traffic_signals'};
    if (tags.highway === 'speed_camera') return {...typeMap.speed_camera, infraType: 'speed_camera'};
    if (tags.amenity === 'fuel') return {...typeMap.fuel_station, infraType: 'fuel_station'};
    
    // その他のインフラ
    if (tags.amenity === 'atm') return {...typeMap.atm, infraType: 'atm'};
    if (tags.amenity === 'post_box') return {...typeMap.post_box, infraType: 'post_box'};
    if (tags.amenity === 'waste_disposal') return {...typeMap.waste_disposal, infraType: 'waste_disposal'};
    
    // 施設・サービス
    if (tags.amenity === 'bank') return {...typeMap.bank, infraType: 'bank'};
    if (tags.amenity === 'hospital') return {...typeMap.hospital, infraType: 'hospital'};
    if (tags.amenity === 'school') return {...typeMap.school, infraType: 'school'};
    if (tags.amenity === 'restaurant') return {...typeMap.restaurant, infraType: 'restaurant'};
    if (tags.shop === 'supermarket' || tags.shop === 'convenience') return {...typeMap.shop, infraType: 'shop'};
    if (tags.amenity === 'parking') return {...typeMap.parking, infraType: 'parking'};

    // デフォルト（その他）
    return {color: '#95a5a6', icon: '📍', type: 'その他', infraType: 'other'};
}

// ポップアップ内容を生成（住所表示対応）
function generatePopup(element, markerInfo) {
    const tags = element.tags || {};
    const lat = element.lat || (element.center ? element.center.lat : 0);
    const lon = element.lon || (element.center ? element.center.lon : 0);
    
    let content = `<div class="popup-header">${markerInfo.icon} ${markerInfo.type}</div>`;
    
    // 基本情報
    if (tags.name || tags.operator || tags.brand) {
        content += `<div class="popup-section"><h4>📋 基本情報</h4>`;
        if (tags.name) {
            content += `<div class="popup-item">
                <span class="popup-label">名称:</span>
                <span class="popup-value">${escapeHtml(tags.name)}</span>
            </div>`;
        }
        if (tags.operator) {
            content += `<div class="popup-item">
                <span class="popup-label">運営者:</span>
                <span class="popup-value">${escapeHtml(tags.operator)}</span>
            </div>`;
        }
        if (tags.brand) {
            content += `<div class="popup-item">
                <span class="popup-label">ブランド:</span>
                <span class="popup-value">${escapeHtml(tags.brand)}</span>
            </div>`;
        }
        content += `</div>`;
    }

    // 住所・位置情報
    const hasAddress = tags.address || tags['addr:city'] || tags['addr:street'] || tags['addr:postcode'];
    content += `<div class="popup-section"><h4>📍 ${hasAddress ? '住所・位置情報' : '位置情報'}</h4>`;
    
    // 住所情報の表示
    if (tags.address) {
        content += `<div class="popup-item">
            <span class="popup-label">住所:</span>
            <span class="popup-value">${escapeHtml(tags.address)}</span>
        </div>`;
    } else if (tags['addr:city'] || tags['addr:street']) {
        // 住所を組み立て
        let addressParts = [];
        if (tags['addr:state']) addressParts.push(escapeHtml(tags['addr:state']));
        if (tags['addr:city']) addressParts.push(escapeHtml(tags['addr:city']));
        if (tags['addr:suburb']) addressParts.push(escapeHtml(tags['addr:suburb']));
        if (tags['addr:street']) addressParts.push(escapeHtml(tags['addr:street']));
        if (tags['addr:housenumber']) addressParts.push(escapeHtml(tags['addr:housenumber']));
        
        if (addressParts.length > 0) {
            content += `<div class="popup-item">
                <span class="popup-label">住所:</span>
                <span class="popup-value">${addressParts.join('')}</span>
            </div>`;
        }
    }
    
    if (tags['addr:postcode']) {
        content += `<div class="popup-item">
            <span class="popup-label">郵便番号:</span>
            <span class="popup-value">〒${escapeHtml(tags['addr:postcode'])}</span>
        </div>`;
    }

    content += `<div class="popup-item">
        <span class="popup-label">座標:</span>
        <span class="popup-value popup-coordinates">${lat.toFixed(6)}, ${lon.toFixed(6)}</span>
    </div>`;
    content += `</div>`;

    // システム情報
    content += `<div class="popup-section">
        <h4>🗺️ システム情報</h4>
        <div class="popup-item">
            <span class="popup-label">OSM ID:</span>
            <span class="popup-value">${element.type}/${element.id}</span>
        </div>
        <div class="popup-item">
            <span class="popup-label">最終更新:</span>
            <span class="popup-value">${element.timestamp ? new Date(element.timestamp).toLocaleDateString('ja-JP') : '不明'}</span>
        </div>
    </div>`;

    // 外部リンク
    content += `<div class="popup-links">
        <a href="https://www.openstreetmap.org/${element.type}/${element.id}" target="_blank">📍 OSMで見る</a>
        <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank">🗺️ Google Maps</a>`;
    
    if (lat && lon && Math.abs(lat) > 0.001 && Math.abs(lon) > 0.001) {
        content += `<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}" target="_blank">👁️ Street View</a>`;
    }
    content += `</div>`;
    
    return content;
}

function addMarkersToMap(data) {
    markersGroup.clearLayers();
    let count = 0;

    if (!data.elements || data.elements.length === 0) {
        showStatus('この範囲にはオブジェクトが見つかりませんでした', 'error');
        return;
    }

    data.elements.forEach(element => {
        let lat, lon;
        
        if (element.lat && element.lon) {
            lat = element.lat;
            lon = element.lon;
        } else if (element.center) {
            lat = element.center.lat;
            lon = element.center.lon;
        } else {
            return;
        }

        const markerInfo = getMarkerInfo(element);
        const marker = L.circleMarker([lat, lon], {
            radius: 8,
            fillColor: markerInfo.color,
            color: '#fff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        });

        // ポップアップ
        const popupContent = generatePopup(element, markerInfo);
        marker.bindPopup(popupContent);
        markersGroup.addLayer(marker);
        count++;
    });

    showStatus(`${count}個のオブジェクトを表示しました`, 'success');
}

// インフラ検索（制限撤廃版）
async function searchInfrastructure() {
    if (isSearching) return;

    const bounds = map.getBounds();
    const query = buildOverpassQuery(bounds);
    
    if (!query) {
        showStatus('検索するオブジェクトを選択してください', 'error');
        return;
    }

    // 広範囲検索の警告
    const currentZoom = map.getZoom();
    const latDiff = bounds.getNorth() - bounds.getSouth();
    const lngDiff = bounds.getEast() - bounds.getWest();
    
    if (currentZoom < 10 || latDiff > 0.1 || lngDiff > 0.1) {
        showStatus('🔍 広範囲を検索中です。時間がかかる場合があります...', 'loading');
    } else {
        showStatus('🔍 データを取得中...', 'loading');
    }

    setSearchButtonLoading(true);

    try {
        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(query)
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        window.lastSearchData = data;
        addMarkersToMap(data);
        
    } catch (error) {
        console.error('Error:', error);
        if (error.message.includes('timeout')) {
            showStatus('⏱️ 検索がタイムアウトしました。範囲を狭めるか、オブジェクト数を減らしてください', 'error');
        } else {
            showStatus('データ取得に失敗しました: ' + error.message, 'error');
        }
    } finally {
        setSearchButtonLoading(false);
    }
}

// 検索結果サマリー表示（エラーハンドリング改善）
function showResultSummary() {
    console.log('showResultSummary called'); // デバッグ用
    console.log('window.lastSearchData:', window.lastSearchData); // デバッグ用
    
    if (!window.lastSearchData) {
        showStatus('先に検索を実行してください', 'error');
        return;
    }
    
    if (!window.lastSearchData.elements) {
        showStatus('検索データの形式が正しくありません', 'error');
        return;
    }
    
    if (window.lastSearchData.elements.length === 0) {
        showStatus('表示する検索結果がありません（0件）', 'error');
        return;
    }

    try {
        const elements = window.lastSearchData.elements;
        const counts = {};
        const categoryMap = {
            'surveillance': {category: '🔒 監視・セキュリティ', name: 'CCTVカメラ', icon: '📹'},
            'police': {category: '🔒 監視・セキュリティ', name: '警察関連施設', icon: '🚓'},
            'emergency': {category: '🔒 監視・セキュリティ', name: '緊急電話', icon: '🆘'},
            'tower': {category: '📡 通信・ネットワーク', name: '携帯基地局', icon: '📡'},
            'wifi': {category: '📡 通信・ネットワーク', name: 'Wi-Fiホットスポット', icon: '📶'},
            'antenna': {category: '📡 通信・ネットワーク', name: 'アンテナ・マスト', icon: '📻'},
            'substation': {category: '⚡ 電力・エネルギー', name: '変電所', icon: '⚡'},
            'power_pole': {category: '⚡ 電力・エネルギー', name: '電柱・鉄塔', icon: '🗼'},
            'generator': {category: '⚡ 電力・エネルギー', name: '発電機', icon: '🔋'},
            'traffic_signals': {category: '🚦 交通・輸送', name: '信号機', icon: '🚦'},
            'speed_camera': {category: '🚦 交通・輸送', name: '交通監視カメラ', icon: '📸'},
            'fuel_station': {category: '🚦 交通・輸送', name: 'ガソリンスタンド', icon: '⛽'},
            'atm': {category: '🏢 その他のインフラ', name: 'ATM', icon: '🏧'},
            'post_box': {category: '🏢 その他のインフラ', name: '郵便ポスト', icon: '📮'},
            'waste_disposal': {category: '🏢 その他のインフラ', name: 'ゴミ処理施設', icon: '🗑️'},
            'bank': {category: '🏛️ 施設・サービス', name: '銀行', icon: '🏦'},
            'hospital': {category: '🏛️ 施設・サービス', name: '病院', icon: '🏥'},
            'school': {category: '🏛️ 施設・サービス', name: '学校', icon: '🏫'},
            'restaurant': {category: '🏛️ 施設・サービス', name: 'レストラン', icon: '🍽️'},
            'shop': {category: '🏛️ 施設・サービス', name: 'ショップ', icon: '🛒'},
            'parking': {category: '🏛️ 施設・サービス', name: '駐車場', icon: '🅿️'},
            'other': {category: '❓ その他', name: 'その他', icon: '📍'}
        };

        // 各オブジェクトタイプをカウント
        elements.forEach(element => {
            const markerInfo = getMarkerInfo(element);
            const infraType = markerInfo.infraType || 'other';
            counts[infraType] = (counts[infraType] || 0) + 1;
        });

        console.log('Counts:', counts); // デバッグ用

        // カテゴリ別にグループ化
        const categorizedCounts = {};
        Object.keys(categoryMap).forEach(type => {
            const info = categoryMap[type];
            if (!categorizedCounts[info.category]) {
                categorizedCounts[info.category] = [];
            }
            categorizedCounts[info.category].push({
                type: type,
                name: info.name,
                icon: info.icon,
                count: counts[type] || 0
            });
        });

        // HTMLを生成
        let summaryHtml = `<div style="text-align: left;">`;
        let totalCount = 0;

        Object.keys(categorizedCounts).forEach(category => {
            summaryHtml += `<h4 style="margin: 1rem 0 0.5rem 0; color: #495057; border-bottom: 1px solid #dee2e6; padding-bottom: 0.2rem;">${category}</h4>`;
            summaryHtml += `<table class="summary-table">`;
            
            categorizedCounts[category].forEach(item => {
                const countClass = item.count === 0 ? 'summary-zero' : 'summary-count';
                summaryHtml += `<tr>
                    <td><span class="summary-icon">${item.icon}</span>${item.name}</td>
                    <td class="${countClass}">${item.count}件</td>
                </tr>`;
                totalCount += item.count;
            });
            
            summaryHtml += `</table>`;
        });

        summaryHtml += `<table class="summary-table" style="margin-top: 1rem;">
            <tr class="summary-total">
                <td><strong>🔢 合計</strong></td>
                <td><strong>${totalCount}件</strong></td>
            </tr>
        </table>`;

        summaryHtml += `<p style="margin-top: 1rem; font-size: 0.85rem; color: #6c757d;">
            検索範囲: ${map.getZoom()}レベル、中心座標: ${map.getCenter().lat.toFixed(4)}, ${map.getCenter().lng.toFixed(4)}
        </p>`;

        summaryHtml += `</div>`;

        const summaryContent = document.getElementById('summaryContent');
        const summaryDialog = document.getElementById('summaryDialog');
        
        if (!summaryContent || !summaryDialog) {
            showStatus('サマリーダイアログが見つかりません', 'error');
            return;
        }

        summaryContent.innerHTML = summaryHtml;
        summaryDialog.style.display = 'flex';
        
    } catch (error) {
        console.error('Summary generation error:', error);
        showStatus('サマリー生成中にエラーが発生しました: ' + error.message, 'error');
    }
}

function closeSummaryDialog() {
    document.getElementById('summaryDialog').style.display = 'none';
}

// エクスポート関連
function showExportDialog() {
    const totalMarkers = markersGroup.getLayers().length;
    if (totalMarkers === 0) {
        showStatus('エクスポートするデータがありません', 'error');
        return;
    }
    document.getElementById('exportMessage').textContent = `現在${totalMarkers}個のオブジェクトがあります。どの形式で出力しますか？`;
    document.getElementById('exportDialog').style.display = 'flex';
}

function closeExportDialog() {
    document.getElementById('exportDialog').style.display = 'none';
}

function exportToGeoJSON() {
    const features = [];
    
    // データから直接取得（より詳細な情報を含む）
    if (window.lastSearchData && window.lastSearchData.elements) {
        window.lastSearchData.elements.forEach(element => {
            if (element.lat && element.lon || element.center) {
                const lat = element.lat || element.center.lat;
                const lon = element.lon || element.center.lon;
                const tags = element.tags || {};
                
                features.push({
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [lon, lat]
                    },
                    properties: {
                        name: tags.name || '',
                        operator: tags.operator || '',
                        address: tags.address || '',
                        'addr:street': tags['addr:street'] || '',
                        'addr:city': tags['addr:city'] || '',
                        'addr:postcode': tags['addr:postcode'] || '',
                        fee: tags.fee || '',
                        'internet_access:fee': tags['internet_access:fee'] || '',
                        opening_hours: tags.opening_hours || '',
                        phone: tags.phone || '',
                        website: tags.website || '',
                        height: tags.height || '',
                        'surveillance:type': tags['surveillance:type'] || '',
                        osmId: `${element.type}/${element.id}`,
                        exportedAt: new Date().toISOString(),
                        source: "OpenStreetMap"
                    }
                });
            }
        });
    } else {
        // フォールバック: マーカーから取得
        markersGroup.eachLayer(layer => {
            if (layer.getLatLng) {
                const latlng = layer.getLatLng();
                features.push({
                    type: "Feature",
                    geometry: {
                        type: "Point",
                        coordinates: [latlng.lng, latlng.lat]
                    },
                    properties: {
                        exportedAt: new Date().toISOString()
                    }
                });
            }
        });
    }

    const geoJSON = {
        type: "FeatureCollection",
        metadata: {
            title: "OSM Infrastructure Data",
            description: "Infrastructure objects from OpenStreetMap",
            generator: "OSM Infrastructure Viewer by IPUSIRON",
            exportedAt: new Date().toISOString(),
            count: features.length
        },
        features: features
    };

    const blob = new Blob([JSON.stringify(geoJSON, null, 2)], {type: 'application/geo+json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `osm-infrastructure-${new Date().toISOString().slice(0,19).replace(/[:.]/g, '-')}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
    
    showStatus(`GeoJSON形式で${features.length}個のオブジェクトを出力しました`, 'success');
}

function exportToKML() {
    let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <n>OSM Infrastructure Data</n>
`;
    
    markersGroup.eachLayer(layer => {
        if (layer.getLatLng) {
            const latlng = layer.getLatLng();
            kml += `    <Placemark>
      <n>Infrastructure Object</n>
      <Point>
        <coordinates>${latlng.lng},${latlng.lat},0</coordinates>
      </Point>
    </Placemark>
`;
        }
    });
    
    kml += `  </Document>
</kml>`;

    const blob = new Blob([kml], {type: 'application/vnd.google-earth.kml+xml'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `osm-infrastructure-${new Date().toISOString().slice(0,19)}.kml`;
    a.click();
    URL.revokeObjectURL(url);
    
    showStatus('KML形式でデータを出力しました', 'success');
}

// デバッグモード
function toggleDebugMode() {
    debugMode = !debugMode;
    document.getElementById('debug-controls').style.display = debugMode ? 'block' : 'none';
    showStatus(debugMode ? 'デバッグモードを有効にしました' : 'デバッグモードを無効にしました', 'success');
}

function showDebugInfo() {
    const currentZoom = map.getZoom();
    const bounds = map.getBounds();
    const latDiff = bounds.getNorth() - bounds.getSouth();
    const lngDiff = bounds.getEast() - bounds.getWest();
    
    let searchType = '';
    if (currentZoom >= 13) {
        searchType = '詳細検索';
    } else if (currentZoom >= 10) {
        searchType = '中範囲検索';
    } else if (currentZoom >= 7) {
        searchType = '広範囲検索（時間要注意）';
    } else {
        searchType = '超広範囲検索（時間かかる）';
    }
    
    console.log('Debug Info:', {
        bounds: bounds,
        zoom: currentZoom,
        center: map.getCenter(),
        markers: markersGroup.getLayers().length,
        isSearching: isSearching,
        searchArea: {
            latDiff: latDiff.toFixed(6),
            lngDiff: lngDiff.toFixed(6),
            searchType: searchType,
            restrictionsRemoved: true
        }
    });
    alert(`デバッグ情報をコンソールに出力しました\n\nズーム: ${currentZoom.toFixed(1)}\n範囲: ${latDiff.toFixed(6)} x ${lngDiff.toFixed(6)}\n検索タイプ: ${searchType}\n制限: 撤廃済み`);
}

function jumpToTestLocation() {
    map.setView([35.6595, 139.7006], 15); // ズーム15で渋谷（検索可能な範囲）
    showStatus('✅ テスト地点（渋谷・ズーム15）にジャンプしました', 'success');
}

function testSimpleQuery() {
    searchInfrastructure();
}

// 初期化
window.addEventListener('load', () => {
    setupLocationSearch(); // 場所検索機能のセットアップ
    updateZoomIndicator(); // 初期表示を更新
    showStatus('🗺️ 制限なしで検索可能です。広範囲検索は時間がかかる場合があります', 'success');
});
