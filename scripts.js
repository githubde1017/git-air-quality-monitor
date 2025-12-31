let allData = [];
let myChart = null;
let autoTimer = null;
let selectedCity = '所有';
let userMarker = null;

const map = L.map('map').setView([23.6, 121.0], 7);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map);

// --- 1. 時間功能 ---
function startTimers() {
    setInterval(() => {
        const now = new Date();
        document.getElementById('side-clock').innerText = 
            `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')} ${now.toLocaleTimeString('zh-TW',{hour12:false})}`;
        
        const diff = new Date("2027-01-01T00:00:00") - now;
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff / 3600000) % 24);
        const m = Math.floor((diff / 60000) % 60);
        const s = Math.floor((diff / 1000) % 60);
        document.getElementById('countdown-timer').innerText = `2027 跨年倒數：${d}天 ${h}時 ${m}分 ${s}秒`;
    }, 1000);
}

// --- 2. 高效 2000 筆資料讀取 ---
async function fetchData() {
    const apiURL = 'https://sta.colife.org.tw/STA_AirQuality_EPAIoT/v1.0/Datastreams?$top=2000&$select=name&$expand=Thing($select=name,properties),Thing/Locations($select=location/coordinates),Observations($orderby=phenomenonTime%20desc;$top=1;$select=result)&$filter=name%20eq%20%27PM2.5%27';
    let nextLink = apiURL;
    const statusEl = document.getElementById('station-status-summary');
    allData = [];
    
    try {
        while (nextLink) {
            statusEl.innerText = `📡 高度同步中... 已載入 ${allData.length} 站`;
            const res = await fetch(nextLink);
            const json = await res.json();
            if (json.value) {
                allData = allData.concat(json.value);
                refreshUI(false); 
            }
            nextLink = json['@iot.nextLink'] || null;
            await new Promise(r => setTimeout(r, 10)); 
        }
        statusEl.innerText = `✅ 同步完成: 共 ${allData.length} 測站`;
        updateCityDropdown();
    } catch (e) {
        statusEl.innerText = "❌ 網路連線錯誤";
    }
}

// --- 3. GPS 定位 ---
function locateMe() {
    if (!navigator.geolocation) return alert("瀏覽器不支援定位");
    navigator.geolocation.getCurrentPosition((pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (userMarker) map.removeLayer(userMarker);
        const icon = L.divIcon({ className: 'user-location-dot', iconSize: [12, 12] });
        userMarker = L.marker([lat, lng], { icon }).addTo(map).bindPopup("您的位置").openPopup();
        map.flyTo([lat, lng], 14);
    }, () => alert("定位失敗，請確認 GPS 權限"));
}

// --- 4. 統計與 UI ---
function getLevel(v) {
    if (v < 0 || v > 500) return '異常';
    if (v <= 35) return '良好';
    if (v <= 75) return '普通';
    if (v <= 150) return '不良';
    return '危害';
}
const getColor = (l) => ({'良好':'green','普通':'#cccc00','不良':'orange','危害':'red','異常':'gray'}[l]);

function refreshUI(resetMap = true) {
    if (resetMap) map.eachLayer(l => { if (l instanceof L.CircleMarker) map.removeLayer(l); });
    const listEl = document.getElementById('station-info-list');
    if (resetMap) listEl.innerHTML = '';

    allData.forEach(item => {
        const val = item.Observations[0]?.result ?? -1;
        const level = getLevel(val);
        const city = item.Thing.properties.city || item.Thing.properties.county || "未知";
        
        if (selectedCity === '所有' || city === selectedCity) {
            const coord = item.Thing.Locations[0].location.coordinates;
            const marker = L.circleMarker([coord[1], coord[0]], {
                radius: 7, fillColor: getColor(level), color: '#fff', weight: 1, fillOpacity: 0.8
            }).addTo(map).bindPopup(`<b>${item.Thing.name}</b><br>PM2.5: ${val}`);

            if (resetMap) {
                const card = document.createElement('div');
                card.className = 'station-card';
                card.style.borderLeftColor = getColor(level);
                card.innerHTML = `<b>${item.Thing.name}</b><br>${city} | PM2.5: ${val}`;
                card.onclick = () => { map.flyTo([coord[1], coord[0]], 15); marker.openPopup(); };
                listEl.appendChild(card);
            }
        }
    });
    updateChart();
}



function updateChart() {
    const counts = { '良好': 0, '普通': 0, '不良': 0, '危害': 0, '異常': 0 };
    allData.forEach(i => counts[getLevel(i.Observations[0]?.result ?? -1)]++);
    const ctx = document.getElementById('station-chart').getContext('2d');
    if (myChart) myChart.destroy();
    myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: Object.keys(counts),
            datasets: [{ label: '測站分佈 (Log Scale)', data: Object.values(counts), backgroundColor: ['green','#cccc00','orange','red','gray'] }]
        },
        options: { scales: { y: { type: 'logarithmic' } } }
    });
}

// --- 5. 初始化與事件 ---
window.onload = () => {
    startTimers(); fetchData();
    document.getElementById('modal-close-btn').onclick = () => {
        const modal = document.getElementById('modal');
        modal.style.transition = "opacity 0.6s ease";
        modal.style.opacity = "0";
        setTimeout(() => modal.style.display = 'none', 600);
    };
    document.getElementById('locate-btn').onclick = locateMe;
    document.getElementById('refresh-now-btn').onclick = fetchData;
    document.getElementById('city-select').onchange = (e) => { selectedCity = e.target.value; refreshUI(true); };
    document.getElementById('show-chart').onclick = () => document.getElementById('chart-container').style.display = 'block';
    document.getElementById('chart-close').onclick = () => document.getElementById('chart-container').style.display = 'none';
    document.getElementById('auto-update-btn').onclick = function() {
        if (autoTimer) {
            clearInterval(autoTimer); autoTimer = null;
            this.innerText = "🔄 自動更新：關"; this.className = "btn-green";
        } else {
            fetchData(); autoTimer = setInterval(fetchData, 60000);
            this.innerText = "🔄 自動更新：開"; this.className = "btn-gray";
        }
    };
};

function updateCityDropdown() {
    const select = document.getElementById('city-select');
    const cities = new Set(['所有']);
    allData.forEach(i => cities.add(i.Thing.properties.city || i.Thing.properties.county || "未知"));
    select.innerHTML = '';
    Array.from(cities).sort().forEach(c => {
        const o = document.createElement('option'); o.value = o.text = c; select.appendChild(o);
    });
}

// 煙火動畫
const canvas = document.getElementById('fireworks-canvas');
const ctxF = canvas.getContext('2d');
let particles = [];
function animate() {
    ctxF.fillStyle = 'rgba(0,0,0,0.2)'; ctxF.fillRect(0,0,canvas.width,canvas.height);
    particles.forEach((p,i) => {
        p.x += Math.cos(p.a)*p.v; p.y += Math.sin(p.a)*p.v + 0.5; p.o -= 0.01;
        ctxF.globalAlpha = p.o; ctxF.fillStyle = p.c;
        ctxF.beginPath(); ctxF.arc(p.x, p.y, 2, 0, 7); ctxF.fill();
        if(p.o <= 0) particles.splice(i,1);
    });
    requestAnimationFrame(animate);
}
setInterval(() => {
    if(document.getElementById('modal').style.display !== 'none') {
        const x = Math.random()*canvas.width, y = Math.random()*canvas.height*0.5;
        const c = `hsl(${Math.random()*360},100%,50%)`;
        for(let i=0; i<30; i++) particles.push({x,y,c,a:Math.random()*6,v:Math.random()*4+1,o:1});
    }
}, 350);
canvas.width = window.innerWidth; canvas.height = window.innerHeight;
animate();