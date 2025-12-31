// --- 全域變數定義 ---
let selectedCity = '所有';
let selectedQuality = '所有';
let stationIDFilter = '';
let allData = [];
let currentPage = 1;
const pageSize = 2000;
let autoUpdateInterval = null;
let myChart = null;

// --- 1. 初始化地圖 ---
const map = L.map('map').setView([23.6, 121.0], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);

const airQualityDataURL = 'https://sta.colife.org.tw/STA_AirQuality_EPAIoT/v1.0/Datastreams?$select=name,description&$expand=Thing($select=name,properties),Thing/Locations($select=location/coordinates),Observations($orderby=phenomenonTime%20desc;$top=1;$select=phenomenonTime,result)&$filter=name%20eq%20%27PM2.5%27&$count=true';

// --- 2. 跨年倒數與年份自動更新 ---
function initCountdown() {
    const countdownEl = document.getElementById('countdown-timer');
    const yearTextEl = document.getElementById('year-text');

    const tick = () => {
        const now = new Date();
        const nextYear = now.getFullYear() + (now.getMonth() === 0 && now.getDate() === 1 ? 0 : 1);
        const target = new Date(`January 1, ${nextYear} 00:00:00`).getTime();
        const diff = target - now.getTime();

        if (diff <= 0) {
            countdownEl.innerHTML = "🎉 HAPPY NEW YEAR!";
            if (yearTextEl) yearTextEl.innerText = now.getFullYear();
            return;
        }

        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
        const m = Math.floor((diff / (1000 * 60)) % 60);
        const s = Math.floor((diff / 1000) % 60);

        countdownEl.innerHTML = `距離 ${nextYear} 年還有：<br><b>${d}天 ${h}時 ${m}分 ${s}秒</b>`;
        // 同步更新模態框年份（如果還沒跨過 2026）
        if (yearTextEl && now.getFullYear() < nextYear) yearTextEl.innerText = now.getFullYear();
    };
    setInterval(tick, 1000);
    tick();
}

// --- 3. 定位功能：逆地理編碼篩選縣市 ---
document.getElementById('locate-me').onclick = () => map.locate({setView: true, maxZoom: 12});

map.on('locationfound', async (e) => {
    L.marker(e.latlng).addTo(map).bindPopup("您的位置").openPopup();
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}&accept-language=zh-TW`);
        const json = await res.json();
        const city = (json.address.city || json.address.town || json.address.county || "").replace('台', '臺');
        
        const citySelect = document.getElementById('city-select');
        if ([...citySelect.options].some(opt => opt.value === city)) {
            citySelect.value = city;
            selectedCity = city;
            updateMap(true);
            alert(`偵測到位置：${city}，已自動過濾。`);
        }
    } catch (err) { console.error("定位轉換失敗", err); }
});

// --- 4. 自動更新邏輯 ---
document.getElementById('auto-load').onclick = function() {
    if (autoUpdateInterval) {
        clearInterval(autoUpdateInterval);
        autoUpdateInterval = null;
        this.innerText = "🔄 自動更新: 關";
        this.style.backgroundColor = "";
    } else {
        autoUpdateInterval = setInterval(() => updateMap(true), 60000);
        this.innerText = "🔄 自動更新: 開 (60s)";
        this.style.backgroundColor = "#90ee90";
        updateMap(true);
    }
};

// --- 5. 統計圖表邏輯 ---
function updateChart() {
    const ctx = document.getElementById('station-chart').getContext('2d');
    const counts = { '良好': 0, '普通': 0, '不良': 0, '非常不良': 0, '危害': 0 };

    allData.forEach(item => {
        const props = item.Thing.properties || {};
        const cityName = props.city || props.county || props.areaType || "未知";
        if (selectedCity === '所有' || cityName === selectedCity) {
            const level = getLevel(item.Observations[0]?.result);
            if (counts[level] !== undefined) counts[level]++;
        }
    });

    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(counts),
            datasets: [{
                label: `站點數量 (${selectedCity})`,
                data: Object.values(counts),
                backgroundColor: ['green', '#cccc00', 'orange', 'red', 'purple']
            }]
        },
        options: { responsive: true, maintainAspectRatio: false }
    });
}

// --- 6. 核心：資料處理 ---
async function updateMap(isRefresh = false) {
    if (isRefresh) { currentPage = 1; allData = []; }
    const skip = (currentPage - 1) * pageSize;
    const url = `${airQualityDataURL}&$top=${pageSize}&$skip=${skip}`;
    
    try {
        const res = await fetch(url);
        const data = await res.json();
        if (isRefresh) allData = data.value;
        else allData = allData.concat(data.value);

        updateCityDropdown(allData);
        map.eachLayer(l => { if (l instanceof L.CircleMarker) map.removeLayer(l); });
        const info = document.getElementById('station-info');
        info.innerHTML = '';

        allData.forEach(item => {
            const props = item.Thing.properties || {};
            const cityName = props.city || props.county || props.areaType || "未知";
            const stID = props.stationID || "未知";
            const val = item.Observations[0]?.result || 0;
            const level = getLevel(val);

            if ((selectedCity === '所有' || cityName === selectedCity) && 
                (selectedQuality === '所有' || level === selectedQuality) &&
                (stationIDFilter === '' || String(stID).includes(stationIDFilter))) {
                
                const coord = item.Thing.Locations[0].location.coordinates;
                L.circleMarker([coord[1], coord[0]], {
                    radius: 8, fillColor: getColor(level), color: '#000', weight: 1, fillOpacity: 0.7
                }).addTo(map).bindPopup(`<b>${item.Thing.name}</b><br>ID: ${stID}<br>縣市: ${cityName}<br>PM2.5: ${val} (${level})`);

                const div = document.createElement('div');
                div.className = 'station-item';
                div.innerHTML = `<b>${item.Thing.name}</b> (${cityName})<br>ID: ${stID} | PM2.5: ${val}`;
                info.appendChild(div);
            }
        });
        updateChart();
    } catch (e) { console.error("資料載入錯誤", e); }
}

function getLevel(v) {
    if (v <= 35) return '良好'; if (v <= 75) return '普通'; if (v <= 150) return '不良';
    if (v <= 250) return '非常不良'; return '危害';
}
function getColor(l) {
    return { '良好': 'green', '普通': '#cccc00', '不良': 'orange', '非常不良': 'red', '危害': 'purple' }[l] || 'gray';
}
function updateCityDropdown(data) {
    const select = document.getElementById('city-select');
    const current = select.value;
    const cities = new Set(['所有']);
    data.forEach(i => {
        const p = i.Thing.properties;
        cities.add(p.city || p.county || p.areaType || "未知");
    });
    if (select.options.length !== cities.size) {
        select.innerHTML = '';
        Array.from(cities).sort().forEach(c => {
            const o = document.createElement('option');
            o.value = o.text = c;
            select.appendChild(o);
        });
        select.value = cities.has(current) ? current : '所有';
    }
}

// --- 7. 初始化與事件監聽 ---
window.onload = () => {
    document.getElementById('modal').style.display = 'block';
    initCountdown();
    updateMap();
};

document.getElementById('city-select').onchange = (e) => { selectedCity = e.target.value; updateMap(); };
document.getElementById('quality-select').onchange = (e) => { selectedQuality = e.target.value; updateMap(); };
document.getElementById('station-id-filter').oninput = (e) => { stationIDFilter = e.target.value.trim(); updateMap(); };
document.getElementById('load-more').onclick = () => { currentPage++; updateMap(); };
document.getElementById('show-chart').onclick = () => document.getElementById('chart-container').style.display = 'block';
document.getElementById('chart-close').onclick = () => document.getElementById('chart-container').style.display = 'none';
document.querySelector('.close').onclick = () => document.getElementById('modal').style.display = 'none';


// --- 煙火與時間邏輯 (省略重複部分，請保留您原本的煙火代碼) ---

// --- 2025 新年煙火效果腳本 ---
const canvas = document.getElementById('fireworks-canvas');
const ctx = canvas.getContext('2d');
const modal = document.getElementById('modal');
canvas.width = window.innerWidth * 0.8;
canvas.height = window.innerHeight * 0.8;

let particles = [];
const MAX_PARTICLES = 100;

class Particle {
    constructor(x, y, color, shape = 'circle', size = 2) {
        this.x = x; this.y = y; this.color = color; this.shape = shape;
        this.size = size;
        this.angle = Math.random() * Math.PI * 2;
        this.velocity = Math.random() * 3 + 1;
        this.friction = 0.95; this.gravity = 0.05; this.opacity = 1;
    }
    update() {
        this.velocity *= this.friction;
        this.x += Math.cos(this.angle) * this.velocity;
        this.y += Math.sin(this.angle) * this.velocity + this.gravity;
        this.opacity -= 0.01;
    }
    draw() {
        ctx.globalAlpha = this.opacity;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
    }
}

function createFirework(shape, x, y) {
    const color = `hsl(${Math.random() * 360}, 100%, 50%)`;
    for (let i = 0; i < 50; i++) {
        particles.push(new Particle(x, y, color, shape));
    }
}

function animateFireworks() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles = particles.filter(p => p.opacity > 0);
    particles.forEach(p => { p.update(); p.draw(); });
    requestAnimationFrame(animateFireworks);
}

setInterval(() => {
    if (modal.style.display === 'block') {
        createFirework('circle', Math.random() * canvas.width, Math.random() * canvas.height * 0.5);
    }
}, 500);

animateFireworks();