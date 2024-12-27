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

const airQualityDataURL = 'https://sta.colife.org.tw/STA_AirQuality_EPAIoT/v1.0/Datastreams?$select=name,description&$expand=Thing($select=name,properties/stationID,properties/city),Thing/Locations($select=location/coordinates),Observations($orderby=phenomenonTime%20desc;$top=1;$select=phenomenonTime,result)&$filter=name%20eq%20%27PM2.5%27&$count=true';

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

    let stationCount = 0;

    allData.forEach(item => {
        const coordinates = item.Thing.Locations[0].location.coordinates;
        const pm25Value = item.Observations[0]?.result || 0;
        const airQualityLevel = getAirQualityLevel(pm25Value);
        const cityName = item.Thing.properties.city || "未知";

        if ((selectedCity === '所有' || cityName === selectedCity) && 
            (selectedQuality === '所有' || airQualityLevel === selectedQuality)) {
            
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

            stationCount++;
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

updateMap();