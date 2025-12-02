window.onload = function() {
    showModal(); // 自動顯示模態窗口
};

function showModal() {
    const modal = document.getElementById('modal');
    modal.style.display = "block"; // 顯示模態窗口
}

document.querySelector('.close').onclick = function() {
    const modal = document.getElementById('modal');
    modal.style.display = "none"; // 關閉模態窗口
};

function updateTime() {
    const now = new Date();
    const options = { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: false // 使用 24 小時制
    };
    const formattedTime = now.toLocaleString('zh-TW', options);
    document.getElementById('current-time').innerText = formattedTime;
}

// 每秒更新日期和時間
setInterval(updateTime, 1000);
updateTime();  // 初始顯示

const map = L.map('map').setView([25.038, 121.5645], 8);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(map);

let selectedCity = '所有';
let selectedQuality = '所有';
let currentPage = 0;
const pageSize = 2000;
let allData = [];
let autoLoadInterval;
let stationIDFilter = ''; // 儲存測站 ID 篩選

const airQualityDataURL = 'https://sta.colife.org.tw/STA_AirQuality_EPAIoT/v1.0/Datastreams?$select=name,description&$expand=Thing($select=name,properties/stationID,properties/areaType),Thing/Locations($select=location/coordinates),Observations($orderby=phenomenonTime%20desc;$top=1;$select=phenomenonTime,result)&$filter=name%20eq%20%27PM2.5%27&$count=true';

async function fetchAirQualityData(page) {
    try {
        const response = await fetch(`${airQualityDataURL}&$top=${pageSize}&$skip=${page * pageSize}`);
        if (!response.ok) {
            throw new Error('API請求失敗：' + response.statusText);
        }
        const data = await response.json();
        return data.value;
    } catch (error) {
        document.getElementById('error-message').innerText = error.message;
        console.error('Fetch error:', error);
        return [];
    }
}

function getColor(level) {
    switch (level) {
        case '良好': return 'green';
        case '普通': return 'yellow';
        case '不良': return 'orange';
        case '非常不良': return 'red';
        case '危害': return 'purple';
        default: return 'grey';
    }
}

function getAirQualityLevel(pm25Value) {
    if (pm25Value <= 35) return '良好';
    if (pm25Value <= 75) return '普通';
    if (pm25Value <= 150) return '不良';
    if (pm25Value <= 250) return '非常不良';
    return '危害';
}

async function updateMap() {
    const airQualityData = await fetchAirQualityData(currentPage);
    if (airQualityData.length === 0) {
        document.getElementById('load-more').style.display = 'none';
        return;
    }

    allData = allData.concat(airQualityData);
    
    map.eachLayer(function (layer) {
        if (layer instanceof L.Marker || layer instanceof L.CircleMarker) {
            map.removeLayer(layer);
        }
    });
    document.getElementById('station-info').innerHTML = '';

    allData.forEach(item => {
        const coordinates = item.Thing.Locations[0].location.coordinates;
        const pm25Value = item.Observations[0]?.result || 0;
        const airQualityLevel = getAirQualityLevel(pm25Value);
        const cityName = item.Thing.properties.areaType || "未知";

        // 檢查篩選條件
        if ((selectedCity === '所有' || cityName === selectedCity) && 
            (selectedQuality === '所有' || airQualityLevel === selectedQuality) &&
            (stationIDFilter === '' || item.Thing.properties.stationID.includes(stationIDFilter))) { // 這裡檢查 stationIDFilter
            
            const marker = L.circleMarker([coordinates[1], coordinates[0]], {
                radius: 8,
                fillColor: getColor(airQualityLevel),
                color: getColor(airQualityLevel),
                fillOpacity: 0.5,
                stroke: false
            }).addTo(map);

            marker.bindPopup(`<b>${item.Thing.name}</b><br>PM2.5: ${pm25Value} µg/m³<br>空氣品質: ${airQualityLevel}<br>縣市: ${cityName}`);
            
            const stationInfo = document.createElement('div');
            stationInfo.innerHTML = `<b>${item.Thing.name}</b> (${cityName}): PM2.5: ${pm25Value} µg/m³, 空氣品質: ${airQualityLevel}`;
            document.getElementById('station-info').appendChild(stationInfo);
        }
    });

    updateChart();
}

function updateChart() {
    const filteredData = allData.filter(item => {
        const pm25Value = item.Observations[0]?.result || 0;
        const airQualityLevel = getAirQualityLevel(pm25Value);
        const cityName = item.Thing.properties.city || "未知";
        return (selectedCity === '所有' || cityName === selectedCity) && 
               (selectedQuality === '所有' || airQualityLevel === selectedQuality);
    });

    const stationCountByQuality = {
        '良好': 0,
        '普通': 0,
        '不良': 0,
        '非常不良': 0,
        '危害': 0
    };

    filteredData.forEach(item => {
        const pm25Value = item.Observations[0]?.result || 0;
        const airQualityLevel = getAirQualityLevel(pm25Value);
        stationCountByQuality[airQualityLevel]++;
    });

    const ctx = document.getElementById('station-chart').getContext('2d');
    const chartData = {
        labels: Object.keys(stationCountByQuality),
        datasets: [{
            label: '各空氣品質等級的測站數量',
            data: Object.values(stationCountByQuality),
            backgroundColor: [
                'rgba(75, 192, 192, 0.2)',
                'rgba(255, 206, 86, 0.2)',
                'rgba(255, 99, 132, 0.2)',
                'rgba(255, 159, 64, 0.2)',
                'rgba(153, 102, 255, 0.2)'
            ],
            borderColor: [
                'rgba(75, 192, 192, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(255, 99, 132, 1)',
                'rgba(255, 159, 64, 1)',
                'rgba(153, 102, 255, 1)'
            ],
            borderWidth: 1
        }]
    };

    if (window.stationChart) {
        window.stationChart.data.datasets[0].data = Object.values(stationCountByQuality);
        window.stationChart.update();
    } else {
        window.stationChart = new Chart(ctx, {
            type: 'bar',
            data: chartData,
            options: {
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }
}

document.getElementById('city-select').addEventListener('change', (event) => {
    selectedCity = event.target.value;
    currentPage = 0;
    allData = [];
    updateMap();
});

document.getElementById('quality-select').addEventListener('change', (event) => {
    selectedQuality = event.target.value;
    currentPage = 0;
    allData = [];
    updateMap();
});

// 新增測站 ID 輸入監聽器
document.getElementById('station-id').addEventListener('input', (event) => {
    stationIDFilter = event.target.value.trim(); // 更新測站 ID 篩選
    currentPage = 0; // 重置當前頁面
    allData = []; // 清空數據
    updateMap(); // 更新地圖
});

document.getElementById('load-more').addEventListener('click', () => {
    currentPage++;
    updateMap();
});

document.getElementById('auto-load').addEventListener('click', () => {
    if (autoLoadInterval) {
        clearInterval(autoLoadInterval);
        autoLoadInterval = null;
        document.getElementById('auto-load').innerText = '自動加載資料';
    } else {
        autoLoadInterval = setInterval(() => {
            currentPage++;
            updateMap();
        }, 500);
        document.getElementById('auto-load').innerText = '停止自動加載資料';
    }
});

document.getElementById('show-chart').addEventListener('click', () => {
    document.getElementById('chart-container').style.display = 'block';
    updateChart();
});

document.getElementById('chart-close').addEventListener('click', () => {
    document.getElementById('chart-container').style.display = 'none';
});

document.getElementById('legend-toggle').addEventListener('click', () => {
    const legendContainer = document.getElementById('legend-container');
    if (legendContainer.style.display === 'none') {
        legendContainer.style.display = 'block';
        document.getElementById('legend-toggle').innerText = '(隱藏)';
    } else {
        legendContainer.style.display = 'none';
        document.getElementById('legend-toggle').innerText = '(顯示)';
    }
});

document.getElementById('locate-btn').addEventListener('click', () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;
            map.setView([lat, lon], 13);
            fetchCityFromCoordinates(lat, lon);
        }, () => {
            alert("無法獲取位置");
        });
    } else {
        alert("此瀏覽器不支援地理定位");
    }
});

async function fetchCityFromCoordinates(lat, lon) {
    try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
        if (!response.ok) {
            throw new Error('反向地理編碼失敗：' + response.statusText);
        }
        const data = await response.json();
        const city = data.address.city || data.address.town || data.address.village || '未知';
        
        document.getElementById('city-select').value = city;
        selectedCity = city;
        currentPage = 0;
        allData = [];
        updateMap();
    } catch (error) {
        document.getElementById('error-message').innerText = error.message;
        console.error('Fetch error:', error);
    }
}

updateMap();  // 初始載入地圖

let fireworksActive = false;
const MAX_PARTICLES = 50; // 最大粒子數量
const MAX_SECONDARY_PARTICLES = 20; // 最大二次爆炸粒子數量
const colors = ['#FF3333', '#FF9933', '#FFFF33', '#33FF33', '#33FFFF', '#3333FF', '#9933FF']; // 可用顏色

function drawShape(ctx, x, y, size, shape) {
    ctx.beginPath();
    if (shape === 'circle') {
        ctx.arc(x, y, size, 0, Math.PI * 2);
    } else if (shape === 'square') {
        ctx.rect(x - size / 2, y - size / 2, size, size);
    } else if (shape === 'text') {
        ctx.font = `${size}px Arial`;
        ctx.fillText("LOVE", x - size * 2, y + size / 2);
    }
    ctx.fill();
}

function generateShapeParticles(shape, x, y, size, color) {
    const particles = [];
    const density = 30; // 增加密度，生成更多粒子

    if (shape === 'heart') {
        for (let i = 0; i < density; i++) {
            const angle = i * (Math.PI / density);
            const px = x + (16 * Math.sin(angle) ** 3);
            const py = y - (13 * Math.cos(angle) - 5 * Math.cos(2 * angle) - 2 * Math.cos(3 * angle) - Math.cos(4 * angle));
            particles.push({ x: px, y: py, color });
        }
    } else if (shape === 'L') {
        for (let i = 0; i < density; i++) {
            const px = x + (i % 10) * size; // L的形狀
            const py = y + (Math.floor(i / 10) * size);
            particles.push({ x: px, y: py, color });
        }
    } else if (shape === 'O') {
        for (let i = 0; i < density; i++) {
            const angle = i * (Math.PI / (density / 2));
            const px = x + (size * Math.cos(angle));
            const py = y + (size * Math.sin(angle));
            particles.push({ x: px, y: py, color });
        }
    } else if (shape === 'V') {
        for (let i = 0; i < density; i++) {
            const px = x - size + (i % 10) * (size / 5); // V的形狀
            const py = y + (Math.floor(i / 10) * size);
            particles.push({ x: px, y: py, color });
        }
    } else if (shape === 'E') {
        for (let i = 0; i < density; i++) {
            const px = x + (i % 10) * size; // E的形狀
            const py = y + (Math.floor(i / 10) * size);
            if (Math.floor(i / 10) % 2 === 0) {
                particles.push({ x: px, y: py, color });
            }
        }
    }

    return particles;
}

function showFireworks() {
    if (fireworksActive) return;
    fireworksActive = true;

    const modal = document.getElementById('modal');
    modal.style.display = 'block';

    const canvas = document.getElementById('fireworks-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = modal.clientWidth;
    canvas.height = modal.clientHeight;

    const particles = [];

    function createFirework(shape, x, y) {
        const size = Math.random() * 15 + 15; // 增加粒子大小
        const color = colors[Math.floor(Math.random() * colors.length)]; // 隨機顏色
        const shapeParticles = generateShapeParticles(shape, x, y, size, color);

        shapeParticles.forEach(({ x: px, y: py, color }) => {
            particles.push({
                x: px,
                y: py,
                speedX: (Math.random() - 0.5) * 4,
                speedY: (Math.random() - 0.5) * 4 - 2,
                alpha: 1,
                life: Math.random() * 40 + 80,
                size: Math.random() * 5 + 5, // 增加大小
                glow: true,
                color,
                launchX: x, // 紀錄發射點X
                launchY: y,  // 紀錄發射點Y
                trajectory: [], // 紀錄粒子的軌跡
                secondary: false // 標記是否為二次爆炸的粒子
            });
        });
    }

    function triggerSecondaryExplosion(particle) {
        // 檢查當前二次爆炸粒子的數量
        const secondaryParticlesCount = particles.filter(p => p.secondary).length;
        if (secondaryParticlesCount >= MAX_SECONDARY_PARTICLES) return; // 超過最大數量，不進行二次爆炸

        // 提高生成二次爆炸的機率
        const shouldExplode = Math.random() < 0.8; // 80% 機率生成二次爆炸粒子
        if (shouldExplode) {
            const numSecondaryParticles = Math.floor(Math.random() * 10) + 5; // 隨機數量的二次爆炸粒子
            for (let i = 0; i < numSecondaryParticles; i++) {
                const angle = Math.random() * Math.PI * 2; // 隨機角度
                const speed = Math.random() * 3 + 1; // 隨機速度
                const secondaryParticle = {
                    x: particle.x,
                    y: particle.y,
                    speedX: Math.cos(angle) * speed,
                    speedY: Math.sin(angle) * speed,
                    alpha: 1,
                    life: 50, // 二次爆炸粒子的生命
                    size: Math.random() * 5 + 2, // 隨機大小
                    glow: false,
                    color: '#FFFFFF', // 所有二次爆炸粒子使用白色
                    trajectory: [],
                    secondary: true // 標記為二次爆炸的粒子
                };
                particles.push(secondaryParticle);
            }
        }
    }

    function drawRocketTrajectory(startX, startY, endY) {
        ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)'; // 明顯的黃色
        ctx.lineWidth = 4; // 增加線條寬度
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(startX, endY);
        ctx.stroke();
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const particle = particles[i];

            // 更新位置
            particle.x += particle.speedX;
            particle.y += particle.speedY;
            particle.alpha -= 0.01; // 緩慢減少透明度
            particle.life -= 1;

            // 模擬重力
            particle.speedY += 0.1; // 增加重力影響

            // 紀錄軌跡
            particle.trajectory.push({ x: particle.x, y: particle.y });

            // 檢查是否需要觸發二次爆炸
            if (!particle.secondary && particle.life <= 0) {
                triggerSecondaryExplosion(particle);
                particle.secondary = true; // 標記為已經觸發過二次爆炸
            }

            if (particle.alpha <= 0 || particle.life <= 0) {
                particles.splice(i, 1);
            }
        }
    }

    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach(particle => {
            ctx.fillStyle = particle.color; // 使用單一顏色
            ctx.globalAlpha = particle.alpha;

            // 加入光芒效果
            if (particle.glow) {
                const glowSize = particle.size * 3; // 擴大光芒效果
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = glowSize;
            } else {
                ctx.shadowColor = 'transparent';
            }

            // 繪製粒子
            drawShape(ctx, particle.x, particle.y, particle.size, 'circle');

            // 繪製從發射點到粒子的曲線
            ctx.strokeStyle = particle.color; // 使用粒子的顏色
            ctx.lineWidth = 2; // 線條寬度
            ctx.globalAlpha = particle.alpha; // 設置線條透明度
            ctx.beginPath();

            // 繪製曲線
            if (particle.trajectory.length > 0) {
                ctx.moveTo(particle.launchX, particle.launchY);
                for (let point of particle.trajectory) {
                    ctx.lineTo(point.x, point.y);
                }
            }

            ctx.stroke();
        });
    }

    function animate() {
        updateParticles();
        draw();
        requestAnimationFrame(animate);
    }

    setInterval(() => {
        if (particles.length < MAX_PARTICLES) {
            const startX = Math.random() * canvas.width; // 隨機起始X坐標
            const launchHeight = Math.random() * (canvas.height * 0.4) + (canvas.height * 0.4); // 隨機發射高度

            // 繪製火箭軌跡
            drawRocketTrajectory(startX, canvas.height, launchHeight);

            // 隨機生成心形、字母L、O、V、E
            const shapes = ['heart', 'L', 'O', 'V', 'E'];
            const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
            createFirework(randomShape, startX, launchHeight); // 在隨機高度發射
        }
    }, 300); // 增加發射頻率

    setTimeout(() => {
        // 關閉浮動視窗並停止煙火效果
        modal.style.display = 'none';
        fireworksActive = false;
    }, 60000); // 60000毫秒（即1分鐘）
    
    document.querySelector('.close').onclick = function() {
        modal.style.display = 'none';
        fireworksActive = false; // 停止煙火效果
    };

    animate();
}

document.getElementById('happy-new-year').onclick = showFireworks;

showFireworks();