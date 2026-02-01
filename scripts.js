// --- 全域變數定義 ---
let allData = []; 
let markersLayer = L.layerGroup(); 
let myChart = null;
let selectedCity = '所有'; 
let selectedQuality = '所有';
let playTimer = null;
const qualityLevels = ['良好', '普通', '不良', '危害', '異常'];
let currentPlayIdx = -1;

// --- 1. 地圖初始化 (立即執行) ---
const map = L.map('map', { zoomControl: false, tap: true }).setView([23.6, 121.0], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);
markersLayer.addTo(map);

// --- 擴充版：2026 人文巡檢引擎 ---
function getSpecialDateInfo(date) {
    const month = date.getMonth() + 1, day = date.getDate(), key = `${month}-${day}`;
    
    // 2026 國定假日表
    const holidays = { 
        "1-1": "元旦假期", "2-16": "農曆除夕", "2-17": "春節初一", "2-18": "春節初二",
        "2-19": "春節初三", "2-20": "春節初四", "2-21": "春節初五", "2-28": "和平紀念日", "3-3": "元宵節", 
        "4-3": "兒童節節慶", "4-4": "民族掃墓節(清明)", "5-1": "勞動節", "6-19": "端午節", 
        "9-25": "中秋節", "10-10": "國慶日" , "12-25": "行憲紀念日(聖誕節)" 
    };

    // 2026 二十四節氣表
    const terms = { 
        "1-5": "小寒", "1-20": "大寒", "2-4": "立春", "2-18": "雨水", "3-5": "驚蟄", "3-20": "春分",
        "4-5": "清明", "4-20": "穀雨", "5-5": "立夏", "5-21": "小滿", "6-5": "芒種", "6-21": "夏至",
        "7-7": "小暑", "7-22": "大暑", "8-7": "立秋", "8-23": "處暑", "9-7": "白露", "9-22": "秋分",
        "10-8": "寒露", "10-23": "霜降", "11-7": "立冬", "11-22": "小雪", "12-7": "大雪", "12-21": "冬至"
    };
    
    const lunar = new Intl.DateTimeFormat('zh-TW-u-ca-chinese', { month: 'long', day: 'numeric' }).format(date);
    const text = holidays[key] || terms[key] || "2026 穩定巡檢中";
    return { text, lunar };
}

function updateClocks() {
    const now = new Date();
    const info = getSpecialDateInfo(now);
    
    // 更新側欄時鐘
    document.getElementById('side-time').innerText = now.toLocaleTimeString('zh-TW', { hour12: false });
    document.getElementById('lunar-info').innerText = `農曆 ${info.lunar} | ${info.text}`;
    
    // 更新開場文字 (若視窗還在)
    const greetingEl = document.getElementById('dynamic-greeting');
    if(greetingEl) greetingEl.innerText = info.text;

    // 2027 倒數計時
    const target = new Date("2027-01-01T00:00:00");
    const diff = target - now;
    if (diff > 0) {
        const dd = Math.floor(diff / 86400000);
        const hh = Math.floor((diff/3600000)%24);
        const mm = Math.floor((diff/60000)%60);
        const ss = Math.floor((diff/1000)%60);
        document.getElementById('countdown-timer').innerHTML = `距離 2027：<b>${dd}天 ${hh}時 ${mm}分 ${ss}秒</b>`;
    }
}

// --- 3. 核心：全台數據分頁串接 (非阻塞模式) ---
async function fetchData() {
    addLog("🌐 啟動 IoT 大數據串接...");
    allData = []; // 清空舊資料
    
    // 環保署開放資料 API (含 nextLink 機制)
    let nextURL = 'https://sta.colife.org.tw/STA_AirQuality_EPAIoT/v1.0/Datastreams?$top=2000&$expand=Thing($select=name,properties),Thing/Locations($select=location/coordinates),Observations($orderby=phenomenonTime%20desc;$top=1;$select=result)&$filter=name%20eq%20%27PM2.5%27';
    
    try {
        let page = 1;
        while (nextURL) {
            // 使用 await fetch 但不阻塞 UI 渲染
            const res = await fetch(nextURL);
            if (!res.ok) throw new Error("API 回應異常");
            
            const json = await res.json();
            const newData = json.value || [];
            allData = allData.concat(newData);
            nextURL = json['@iot.nextLink'] || null;
            
            addLog(`📡 第 ${page} 頁同步完成 (累計 ${allData.length} 站)...`);
            
            // 重要：每一頁抓完就先更新一次 UI，讓使用者有感
            refreshUI(false); 
            updateCityDropdown();
            
            page++;
        }
        addLog(`✅ 全台同步完成 (共 ${allData.length} 測站)`);
        updateChart(); // 數據全抓完後更新圖表
    } catch (e) {
        addLog(`❌ 同步中斷: ${e.message}`);
        console.error(e);
    }
}

// --- 4. 介面渲染 (地圖與清單) ---
function refreshUI(flyTo = true) {
    markersLayer.clearLayers();
    const listEl = document.getElementById('station-info-list');
    if (listEl) listEl.innerHTML = ''; // 清空清單
    
    const points = [];
    let count = 0;

    // 效能優化：只處理當前篩選條件的資料
    for (const item of allData) {
        const city = item.Thing.properties.city || item.Thing.properties.county;
        const val = item.Observations[0]?.result ?? -1;
        const level = getLevel(val);

        // 篩選邏輯
        if ((selectedCity === '所有' || city === selectedCity) && 
            (selectedQuality === '所有' || level === selectedQuality)) {
            
            const coord = item.Thing.Locations[0].location.coordinates;
            const lat = coord[1], lng = coord[0];
            
            // 繪製地圖點
            const marker = L.circleMarker([lat, lng], {
                radius: 6,
                fillColor: getColor(level),
                color: '#fff',
                weight: 1,
                fillOpacity: 0.8
            }).bindPopup(`<strong>${item.Thing.name}</strong><br>數值: ${val}<br>等級: ${level}`);
            
            markersLayer.addLayer(marker);
            points.push([lat, lng]);

            // 繪製右側清單卡片 (限制顯示前 100 筆以免 DOM過重)
            if (count < 100 && listEl) {
                const card = document.createElement('div');
                card.className = 'station-card';
                card.style.borderLeft = `5px solid ${getColor(level)}`;
                card.innerHTML = `<div style="font-weight:bold">${item.Thing.name}</div><div style="font-size:12px;color:#666">${city} | PM2.5: ${val}</div>`;
                card.onclick = () => {
                    map.flyTo([lat, lng], 15);
                    marker.openPopup();
                };
                listEl.appendChild(card);
            }
            count++;
        }
    }

    // 視角運鏡
    if (flyTo && points.length > 0) {
        map.flyToBounds(points, { padding: [50, 50], maxZoom: 14, duration: 1.5 });
    }
}

// --- 5. 統計圖表 (含點擊空白重置功能) ---
function updateChart() {
    const canvas = document.getElementById('station-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // 計算各等級數量
    const counts = { '良好': 0, '普通': 0, '不良': 0, '危害': 0, '異常': 0 };
    allData.forEach(i => {
        const city = i.Thing.properties.city || i.Thing.properties.county;
        if (selectedCity === '所有' || city === selectedCity) {
            const lv = getLevel(i.Observations[0]?.result ?? -1);
            if (counts[lv] !== undefined) counts[lv]++;
        }
    });

    if (myChart) myChart.destroy();

    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(counts),
            datasets: [{
                data: Object.values(counts),
                backgroundColor: ['#28a745', '#ffc107', '#fd7e14', '#dc3545', '#6c757d'],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: { y: { beginAtZero: true, type: 'logarithmic' } }, // 對數座標避免差異過大
            plugins: { legend: { display: false } },
            onClick: (e, elements) => {
                // 關鍵修復：判斷點擊的是長條還是背景
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    selectedQuality = Object.keys(counts)[idx];
                    addLog(`📊 篩選圖表: ${selectedQuality}`);
                } else {
                    selectedQuality = '所有';
                    addLog(`📊 重置圖表篩選`);
                }
                // 同步更新下拉選單與地圖
                document.getElementById('quality-select').value = selectedQuality;
                refreshUI(true);
            },
            onHover: (event, chartElement) => {
                event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
            }
        }
    });
}

// --- 6. 自動輪播系統 ---
function handleAutoPlay() {
    if (playTimer) clearInterval(playTimer);
    playTimer = setInterval(() => {
        const isEnabled = document.getElementById('auto-play-check').checked;
        if (!isEnabled || allData.length === 0) {
            document.getElementById('play-status').innerText = isEnabled ? "等待數據..." : "輪播暫停";
            return;
        }

        currentPlayIdx = (currentPlayIdx + 1) % qualityLevels.length;
        selectedQuality = qualityLevels[currentPlayIdx];
        
        // 更新 UI
        document.getElementById('quality-select').value = selectedQuality;
        document.getElementById('play-status').innerText = `巡檢中: ${selectedQuality}`;
        refreshUI(true); // 觸發運鏡
    }, 5000); // 每 5 秒切換
}

// --- 工具與輔助函式 ---
function getLevel(v) { 
    if (v < 0) return '異常';
    if (v <= 35) return '良好';
    if (v <= 75) return '普通';
    if (v <= 150) return '不良';
    return '危害';
}

function getColor(l) { 
    return {'良好':'#28a745','普通':'#ffc107','不良':'#fd7e14','危害':'#dc3545','異常':'#6c757d'}[l]; 
}

function addLog(msg) {
    const el = document.getElementById('station-status-summary');
    if (el) {
        el.innerText = msg; // 顯示最新一條狀態
        // 若要保留歷史紀錄可改為 el.innerText += '\n' + msg;
    }
}

function updateCityDropdown() {
    const s = document.getElementById('city-select');
    const currentVal = s.value;
    // 提取所有不重複縣市並排序
    const cities = [...new Set(allData.map(i => i.Thing.properties.city || i.Thing.properties.county))]
                   .filter(x => x).sort();
    
    s.innerHTML = '<option value="所有">所有縣市</option>';
    cities.forEach(c => {
        const opt = document.createElement('option');
        opt.value = opt.text = c;
        s.appendChild(opt);
    });
    s.value = currentVal; // 保持用戶原本的選擇
}

function closeStartModal() { 
    document.getElementById('modal').style.display = 'none'; 
}

// 煙火特效 (維持原樣，增加效能檢查)
function initFireworks() {
    const canvas = document.getElementById('fireworks-canvas');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; 
    canvas.height = window.innerHeight;
    
    let particles = [];
    function animate() {
        if(document.getElementById('modal').style.display === 'none') return; // 關閉視窗後停止渲染
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        particles.forEach((p, i) => {
            p.x += Math.cos(p.angle) * p.speed;
            p.y += Math.sin(p.angle) * p.speed + 0.5; // 重力
            p.alpha -= 0.01;
            
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
            ctx.fill();
            
            if (p.alpha <= 0) particles.splice(i, 1);
        });
        requestAnimationFrame(animate);
    }
    animate();

    // 定時發射煙火
    setInterval(() => {
        if (document.getElementById('modal').style.display !== 'none') {
            const x = Math.random() * canvas.width;
            const y = canvas.height * 0.5 + Math.random() * 200;
            const color = `hsl(${Math.random() * 360}, 100%, 60%)`;
            for (let i = 0; i < 40; i++) {
                particles.push({
                    x: x, y: y, color: color,
                    angle: Math.random() * Math.PI * 2,
                    speed: Math.random() * 4 + 1,
                    alpha: 1
                });
            }
        }
    }, 600);
}

// --- 程式進入點 (Entry Point) ---
window.onload = () => {
    // 1. 優先：啟動 UI 相關 (時鐘、煙火)，讓用戶覺得系統反應快
    updateClocks();
    initFireworks();
    setInterval(updateClocks, 1000);

    // 2. 異步：開始抓資料 (不會卡住畫面)
    fetchData();

    // 3. 邏輯：啟動輪播監聽
    handleAutoPlay();

    // 4. 事件綁定
    document.getElementById('city-select').onchange = (e) => { 
        selectedCity = e.target.value; refreshUI(true); updateChart(); 
    };
    document.getElementById('quality-select').onchange = (e) => { 
        selectedQuality = e.target.value; refreshUI(true); 
    };
    // 修改後的定位邏輯 (整合至 v3.2.0)
    document.getElementById('locate-btn').onclick = function() {
        const btn = this;
        btn.classList.add('searching'); // 啟動 CSS 雙層光圈
        btn.innerHTML = '🛰️ 定位中';
        addLog("🛰️ 正在請求地理位置授權...");

        map.locate({ setView: true, maxZoom: 15, timeout: 10000 });

        // 定位成功的處理
        map.once('locationfound', (e) => {
            btn.classList.remove('searching');
            btn.innerHTML = '✅ 已定位';
            addLog("✅ 衛星定位完成");

            // 清除舊標記並新增科技標記
            if (window.userMarker) map.removeLayer(window.userMarker);
            
            const techIcon = L.divIcon({
                className: 'tech-radar-marker',
                html: '<div class="radar-center"></div><div class="radar-ring"></div>',
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });

            window.userMarker = L.marker(e.latlng, { icon: techIcon }).addTo(map);

            // 2秒後恢復按鈕文字，但保留標記
            setTimeout(() => { btn.innerHTML = '📍 定位'; }, 2000);
        });

        // 定位失敗的處理
        map.once('locationerror', (err) => {
            btn.classList.remove('searching');
            btn.innerHTML = '❌ 失敗';
            addLog(`❌ 定位失敗: ${err.message}`);
            setTimeout(() => { btn.innerHTML = '📍 定位'; }, 2000);
        });
    };
    document.getElementById('show-chart-btn').onclick = () => {
        document.getElementById('chart-floating-window').style.display = 'block';
        updateChart(); // 開啟時重繪一次
    };
    document.getElementById('chart-close').onclick = () => {
        document.getElementById('chart-floating-window').style.display = 'none';
    };
    document.getElementById('chart-close').className = 'close-x'; // 確保樣式套用
    document.getElementById('refresh-now-btn').onclick = () => {
        fetchData(); // 手動觸發重新同步
    };
    document.getElementById('legend-trigger').onclick = () => {
        const body = document.getElementById('legend-body');
        body.style.display = body.style.display === 'none' ? 'block' : 'none';
    };
};