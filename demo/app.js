/* ===== PawTrace Demo - app.js ===== */
/* "清晨公园" — CartoDB Positron tiles, 5-tab nav */

// ===== Mock Data =====
const PARKS = [
  { name: '人民公园', city: '成都', lat: 30.6586, lng: 104.0553, count: 42 },
  { name: '浣花溪公园', city: '成都', lat: 30.6436, lng: 104.0353, count: 35 },
  { name: '锦城湖公园', city: '成都', lat: 30.5836, lng: 104.0653, count: 28 },
  { name: '桂溪生态公园', city: '成都', lat: 30.5636, lng: 104.0753, count: 38 },
  { name: '深圳湾公园', city: '深圳', lat: 22.5036, lng: 113.9653, count: 45 },
  { name: '莲花山公园', city: '深圳', lat: 22.5536, lng: 114.0553, count: 32 },
  { name: '中心公园', city: '深圳', lat: 22.5436, lng: 114.0653, count: 25 },
  { name: '荔枝公园', city: '深圳', lat: 22.5536, lng: 114.1053, count: 20 },
];

const DOG_TAGS_POOL = ['中小型犬', '幼犬', '胆小', '好动', '大型犬', '温顺', '活泼'];

const PLACES_DATA = [
  { name: '浣花溪公园', dist: '1.2km', note: '傍晚狗多，有大草坪', stars: 4.5 },
  { name: '锦城湖公园', dist: '2.5km', note: '周末人多，建议工作日去', stars: 4.0 },
  { name: '人民公园', dist: '0.8km', note: '有专门的狗狗活动区', stars: 4.8 },
  { name: '桂溪生态公园', dist: '3.1km', note: '草坪大，适合大型犬', stars: 4.2 },
];

let dogsData = [
  { id: 1, name: '豆豆', emoji: '🐕', breed: '柯基', size: '小型', age: '青年', color: '棕色', weight: 9.5, likes: ['零食', '奔跑'], tags: ['好动爱玩', '温顺'], vaccine: '已接种' },
  { id: 2, name: '旺财', emoji: '🐩', breed: '金毛', size: '大型', age: '青年', color: '黄色', weight: 28, likes: ['游泳', '社交'], tags: ['社会化良好', '活泼'], vaccine: '已接种' },
];

// ===== State =====
let currentTab = 'map';
let heatLayer = null;
let map = null;
let walkingPageMap = null;
let walkingTimer = null;
let walkingSeconds = 0;
let isWalkingActive = false;
let currentEditDogId = null;

// ===== Walk State (global遛狗状态) =====
let walkState = {
  isWalking: false,
  dogs: [],        // [{ id, name, breed, emoji }] 本次遛狗的所有狗（运行期挂 _lat/_lng）
  startLat: 0,
  startLng: 0,
  startTime: null,
};
let walkMapTimer = null;       // 地图遛狗计时器
let walkMoveTimer = null;      // 模拟移动计时器
let userMarker = null;         // 用户位置标记
let dogMarkers = [];           // 狗狗标记数组
let walkSeconds = 0;           // 地图遛狗秒数
let walkDistance = 0;          // 模拟距离(米)

// ===== Tactile Feedback =====
document.addEventListener('touchstart', (e) => {
  const interactive = e.target.closest('.place-card, .dog-card, .menu-item, .btn-option, .tag-item');
  if (interactive) interactive.classList.add('touching');
}, { passive: true });
document.addEventListener('touchend', () => {
  document.querySelectorAll('.touching').forEach(el => el.classList.remove('touching'));
}, { passive: true });

// ===== Init =====
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  initTabBar();
  initModals();
  initFilterModal();
  initWalkingPage();
  initEndWalkModal();
  initPlacesPage();
  initProfilePage();
  initDogsPage();
  initDogEditPage();
  updateStatusTime();
  setInterval(updateStatusTime, 60000);
});

// ===== Status Bar Time =====
function updateStatusTime() {
  const now = new Date();
  document.getElementById('statusTime').textContent =
    now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
}

// ===== Map (CartoDB Positron) =====
function initMap() {
  map = L.map('mapContainer', {
    center: [30.62, 104.06],
    zoom: 15,
    zoomControl: false,
    attributionControl: false,
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map);

  renderHeatmap();

  map.on('click', function () { hideSpotCard(); hideDogCard(); });

  // Park markers — warm blue circles with white border
  PARKS.forEach(park => {
    const marker = L.circleMarker([park.lat, park.lng], {
      radius: 9,
      fillColor: '#6BA3BE',
      fillOpacity: 0.55,
      color: '#fff',
      weight: 2.5,
      opacity: 0.9,
    }).addTo(map);

    marker.on('click', function (e) {
      L.DomEvent.stopPropagation(e);
      showSpotCard(park);
    });
  });

  // Locate button
  document.getElementById('btnLocate').addEventListener('click', () => {
    map.setView([30.62, 104.06], 15, { animate: true });
  });
}

function generateHeatPoints(parks, sizeFilter) {
  const points = [];
  parks.forEach(park => {
    let count = park.count;
    if (sizeFilter === '小型') count = Math.floor(count * 0.7);
    else if (sizeFilter === '中型') count = Math.floor(count * 0.85);
    else if (sizeFilter === '大型') count = Math.floor(count * 0.6);

    for (let i = 0; i < count; i++) {
      const lat = park.lat + (Math.random() - 0.5) * 0.015;
      const lng = park.lng + (Math.random() - 0.5) * 0.015;
      const intensity = 0.3 + Math.random() * 0.7;
      points.push([lat, lng, intensity]);
    }
  });
  return points;
}

function renderHeatmap(sizeFilter) {
  if (heatLayer) map.removeLayer(heatLayer);
  const points = generateHeatPoints(PARKS, sizeFilter);
  heatLayer = L.heatLayer(points, {
    radius: 25,
    blur: 20,
    maxZoom: 17,
    max: 1.0,
    gradient: {
      0.2: '#D4E8F0',
      0.4: '#A8D4E4',
      0.6: '#F4C8A8',
      0.8: '#F4A698',
      1.0: '#E8836F',
    },
  }).addTo(map);
}

// ===== Spot Card =====
function showSpotCard(park) {
  const card = document.getElementById('spotCard');
  document.getElementById('spotNameText').textContent = park.name;
  document.getElementById('spotSignal').innerHTML = '当前信号：<strong>' + park.count + '</strong>条';

  const tagsEl = document.getElementById('spotTags');
  const shuffled = [...DOG_TAGS_POOL].sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random() * 2));
  tagsEl.innerHTML = shuffled.map(t => `<span class="spot-tag">${t}</span>`).join('');

  card.classList.add('show');
}

function hideSpotCard() {
  document.getElementById('spotCard').classList.remove('show');
}

// ===== Dog Info Card =====
const COLOR_HEX = {
  '黄色': '#F7C873', '白色': '#F1EFEA', '黑色': '#4A4A4A', '棕色': '#A5713F',
  '花色': 'conic-gradient(#fff 0 25%, #4A4A4A 0 50%, #fff 0 75%, #4A4A4A 0)',
  '灰色': '#B8B8B8',
};

function showDogCard(dogId) {
  const dog = dogsData.find(d => d.id === dogId);
  if (!dog) return;
  hideSpotCard();

  document.getElementById('dogInfoAvatar').textContent = dog.emoji;
  document.getElementById('dogInfoName').textContent = dog.name;
  document.getElementById('dogInfoBreed').textContent =
    dog.breed + ' · ' + dog.size + '犬 · ' + dog.age + ' · ' + (dog.weight ? dog.weight + 'kg' : '-');
  document.getElementById('dogInfoVaccine').textContent = dog.vaccine;

  const colorRow = document.getElementById('dogInfoColorRow');
  if (dog.color) {
    document.getElementById('dogInfoColorDot').style.background = COLOR_HEX[dog.color] || '#F7C873';
    document.getElementById('dogInfoColorText').textContent = dog.color;
    colorRow.style.display = '';
  } else {
    colorRow.style.display = 'none';
  }

  const tagsRow = document.getElementById('dogInfoTagsRow');
  if (dog.tags && dog.tags.length) {
    document.getElementById('dogInfoTags').innerHTML = dog.tags.map(t => `<span class="dog-tag trait">${t}</span>`).join('');
    tagsRow.style.display = '';
  } else {
    tagsRow.style.display = 'none';
  }

  const likesRow = document.getElementById('dogInfoLikesRow');
  if (dog.likes && dog.likes.length) {
    document.getElementById('dogInfoLikes').innerHTML = dog.likes.map(t => `<span class="dog-tag trait">${t}</span>`).join('');
    likesRow.style.display = '';
  } else {
    likesRow.style.display = 'none';
  }

  document.getElementById('dogInfoCard').classList.add('show');
  document.getElementById('btnDogInfoEdit').onclick = () => { hideDogCard(); openDogEdit(dog.id); };
}

function hideDogCard() {
  document.getElementById('dogInfoCard').classList.remove('show');
}

// ===== Tab Bar (5 tabs) =====
function initTabBar() {
  document.querySelectorAll('.tab-item').forEach(tab => {
    tab.addEventListener('click', () => {
      const page = tab.dataset.page;
      switchTab(page);
    });
  });
}

function switchTab(page) {
  if (page === currentTab) return;
  currentTab = page;

  document.querySelectorAll('.tab-item').forEach(t => t.classList.toggle('active', t.dataset.page === page));

  const pageMap = { map: 'pageMap', places: 'pagePlaces', walking: 'pageWalking', profile: 'pageProfile' };
  Object.entries(pageMap).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (key === page) {
      el.classList.add('active');
      el.classList.remove('slide-left');
    } else {
      el.classList.remove('active');
    }
  });

  // Show tab bar
  document.getElementById('tabBar').style.display = '';

  if (page === 'map') {
    setTimeout(() => {
      map.invalidateSize();
      // 如果有遛狗状态，恢复地图标记
      if (walkState.isWalking) {
        showWalkMarkersOnMap();
      }
    }, 350);
  }
  if (page === 'walking') {
    renderDogPageSelectList();
    initWalkingPageMap();
  }
}

// ===== Modals =====
function initModals() {
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.close;
      closeModal(modalId);
    });
  });

  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('show');
        if (map) {
          map.dragging.enable();
          map.touchZoom.enable();
          map.doubleClickZoom.enable();
          map.scrollWheelZoom.enable();
          map.boxZoom.enable();
          map.keyboard.enable();
        }
      }
    });
    const sheet = overlay.querySelector('.modal-sheet');
    if (sheet) {
      sheet.addEventListener('click', (e) => e.stopPropagation());
    }
  });
}

function openModal(id) {
  document.getElementById(id).classList.add('show');
  if (map) {
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    map.scrollWheelZoom.disable();
    map.boxZoom.disable();
    map.keyboard.disable();
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
  if (map) {
    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();
  }
}

// ===== Filter Modal =====
function initFilterModal() {
  document.getElementById('btnFilter').addEventListener('click', () => openModal('filterModal'));

  document.querySelectorAll('#filterSize .btn-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#filterSize .btn-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('#filterExcludeTags .tag-item').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  document.getElementById('btnFilterReset').addEventListener('click', () => {
    document.querySelectorAll('#filterSize .btn-option').forEach((b, i) => b.classList.toggle('active', i === 0));
    document.querySelectorAll('#filterExcludeTags .tag-item').forEach(b => b.classList.remove('active'));
  });

  document.getElementById('btnFilterConfirm').addEventListener('click', () => {
    const activeSize = document.querySelector('#filterSize .btn-option.active');
    const sizeVal = activeSize ? activeSize.dataset.val : 'all';
    renderHeatmap(sizeVal === 'all' ? null : sizeVal);
    closeModal('filterModal');

    heatLayer.setOptions({ opacity: 0.3 });
    setTimeout(() => heatLayer.setOptions({ opacity: 1 }), 200);
  });
}

// ===== Walking Page (dedicated tab) =====
function initWalkingPage() {
  document.getElementById('addDogPageInline').addEventListener('click', () => {
    switchTab('profile');
    setTimeout(() => openDogEdit(null), 300);
  });

  document.getElementById('btnStartWalkPage').addEventListener('click', startWalkingPage);
  document.getElementById('btnEndWalkPage').addEventListener('click', endWalkingPage);

  // 地图页"我正在遛狗"按钮 -> 切换到遛狗Tab
  document.getElementById('btnWalking').addEventListener('click', () => {
    if (walkState.isWalking) {
      // 已在遛狗中，直接切到地图看状态
      switchTab('map');
    } else {
      switchTab('walking');
    }
  });
}

function renderDogPageSelectList() {
  const list = document.getElementById('dogPageSelectList');
  list.innerHTML = dogsData.map(dog => `
    <div class="dog-select-card" data-dog-id="${dog.id}">
      <div class="dog-select-avatar">${dog.emoji}</div>
      <div class="dog-select-info">
        <div class="dog-select-name">${dog.name}</div>
        <div class="dog-select-desc">${dog.breed} · ${dog.size} · ${dog.tags.join('、')}</div>
      </div>
      <div class="dog-select-check"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></div>
    </div>
  `).join('');

  list.querySelectorAll('.dog-select-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.toggle('selected');
    });
  });
}

function initWalkingPageMap() {
  const container = document.getElementById('walkingPageMap');
  if (walkingPageMap) {
    walkingPageMap.remove();
    walkingPageMap = null;
  }
  setTimeout(() => {
    walkingPageMap = L.map(container, {
      center: [30.62, 104.06],
      zoom: 13,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      touchZoom: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
    }).addTo(walkingPageMap);
    L.circleMarker([30.62, 104.06], {
      radius: 6, fillColor: '#6BA3BE', fillOpacity: 1, color: '#fff', weight: 2,
    }).addTo(walkingPageMap);
  }, 100);
}

function startWalkingPage() {
  const selected = document.querySelectorAll('#dogPageSelectList .dog-select-card.selected');
  if (selected.length === 0) {
    alert('请至少选择一只狗狗');
    return;
  }

  // 收集所有选中的狗
  const selectedDogs = [];
  selected.forEach(card => {
    const dog = dogsData.find(d => d.id === parseInt(card.dataset.dogId));
    if (dog) selectedDogs.push({ id: dog.id, name: dog.name, breed: dog.breed, emoji: dog.emoji });
  });
  if (selectedDogs.length === 0) return;

  // 记录遛狗状态（Demo 无真实定位，「当前位置」固定为城市中心人民公园附近）
  walkState.isWalking = true;
  walkState.dogs = selectedDogs;
  walkState.startLat = 30.62;
  walkState.startLng = 104.06;
  walkState.startTime = new Date();

  // 更新遛狗页面的UI
  document.getElementById('btnStartWalkPage').style.display = 'none';
  document.querySelector('#pageWalking .walking-location').style.display = 'none';
  document.querySelector('#pageWalking .dog-select-list').style.display = 'none';
  document.querySelector('#pageWalking .add-dog-inline').style.display = 'none';
  document.getElementById('walkingPageActive').style.display = '';

  isWalkingActive = true;
  walkingSeconds = 0;
  const progress = document.getElementById('timerProgressPage');
  const circumference = 2 * Math.PI * 54;

  walkingTimer = setInterval(() => {
    walkingSeconds++;
    const mins = Math.floor(walkingSeconds / 60);
    const secs = walkingSeconds % 60;
    document.getElementById('timerDurationPage').textContent =
      mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');

    // 圆环每 90 秒循环一圈（演示动画），遛狗不会自动结束，需用户手动结束
    const offset = circumference * ((walkingSeconds % 90) / 90);
    progress.style.strokeDashoffset = -offset;
  }, 1000);

  // 自动切换到地图Tab
  switchTab('map');
}

function endWalkingPage() {
  clearInterval(walkingTimer);
  isWalkingActive = false;
  walkingSeconds = 0;
  document.getElementById('timerProgressPage').style.strokeDashoffset = 0;

  // Reset UI
  document.getElementById('walkingPageActive').style.display = 'none';
  document.getElementById('btnStartWalkPage').style.display = '';
  document.querySelector('#pageWalking .walking-location').style.display = '';
  document.querySelector('#pageWalking .dog-select-list').style.display = '';
  document.querySelector('#pageWalking .add-dog-inline').style.display = '';

  // 清除遛狗状态
  walkState.isWalking = false;
  walkState.dogs = [];
  walkState.startTime = null;

  // 清除地图上的标记
  hideWalkMarkers();

  // Re-render list to clear selections
  renderDogPageSelectList();
}

// ===== Walk Markers on Map =====
function showWalkMarkersOnMap() {
  if (!walkState.isWalking || !map) return;

  const isRestore = walkMapTimer !== null; // 是否是tab切换恢复

  // 清除旧标记（如果存在）
  if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
  dogMarkers.forEach(m => { if (m) map.removeLayer(m); });
  dogMarkers = [];

  const startLat = walkState.startLat;
  const startLng = walkState.startLng;

  // 用户位置标记（蓝色脉冲圆点）
  const userIcon = L.divIcon({
    className: '',
    html: '<div class="user-location-marker"><div class="user-location-pulse"></div><div class="user-location-dot"></div></div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
  userMarker = L.marker([startLat, startLng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);

  // 多只狗狗标记：在起点附近错开排布（约 60~90 米间隔），互不重叠、可独立点击
  walkState.dogs.forEach((dog, i) => {
    if (!dog._lat) { dog._lat = startLat + 0.0007 + i * 0.0009; dog._lng = startLng + 0.0005 + i * 0.0007; }
    const dogIcon = L.divIcon({
      className: '',
      html: `<div class="dog-map-marker"><div class="dog-map-icon">${dog.emoji}</div><div class="dog-map-name">${dog.name}</div></div>`,
      iconSize: [50, 56],
      iconAnchor: [25, 28],
    });
    const marker = L.marker([dog._lat, dog._lng], { icon: dogIcon, zIndexOffset: 900 + i }).addTo(map);
    marker.on('click', function (e) {
      L.DomEvent.stopPropagation(e);
      showDogCard(dog.id);
    });
    dogMarkers.push(marker);
  });

  // 平滑飞到当前位置
  map.flyTo([startLat, startLng], 17, { duration: 1.2 });

  // 显示遛狗状态栏
  updateWalkStatusBar(true);

  // 仅在首次启动时启动计时器和移动
  if (!isRestore) {
    walkSeconds = 0;
    walkDistance = 0;
    clearInterval(walkMapTimer);
    walkMapTimer = setInterval(() => {
      walkSeconds++;
      walkDistance += Math.floor(1.2 + Math.random() * 0.8);
      updateWalkStatusBar(false);
    }, 1000);

    // 模拟移动（每4秒每只狗独立小幅移动）
    clearInterval(walkMoveTimer);
    walkMoveTimer = setInterval(() => {
      if (!walkState.isWalking || dogMarkers.length === 0) return;
      walkState.dogs.forEach((dog, i) => {
        if (!dogMarkers[i]) return;
        dog._lat += (Math.random() - 0.4) * 0.0002;
        dog._lng += (Math.random() - 0.4) * 0.0002;
        dogMarkers[i].setLatLng([dog._lat, dog._lng]);
      });
    }, 4000);
  }
}

function hideWalkMarkers() {
  if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
  dogMarkers.forEach(m => { if (map && m) map.removeLayer(m); });
  dogMarkers = [];
  clearInterval(walkMapTimer);
  clearInterval(walkMoveTimer);
  walkMapTimer = null;
  walkMoveTimer = null;
  hideDogCard();

  // 隐藏状态栏
  document.getElementById('walkStatusBar').style.display = 'none';
}

function updateWalkStatusBar(show) {
  const bar = document.getElementById('walkStatusBar');
  if (show) {
    bar.style.display = '';
    document.getElementById('walkStatusDogEmoji').innerHTML =
      walkState.dogs.map(d => `<span class="walk-status-dog-emoji">${d.emoji}</span>`).join('');
    document.getElementById('walkStatusDogName').textContent =
      walkState.dogs.map(d => d.name).join('、');
  }
  // 更新时间和距离
  const mins = Math.floor(walkSeconds / 60);
  const secs = walkSeconds % 60;
  document.getElementById('walkStatusTime').textContent =
    mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
  const distText = walkDistance >= 1000
    ? (walkDistance / 1000).toFixed(1) + 'km'
    : walkDistance + 'm';
  document.getElementById('walkStatusDist').textContent = distText;
}

// ===== End Walk from Map =====
function endWalkFromMap() {
  // 填充本次遛狗的所有狗
  document.getElementById('endWalkDogs').innerHTML =
    walkState.dogs.map(d => `<span class="end-walk-dog">${d.emoji}</span>`).join('');

  // 更新确认弹窗的数据
  const mins = Math.floor(walkSeconds / 60);
  const secs = walkSeconds % 60;
  document.getElementById('endWalkDuration').textContent =
    mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
  const distText = walkDistance >= 1000
    ? (walkDistance / 1000).toFixed(1) + 'km'
    : walkDistance + 'm';
  document.getElementById('endWalkDistance').textContent = distText;
  openModal('endWalkModal');
}

function confirmEndWalk() {
  closeModal('endWalkModal');

  // 清除地图标记
  hideWalkMarkers();

  // 清除遛狗状态
  walkState.isWalking = false;
  walkState.dogs = [];
  walkState.startTime = null;
  walkSeconds = 0;
  walkDistance = 0;

  // 同步清除遛狗页面的UI
  isWalkingActive = false;
  clearInterval(walkingTimer);
  walkingSeconds = 0;
  document.getElementById('timerProgressPage').style.strokeDashoffset = 0;
  document.getElementById('walkingPageActive').style.display = 'none';
  document.getElementById('btnStartWalkPage').style.display = '';
  document.querySelector('#pageWalking .walking-location').style.display = '';
  document.querySelector('#pageWalking .dog-select-list').style.display = '';
  document.querySelector('#pageWalking .add-dog-inline').style.display = '';
  renderDogPageSelectList();
}

// ===== Init End Walk Modal =====
function initEndWalkModal() {
  document.getElementById('btnEndWalkFromMap').addEventListener('click', endWalkFromMap);
  document.getElementById('btnCancelEndWalk').addEventListener('click', () => closeModal('endWalkModal'));
  document.getElementById('btnConfirmEndWalk').addEventListener('click', confirmEndWalk);
}

// ===== Places Page =====
function initPlacesPage() {
  const list = document.getElementById('placesList');
  list.innerHTML = PLACES_DATA.map((p, i) => `
    <div class="place-card animate-in" style="animation-delay: ${i * 0.06}s">
      <div class="place-card-inner">
        <div class="place-card-top">
          <span class="place-card-name">${p.name}</span>
          <span class="place-card-dist">${p.dist}</span>
        </div>
        <div class="place-card-note">${p.note}</div>
        <span class="place-card-tag">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
          推荐
          <span class="place-card-stars">${renderStars(p.stars)}</span>
        </span>
      </div>
    </div>
  `).join('');

  document.getElementById('btnAddPlace').addEventListener('click', () => {
    alert('标记新地点功能开发中...');
  });
}

function renderStars(rating) {
  let html = '';
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  for (let i = 0; i < full; i++) {
    html += '<svg viewBox="0 0 24 24" fill="#F7C873" stroke="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
  }
  if (half) {
    html += '<svg viewBox="0 0 24 24" fill="none" stroke="#F7C873" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/><clipPath id="half"><rect x="0" y="0" width="12" height="24"/></clipPath><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77" clip-path="url(#half)" fill="#F7C873"/></svg>';
  }
  return html;
}

// ===== Profile Page =====
function initProfilePage() {
  document.getElementById('menuMyDogs').addEventListener('click', () => {
    openDogsPage();
  });
}

function openDogsPage() {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('pageDogs').classList.add('active');
  document.getElementById('tabBar').style.display = 'none';
  renderDogsList();
}

// ===== Dogs Page =====
function initDogsPage() {
  document.getElementById('btnBackFromDogs').addEventListener('click', () => {
    document.getElementById('pageDogs').classList.remove('active');
    document.getElementById('pageProfile').classList.add('active');
    document.getElementById('tabBar').style.display = '';
  });

  document.getElementById('btnAddDog').addEventListener('click', () => {
    openDogEdit(null);
  });
}

function renderDogsList() {
  const list = document.getElementById('dogsList');
  list.innerHTML = dogsData.map((dog, i) => `
    <div class="dog-card animate-in" style="animation-delay: ${i * 0.1}s" onclick="openDogEdit(${dog.id})">
      <div class="dog-card-avatar">${dog.emoji}</div>
      <div class="dog-card-info">
        <div class="dog-card-name">${dog.name}</div>
        <div class="dog-card-tags">
          <span class="dog-tag breed">${dog.breed}</span>
          <span class="dog-tag size">${dog.size}型</span>
          ${dog.tags.map(t => `<span class="dog-tag trait">${t}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');
}

// ===== Dog Edit Page =====
function initDogEditPage() {
  document.getElementById('btnBackFromEdit').addEventListener('click', () => {
    document.getElementById('pageDogEdit').classList.remove('active');
    document.getElementById('pageDogs').classList.add('active');
    renderDogsList();
  });

  document.querySelectorAll('#editSize .btn-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#editSize .btn-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('#editAge .btn-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#editAge .btn-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('#editVaccine .btn-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#editVaccine .btn-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('#editTags .tag-item').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  document.querySelectorAll('#editColor .btn-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#editColor .btn-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  document.querySelectorAll('#editLikes .tag-item').forEach(btn => {
    btn.addEventListener('click', () => btn.classList.toggle('active'));
  });

  const avatarEmojis = ['🐕', '🐩', '🐶', '🦮', '🐕‍🦺', '🐾'];
  let avatarIdx = 0;
  document.getElementById('editAvatar').addEventListener('click', () => {
    avatarIdx = (avatarIdx + 1) % avatarEmojis.length;
    document.getElementById('editAvatar').textContent = avatarEmojis[avatarIdx];
  });

  document.getElementById('btnSaveDog').addEventListener('click', () => {
    const name = document.getElementById('editName').value.trim() || '未命名';
    const sizeBtn = document.querySelector('#editSize .btn-option.active');
    const ageBtn = document.querySelector('#editAge .btn-option.active');
    const vaccineBtn = document.querySelector('#editVaccine .btn-option.active');
    const activeTags = [...document.querySelectorAll('#editTags .tag-item.active')].map(b => b.dataset.tag);
    const colorBtn = document.querySelector('#editColor .btn-option.active');
    const weightVal = document.getElementById('editWeight').value.trim();
    const activeLikes = [...document.querySelectorAll('#editLikes .tag-item.active')].map(b => b.dataset.tag);
    const emoji = document.getElementById('editAvatar').textContent;

    const existing = currentEditDogId ? dogsData.find(d => d.id === currentEditDogId) : null;

    const dog = {
      id: currentEditDogId || Date.now(),
      name,
      emoji,
      breed: existing ? existing.breed : '未知',
      size: sizeBtn ? sizeBtn.dataset.val : '小型',
      age: ageBtn ? ageBtn.dataset.val : '青年',
      tags: activeTags.length ? activeTags : ['好动爱玩'],
      vaccine: vaccineBtn ? vaccineBtn.dataset.val : '未接种',
      color: colorBtn ? colorBtn.dataset.val : '黄色',
      weight: weightVal === '' ? null : (parseFloat(weightVal) || null),
      likes: activeLikes,
    };

    if (currentEditDogId) {
      const idx = dogsData.findIndex(d => d.id === currentEditDogId);
      if (idx >= 0) dogsData[idx] = dog;
    } else {
      dogsData.push(dog);
    }

    document.getElementById('pageDogEdit').classList.remove('active');
    document.getElementById('pageDogs').classList.add('active');
    renderDogsList();
  });
}

function openDogEdit(dogId) {
  document.getElementById('pageDogs').classList.remove('active');
  document.getElementById('pageDogEdit').classList.add('active');

  document.querySelectorAll('#editSize .btn-option, #editAge .btn-option, #editVaccine .btn-option').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#editTags .tag-item, #editColor .btn-option, #editLikes .tag-item').forEach(b => b.classList.remove('active'));
  document.getElementById('editName').value = '';
  document.getElementById('editWeight').value = '';
  document.getElementById('editAvatar').textContent = '🐕';

  if (dogId) {
    const dog = dogsData.find(d => d.id === dogId);
    if (dog) {
      currentEditDogId = dog.id;
      document.getElementById('dogEditTitle').textContent = '编辑狗狗';
      document.getElementById('editName').value = dog.name;
      document.getElementById('editAvatar').textContent = dog.emoji;

      const sizeBtn = document.querySelector(`#editSize .btn-option[data-val="${dog.size}"]`);
      if (sizeBtn) sizeBtn.classList.add('active');

      const ageBtn = document.querySelector(`#editAge .btn-option[data-val="${dog.age}"]`);
      if (ageBtn) ageBtn.classList.add('active');

      const vaccineBtn = document.querySelector(`#editVaccine .btn-option[data-val="${dog.vaccine}"]`);
      if (vaccineBtn) vaccineBtn.classList.add('active');

      dog.tags.forEach(tag => {
        const tagBtn = document.querySelector(`#editTags .tag-item[data-tag="${tag}"]`);
        if (tagBtn) tagBtn.classList.add('active');
      });

      const colorBtn = document.querySelector(`#editColor .btn-option[data-val="${dog.color}"]`);
      if (colorBtn) colorBtn.classList.add('active');
      if (dog.weight) document.getElementById('editWeight').value = dog.weight;
      (dog.likes || []).forEach(like => {
        const likeBtn = document.querySelector(`#editLikes .tag-item[data-tag="${like}"]`);
        if (likeBtn) likeBtn.classList.add('active');
      });
    }
  } else {
    currentEditDogId = null;
    document.getElementById('dogEditTitle').textContent = '添加狗狗';
    document.querySelector('#editSize .btn-option[data-val="小型"]').classList.add('active');
    document.querySelector('#editAge .btn-option[data-val="青年"]').classList.add('active');
    document.querySelector('#editVaccine .btn-option[data-val="未接种"]').classList.add('active');
    document.querySelector('#editColor .btn-option[data-val="黄色"]').classList.add('active');
  }
}
