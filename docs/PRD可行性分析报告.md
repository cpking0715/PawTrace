# "狗遇"小程序 MVP PRD — 可行性分析与不足诊断

---

## 一、总体评价

**产品定位具有差异化价值**：零社交 + 匿名热力图的组合在宠物赛道是市场空白，"人与人零交互"的极简思路精准切入了社恐养狗人群的真实痛点。方向正确，但PRD在可执行层面存在多个关键缺口，**建议在补齐以下问题前不进入开发阶段**。

---

## 二、可行性判定

### 2.1 技术可行性：可行，但有前置风险

| 维度 | 判定 | 说明 |
|------|------|------|
| 地图 + 热力图 | **可行** | 腾讯地图 SDK 原生支持热力图可视化图层（`TMap.visualization.Heat`），微信小程序内置 map 组件直接可用 |
| GPS 定位与信号上报 | **可行** | `wx.getLocation` 可获取坐标，90分钟信号生命周期通过 Redis TTL + MongoDB TTL索引实现 |
| 信号聚合算法 | **可行但需设计** | 推荐 H3 六边形网格（Level 8/9）做空间聚合，配合 MongoDB 2dsphere 做范围查询 |
| 图片上传与审核 | **可行** | 腾讯云内容安全 API（25元/万次）+ 宠物识别 API（可选，20元/千次） |
| 后端架构 | **可行** | MVP 单体架构即可：Node.js + MongoDB + Redis + 腾讯云 COS，月成本约 150-300 元 |
| **微信位置权限审核** | **高风险** | `wx.getLocation` 审核驳回率约 65%，后台持续定位权限更难申请。**这是项目最大的技术阻塞风险** |

**关键技术风险**：
- `wx.getLocation` 审核极严，需准备详细录屏材料和用途说明
- 90分钟后台持续定位（`wx.onLocationChange`）需要后台定位权限，审核难度更高
- **建议 MVP 降级方案**：改为用户手动刷新位置（每次打开小程序获取一次），而非持续后台广播

#### 2.1.1 微信位置权限审核具体实现策略

**审核材料准备清单**：
1. **录屏材料**（必须）：完整录制从打开小程序→授权位置→展示热力图的全流程，时长控制在30秒内
2. **用途说明文档**：需明确写出"用于展示附近遛狗信号热力分布，非导航/非后台追踪"
3. **隐私协议**：需在小程序内通过 `wx.getPrivacySetting` 弹窗展示完整的位置信息收集说明
4. **场景截图**：至少提供3个场景截图——地图主页、信号上报页、热力图查看页

**降级方案实现细节**：
```
方案A（首选）：wx.getLocation（精确坐标，精度约10-50m）
  - 需在 app.json 声明 "requiredPrivateInfos": ["getLocation"]
  - 需配置 "permission.scope.userLocation": { "desc": "用于展示您附近的遛狗信号" }

方案B（降级）：wx.getFuzzyLocation（模糊坐标，精度约1-10km）
  - 无需额外权限声明，审核门槛低
  - 精度不足以支撑社区级热力图，仅用于城市级展示
  - 实现：信号坐标自动偏移至所属网格中心点，避免暴露精确位置

方案C（兜底）：用户手动选择位置
  - 通过腾讯地图 POI 搜索组件让用户手动选择公园/小区
  - 完全不依赖定位权限，零审核风险
  - 缺点：用户操作成本高，信号真实性降低
```

**MVP 推荐策略**：先以方案A提交审核；若被驳回，立即切换方案B+C组合——模糊定位展示城市级热力 + 手动选点上报信号。

#### 2.1.2 信号生命周期管理具体实现

```javascript
// 信号上报流程（前端）
async function broadcastSignal(dogId, location) {
  // 1. 获取GPS坐标
  const loc = await wx.getLocation({ type: 'gcj02', altitude: true });
  
  // 2. 计算H3索引（前端轻量计算）
  const h3Index = h3.latToH3(loc.latitude, loc.longitude, 8);
  
  // 3. 上报服务端
  await wx.request({
    url: '/api/signals',
    method: 'POST',
    data: {
      dogId,
      location: { lng: loc.longitude, lat: loc.latitude },
      h3Index,
      accuracy: loc.accuracy,
      timestamp: Date.now()
    }
  });
  
  // 4. 设置本地90分钟定时器提醒
  setTimeout(() => {
    wx.showToast({ title: '遛狗信号已过期', icon: 'none' });
  }, 90 * 60 * 1000);
}

// 信号过期处理（后端 Redis TTL 自动清理）
// Redis Key: signal:{userId}:{dogId}  TTL: 5400秒（90分钟）
// Redis 过期事件触发 → MongoDB 中 status 更新为 "expired"
```

### 2.2 产品可行性：有潜力，但核心逻辑缺失

| 维度 | 判定 | 说明 |
|------|------|------|
| 用户需求真实性 | **成立** | 社恐养狗人群确实存在"想偶遇但不想社交"的需求，竞品分析无直接对标产品 |
| 核心功能闭环 | **不完整** | 信号聚合算法（聚合半径、热点阈值、标签汇总方式、更新频率）完全未定义，开发无法启动 |
| 首次体验 | **高风险** | 新用户打开地图大概率看到空白——产品核心价值为零，缺少冷启动兜底方案 |
| 用户留存模型 | **不清晰** | 砍掉社交后，留存完全依赖"工具价值"（看热力选路线/时间），需验证是否足够 |
| 冷启动策略 | **缺失** | 地图产品价值取决于信号密度，PRD 仅一句话提及种子策略，缺乏可执行方案 |

### 2.3 法律合规可行性：存在阻塞性缺口

| 维度 | 判定 | 说明 |
|------|------|------|
| PIPL 合规 | **严重不足** | GPS 属敏感个人信息，缺少：单独同意弹窗、隐私保护指引、数据删除权、注销机制、个人信息保护影响评估 |
| 微信小程序审核 | **高风险** | 需企业主体（个人主体类目极少）、内容审核机制、隐私协议弹窗（`wx.getPrivacySetting`）、服务类目确认 |
| 免责条款效力 | **待验证** | 线下纠纷免责条款需法律专业人士起草，简单模板不具备法律约束力 |

#### 2.3.1 PIPL 合规具体实现方案

**必须实现的合规组件**：

| 组件 | 实现方式 | 触发时机 |
|------|---------|---------|
| 位置信息单独同意 | 自定义弹窗 + `wx.authorize` 组合 | 首次使用地图功能前 |
| 隐私保护指引 | `wx.getPrivacySetting` + 隐私协议页面 | 小程序启动时 |
| 数据删除/账号注销 | 设置页入口 → 身份验证 → 7日内完成删除 | 用户主动触发 |
| 个人信息保护影响评估（PIPIA） | 文档记录，留存备查 | 上线前完成 |

**位置信息单独同意弹窗实现**：
```
弹窗内容必须包含：
1. 收集目的：展示附近遛狗信号，生成热力分布图
2. 收集方式：GPS定位，获取经纬度坐标
3. 存储期限：信号有效期90分钟，过期自动删除
4. 第三方共享：不共享给任何第三方（或明确列出腾讯云）
5. 用户权利：可随时关闭定位权限、删除个人信息、注销账号
6. 操作按钮：「同意」/「仅使用期间允许」/「拒绝」
```

**账号注销流程**：
```
用户发起注销 → 身份验证（微信openId确认）→ 展示注销影响说明
→ 二次确认 → 标记账号进入7天冷静期 → 7天后自动执行：
  1. 删除所有狗狗档案
  2. 删除所有历史信号记录
  3. 删除已上传图片（COS）
  4. 清除 Redis 缓存
  5. 标记用户记录为已注销（保留openId防止重复注册，但不关联任何数据）
```

---

## 三、PRD 关键不足清单（按严重程度排序）

### P0 — 阻塞开发/上线

| # | 不足 | 影响 | 建议 |
|---|------|------|------|
| 1 | **信号聚合算法完全未定义** | 核心功能无法开发。聚合半径多少米？几个信号算热点？标签如何汇总？热力色阶如何映射？时间衰减策略？ | 必须定义：聚合半径（建议 H3 Level 8，约460m）、热点阈值（建议 >=2）、标签聚合方式（分布比例或Top N）、更新频率（建议30秒-1分钟轮询） |
| 2 | **PIPL 合规设计缺失** | 无法通过微信审核，存在法律风险 | 补充：位置信息单独同意弹窗、隐私保护指引配置、账号注销/数据删除流程、PIPIA 评估记录 |
| 3 | **微信位置权限审核策略缺失** | 项目可能被卡在审核环节无法上线 | 准备详细录屏材料；备选 `wx.getFuzzyLocation`；MVP 先做手动定位模式降低审核难度 |
| 4 | **内容审核方案未定义** | 微信审核硬性要求，所有 UGC 必须有审核机制 | 接入腾讯云内容安全 API，定义"先审后发"流程，设计审核拒绝的用户体验 |
| 5 | **关键用户流程缺失** | 开发无法完整实现 | 至少补充：注册登录流程、狗狗档案创建引导（必填项定义）、遛狗开始/结束交互流、权限拒绝降级方案 |
| 6 | **状态设计缺失** | 用户体验不完整 | 必须定义：空状态（地图无信号时展示什么）、加载状态、GPS信号弱状态、网络异常状态、审核中状态 |

### P1 — 严重影响 MVP 质量

| # | 不足 | 影响 | 建议 |
|---|------|------|------|
| 7 | **冷启动策略空白** | 上线即死亡——地图无信号，新用户立即流失 | 地理聚焦（2-3个种子公园）、种子用户招募（线下犬友群合作）、预填充 POI 数据、考虑展示"历史同时段热力" |
| 8 | **隐身/播报模式切换交互未定义** | 核心交互不清楚 | 定义：切换入口位置、默认状态（建议默认隐身）、切换确认弹窗、是否可设默认模式 |
| 9 | **地图交互细节缺失** | 开发需要猜测 | 定义：缩放级别与聚合关系、点击热点后的卡片内容、是否支持拖拽查看其他区域、筛选后如何更新地图 |
| 10 | **防作弊规则不具体** | 数据可信度无法保证 | 定义：GPS模拟检测策略、速率限制具体参数、速度异常检测（>30km/h自动终止）、作弊处罚梯度 |
| 11 | **通知权限策略缺失** | 信号过期、热点提醒等无法触达用户 | 设计订阅消息模板和授权引导时机 |
| 12 | **走失犬只/流浪动物模块范围模糊** | 可能拖累 MVP 进度 | 建议 MVP 只保留走失上报表单（不含公开信息流），流浪动物观察推迟到 V2 |

### P2 — 影响产品增长

| # | 不足 | 影响 | 建议 |
|---|------|------|------|
| 13 | **缺少微信分享机制** | 丧失核心增长引擎 | 设计"我正在 XX 公园遛狗"分享卡片，利用微信社交链传播 |
| 14 | **缺少天气集成** | 遛狗强依赖天气，影响使用频率 | 首页展示当前天气和遛狗适宜度 |
| 15 | **缺少时段趋势图** | 用户无法提前规划遛狗时间 | 展示某区域一周内各时段热力趋势，提升工具价值 |
| 16 | **举报机制不完整** | 虚假点位、不当照片无法处理 | 走失报告、狗狗照片、POI 都需要举报入口 |

---

## 四、产品设计建议

### 4.1 信号聚合算法（必须补充的核心定义）

```
输入：当前可视区域内所有 active 状态的遛狗信号
聚合方式：H3 Level 8 六边形网格（边长约460m）
热点阈值：同一 H3 cell 内 >= 2 个活跃信号
标签聚合：统计该 cell 内所有狗狗的体型分布和性格标签分布
  展示格式示例："中小型犬×2，幼犬×1，胆小×1"
时间衰减：最后30分钟信号降低透明度（视觉区分即将过期）
更新频率：30秒轮询 + 地图视野变化时立即刷新
历史热度（建议）：加入"过去7天同时段"热力趋势，解决冷启动空地图问题
```

#### 4.1.1 聚合算法详细实现

**H3 网格聚合核心逻辑**：
```javascript
// 后端聚合服务
const h3 = require('h3-js');

async function aggregateHotspots(viewBounds, zoomLevel) {
  // 1. 根据缩放级别动态调整聚合精度
  const h3Resolution = zoomLevel >= 15 ? 9 : 8;  //  zoom>=15 用 Level 9（更精细）
  
  // 2. 查询可视区域内所有活跃信号
  const signals = await Signal.find({
    status: 'active',
    location: {
      $geoWithin: {
        $box: [[viewBounds.southwest, viewBounds.northeast]]
      }
    }
  });
  
  // 3. 按 H3 cell 聚合
  const cellMap = new Map();
  for (const signal of signals) {
    const cellIndex = h3.latToH3(signal.location.lat, signal.location.lng, h3Resolution);
    if (!cellMap.has(cellIndex)) {
      cellMap.set(cellIndex, { signals: [], dogs: [] });
    }
    cellMap.get(cellIndex).signals.push(signal);
    cellMap.get(cellIndex).dogs.push(signal.dogProfile);
  }
  
  // 4. 生成热点数据
  const hotspots = [];
  for (const [cellIndex, data] of cellMap) {
    const [lat, lng] = h3.h3ToGeo(cellIndex);
    const dogCount = data.signals.length;
    
    // 标签聚合
    const tagStats = aggregateTags(data.dogs);
    
    // 热度值计算（信号数量 + 时间衰减权重）
    const heatValue = calculateHeatValue(data.signals);
    
    hotspots.push({
      h3Index: cellIndex,
      center: { lat, lng },
      dogCount,
      tags: tagStats,
      heatValue,
      // 热力色阶映射：0.0-1.0
      intensity: Math.min(heatValue / 10, 1.0)
    });
  }
  
  return hotspots;
}

// 标签聚合算法
function aggregateTags(dogs) {
  const sizeMap = {};
  const tagMap = {};
  
  for (const dog of dogs) {
    // 体型统计
    sizeMap[dog.size] = (sizeMap[dog.size] || 0) + 1;
    // 性格标签统计
    for (const tag of dog.tags) {
      tagMap[tag] = (tagMap[tag] || 0) + 1;
    }
  }
  
  // 返回 Top 3 标签
  const topTags = Object.entries(tagMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, count]) => ({ tag, count }));
  
  return { sizes: sizeMap, topTags };
}

// 热度值计算（考虑时间衰减）
function calculateHeatValue(signals) {
  const now = Date.now();
  let totalHeat = 0;
  
  for (const signal of signals) {
    const ageMinutes = (now - signal.createdAt.getTime()) / 60000;
    // 30分钟内信号权重1.0，30-90分钟线性衰减
    const weight = ageMinutes <= 30 ? 1.0 : 1.0 - (ageMinutes - 30) / 60;
    totalHeat += weight;
  }
  
  return totalHeat;
}
```

**热力图渲染配置（前端腾讯地图 SDK）**：
```javascript
// 腾讯地图热力图图层配置
function renderHeatmap(map, hotspots) {
  // 清除旧图层
  if (window.heatLayer) {
    map.removeLayer(window.heatLayer);
  }
  
  // 转换数据格式
  const heatData = hotspots.map(hs => ({
    lng: hs.center.lng,
    lat: hs.center.lat,
    weight: hs.intensity * 10,  // 权重映射到 0-10
    count: hs.dogCount,
    tags: hs.tags
  }));
  
  // 创建热力图层
  window.heatLayer = new TMap.visualization.Heat({
    radius: {
      value: 30,          // 热力点半径（像素）
      unit: 'px',
      min: 15,
      max: 60
    },
    opacity: 0.7,
    // 渐变色阶：蓝→绿→黄→红
    gradient: {
      0.0: 'rgba(0,0,255,0.0)',
      0.25: 'rgba(0,128,255,0.4)',
      0.5: 'rgba(0,255,128,0.6)',
      0.75: 'rgba(255,255,0,0.8)',
      1.0: 'rgba(255,0,0,0.9)'
    }
  });
  
  window.heatLayer.setData(heatData);
  window.heatLayer.setMap(map);
  
  // 绑定点击事件
  window.heatLayer.on('click', (e) => {
    showHotspotDetail(e.data);
  });
}
```

**热点详情卡片展示逻辑**：
```
点击热点后展示信息：
┌─────────────────────────────────┐
│  🐕 附近遛狗信号 (3只)          │
├─────────────────────────────────┤
│  体型分布：                       │
│  小型犬 ×2  中型犬 ×1            │
│                                 │
│  性格标签：                       │
│  🏷 活泼 ×2   🏷 胆小 ×1        │
│  🏷 亲人 ×1   🏷 社恐 ×1        │
│                                 │
│  信号时效：                       │
│  最新信号 5分钟前                 │
│  即将过期 1只（剩余20分钟）        │
│                                 │
│  [查看详情] [导航到这里]           │
└─────────────────────────────────┘
```

### 4.2 MVP 范围建议调整

**建议保留**：
- 狗狗档案管理（核心，必须）
- 热力地图 + 信号上报（核心，必须）
- 狗狗友好地点 POI（保留，但可简化为预填充数据 + 用户标记）
- 设置与协议（合规必须）

**建议推迟到 V2**：
- 寻狗上报（可独立为工具型功能，非核心链路）
- 流浪动物观察上报（涉及志愿者权限体系，复杂度高）

理由：PRD 核心定位是"热力地图偶遇"，寻狗和流浪动物是独立需求场景，放入 MVP 会分散开发资源和用户认知。

#### 4.2.1 MVP 功能模块详细定义

**模块一：狗狗档案管理**
```
功能清单：
1. 创建狗狗档案
   - 必填项：名字、体型（小/中/大）、至少1个性格标签
   - 选填项：头像照片、年龄、品种、更多性格标签（最多5个）
   - 性格标签预设库：活泼、胆小、亲人、社恐、好动、安静、爱叫、温顺、调皮、高冷
   - 每个用户最多创建3个狗狗档案（MVP限制）

2. 编辑/删除档案
   - 支持修改所有字段
   - 删除前二次确认，提示"该狗狗的历史信号记录将一并删除"

3. 档案展示
   - 列表页：头像 + 名字 + 体型 + 前3个标签
   - 详情页：完整信息 + 历史遛狗统计（本周/本月次数）
```

**模块二：热力地图 + 信号上报**
```
功能清单：
1. 地图主页
   - 默认展示当前位置（需授权）或手动选择位置
   - 热力图层叠加显示
   - 底部浮动按钮：「开始遛狗」
   - 地图右上角：刷新按钮（手动更新热力数据）
   - 缩放级别 13-18，默认 15

2. 开始遛狗（信号上报）
   - 前置条件：至少有一个狗狗档案
   - 流程：点击「开始遛狗」→ 选择本次遛狗的狗狗 → 确认开始
   - 开始后立即上报第一个信号
   - 遛狗中状态：顶部显示遛狗计时器 + 当前信号有效期倒计时
   - 结束遛狗：信号立即过期（不等到90分钟自然过期）

3. 信号刷新机制（MVP手动模式）
   - 用户每次打开小程序或点击刷新按钮时，获取当前位置并上报信号
   - 信号有效期 90 分钟
   - 不做后台持续定位（避免权限审核问题）
   - 提示文案："每次打开小程序时会自动更新您的位置信号"

4. 热点交互
   - 点击热力图高亮区域 → 弹出热点详情卡片
   - 卡片内容：狗狗数量、体型分布、性格标签、信号时效
   - 不展示具体狗狗信息（匿名设计）
```

**模块三：POI 狗狗友好地点**
```
功能清单：
1. POI 展示
   - 地图上以自定义图标标记狗狗友好地点
   - 预填充数据：城市主要公园、宠物公园、允许宠物的商场/餐厅
   - 数据来源：高德/腾讯地图 POI + 运营手动添加

2. 用户标记
   - 用户可在地图任意位置标记"狗狗友好"
   - 标记时需填写：地点名称、类型（公园/餐厅/商场/其他）、备注
   - 标记照片需经内容审核后展示

3. POI 详情
   - 展示：名称、类型、用户评分（简单好评/差评）、照片、备注
   - 操作：导航到这里、举报
```

**模块四：设置与合规**
```
功能清单：
1. 隐私设置
   - 位置权限管理（开启/关闭）
   - 隐私协议查看
   - 个人信息收集清单

2. 账号管理
   - 微信昵称/头像同步
   - 账号注销入口
   - 数据删除申请

3. 关于
   - 产品介绍
   - 用户反馈入口（跳转微信客服）
   - 版本信息
```

### 4.3 用户留存策略（PRD 未回答的关键问题）

砍掉社交后，用户为什么回来？建议强化以下工具价值：
1. **时段趋势图**：查看某区域一周内各时段的热力趋势，帮助规划最佳遛狗时间
2. **天气集成**：当前天气 + 遛狗适宜度
3. **POI 丰富度**：即使没有实时信号，POI 数据库也能提供价值（"附近哪些公园适合遛狗"）
4. **微信分享卡片**：用户自发传播，带来新用户

#### 4.3.1 时段趋势图具体实现

**数据模型**：
```javascript
// 历史热力统计（按小时聚合，每日定时任务生成）
HistoricalHeat = {
  _id: ObjectId,
  h3Index: string,        // H3 网格索引
  date: Date,             // 日期（精确到天）
  hour: number,           // 小时（0-23）
  signalCount: number,    // 该小时内的信号总数
  uniqueDogs: number,     // 不重复的狗狗数量
  peakMinute: number,     // 峰值出现的分钟数（0-59）
  createdAt: Date
}

// 查询某区域一周趋势
async function getWeeklyTrend(h3Index) {
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  
  const records = await HistoricalHeat.find({
    h3Index,
    date: { $gte: oneWeekAgo }
  }).sort({ date: 1, hour: 1 });
  
  // 按时段聚合（早/中/晚/深夜）
  const timeSlots = {
    morning: { range: [6, 12], label: '早晨 6-12点' },
    afternoon: { range: [12, 18], label: '下午 12-18点' },
    evening: { range: [18, 22], label: '晚上 18-22点' },
    night: { range: [22, 6], label: '深夜 22-6点' }
  };
  
  // 返回每个时段的平均热度
  return Object.entries(timeSlots).map(([key, slot]) => {
    const slotRecords = records.filter(r => 
      r.hour >= slot.range[0] && r.hour < slot.range[1]
    );
    const avgCount = slotRecords.length > 0 
      ? slotRecords.reduce((sum, r) => sum + r.signalCount, 0) / 7 
      : 0;
    
    return {
      slot: key,
      label: slot.label,
      avgSignals: Math.round(avgCount * 10) / 10,
      recommendation: getRecommendation(avgCount)
    };
  });
}

function getRecommendation(avgCount) {
  if (avgCount >= 5) return { level: 'hot', text: '热门时段，容易遇到同伴' };
  if (avgCount >= 2) return { level: 'moderate', text: '适度热闹，遛狗舒适' };
  if (avgCount >= 0.5) return { level: 'quiet', text: '较为安静，适合社恐' };
  return { level: 'empty', text: '人迹罕至，注意安全' };
}
```

**前端展示**：
```
时段趋势图 UI：
┌─────────────────────────────────────┐
│  📊 本周热力趋势（XX公园区域）       │
├─────────────────────────────────────┤
│                                     │
│  信号数                              │
│   8 ┤          ██                   │
│   6 ┤    ██    ██    ██             │
│   4 ┤    ██    ██    ██    ██       │
│   2 ┤    ██    ██    ██    ██       │
│   0 ┼────██────██────██────██───    │
│       早晨   下午   晚上   深夜      │
│                                     │
│  推荐：晚上18-22点最热闹             │
│  社恐推荐：早晨6-8点人最少           │
│                                     │
│  [设置遛狗提醒]                      │
└─────────────────────────────────────┘
```

#### 4.3.2 天气集成具体实现

```javascript
// 天气服务（推荐：和风天气 API，免费额度1000次/天）
async function getWalkingWeather(latitude, longitude) {
  const response = await fetch(
    `https://devapi.qweather.com/v7/weather/now?location=${longitude},${latitude}&key=${API_KEY}`
  );
  const data = await response.json();
  
  const weather = data.now;
  
  // 遛狗适宜度评分（0-100）
  let score = 100;
  const factors = [];
  
  // 温度评分
  const temp = parseFloat(weather.temp);
  if (temp < 0 || temp > 35) {
    score -= 40;
    factors.push(temp < 0 ? '气温过低' : '气温过高');
  } else if (temp < 10 || temp > 30) {
    score -= 20;
    factors.push(temp < 10 ? '气温偏低' : '气温偏高');
  }
  
  // 降水评分
  const precip = parseFloat(weather.precip);
  if (precip > 0) {
    score -= 30;
    factors.push('有降水');
  }
  
  // 风力评分
  const windScale = parseInt(weather.windScale);
  if (windScale >= 5) {
    score -= 25;
    factors.push('风力较大');
  } else if (windScale >= 4) {
    score -= 10;
    factors.push('微风');
  }
  
  // 空气质量评分
  const aqi = parseInt(weather.aqi);
  if (aqi > 150) {
    score -= 20;
    factors.push('空气质量差');
  }
  
  score = Math.max(0, score);
  
  return {
    temp: weather.temp,
    icon: weather.icon,
    text: weather.text,
    score,
    level: score >= 80 ? 'excellent' : score >= 60 ? 'good' : score >= 40 ? 'fair' : 'poor',
    factors,
    suggestion: getSuggestion(score, factors)
  };
}

function getSuggestion(score, factors) {
  if (score >= 80) return '天气很好，适合遛狗！';
  if (score >= 60) return '天气不错，可以出门走走';
  if (score >= 40) return `条件一般（${factors.join('、')}），注意防护`;
  return `不建议外出（${factors.join('、')}）`;
}
```

---

## 五、技术架构建议

### 推荐技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| 前端 | uni-app (Vue 3) | 开发效率高，插件市场丰富，未来可扩展多端 |
| 地图 | 腾讯地图 SDK + `TMap.visualization.Heat` | 微信小程序唯一选择，原生支持热力图 |
| 后端 | Node.js + 腾讯云（或微信云开发快速验证） | 灵活且生态集成好 |
| 数据库 | MongoDB（主存储）+ Redis（信号缓存 + 聚合） | MongoDB 原生 2dsphere 支持地理查询，Redis TTL 管理信号生命周期 |
| 空间索引 | H3 Level 8/9 | 六边形网格各向同性，聚合效果优于 GeoHash |
| 图片存储 | 腾讯云 COS | 与微信生态无缝集成 |
| 内容审核 | 腾讯云内容安全 API | 微信生态集成最好，25元/万次 |

### MVP 月度成本估算：约 150-300 元/月

| 服务 | 配置 | 月费用 |
|------|------|--------|
| 腾讯云轻量服务器 | 2核2G，50GB SSD | 约 60 元 |
| 云数据库 MongoDB | 1GB 内存，10GB 存储 | 约 50 元 |
| 云数据库 Redis | 256MB 内存 | 约 30 元 |
| 对象存储 COS | 10GB 存储 + 流量 | 约 10-30 元 |
| 内容安全 API | 1万次/月 | 约 25 元 |
| 域名 + SSL | .com 域名 | 约 10 元 |
| **合计** | | **约 185-205 元** |

### 推荐后端架构（MVP 单体）

```
┌─────────────────────────────────────────┐
│           微信小程序 (uni-app)            │
│  ┌──────────────────────────────────┐   │
│  │  页面层：地图首页/狗狗档案/设置   │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  服务层：API请求/状态管理/缓存   │   │
│  └──────────────────────────────────┘   │
└──────────────────┬──────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────┐
│         Nginx (反向代理/SSL)             │
│  - SSL 证书（Let's Encrypt 免费）        │
│  - 请求限流（100次/分钟/IP）             │
│  - 静态资源缓存                          │
└──────────────────┬──────────────────────┘
                   │
┌──────────────────▼──────────────────────┐
│     Node.js 应用服务 (Express/Koa)       │
│  ┌─────────┬──────────┬───────────┐     │
│  │ 用户模块 │ 信号模块  │ 图片模块   │     │
│  │ (登录/   │ (广播/   │ (上传/    │     │
│  │  档案)   │  查询)   │  审核)    │     │
│  └─────────┴──────────┴───────────┘     │
│  ┌─────────┬──────────┬───────────┐     │
│  │ 热点聚合 │ 举报模块  │ 管理后台   │     │
│  │  模块   │          │  API      │     │
│  └─────────┴──────────┴───────────┘     │
│  ┌─────────────────────────────────┐    │
│  │ 中间件：鉴权/日志/错误处理/限流  │    │
│  └─────────────────────────────────┘    │
└──────┬────────────┬─────────────────────┘
       │            │
┌──────▼───┐  ┌────▼────────┐
│ MongoDB  │  │   Redis     │
│ (持久化) │  │ (缓存/信号) │
│ 4个集合  │  │ 3类Key      │
└──────────┘  └─────────────┘
       │
┌──────▼───────────┐
│  腾讯云 COS      │
│  (图片存储)      │
│  按用户ID分目录  │
└──────────────────┘
```

#### 5.1 详细目录结构设计

**项目目录结构**：
```
pawtrace/
├── client/                    # 前端 uni-app 项目
│   ├── pages/
│   │   ├── index/             # 地图首页
│   │   ├── dog-profile/       # 狗狗档案
│   │   ├── walking/           # 遛狗中页面
│   │   ├── poi/               # POI 详情
│   │   └── settings/          # 设置页
│   ├── components/
│   │   ├── heatmap/           # 热力图组件
│   │   ├── hotspot-card/      # 热点详情卡片
│   │   ├── dog-selector/      # 狗狗选择器
│   │   └── weather-widget/    # 天气小组件
│   ├── services/
│   │   ├── api.js             # API 请求封装
│   │   ├── signal.js          # 信号上报逻辑
│   │   └── location.js        # 定位管理
│   ├── store/
│   │   ├── user.js            # 用户状态
│   │   ├── dogs.js            # 狗狗档案状态
│   │   └── map.js             # 地图状态
│   └── utils/
│       ├── h3.js              # H3 网格计算
│       └── permission.js      # 权限管理
│
├── server/                    # 后端 Node.js 项目
│   ├── src/
│   │   ├── modules/
│   │   │   ├── user/          # 用户模块
│   │   │   │   ├── user.controller.js
│   │   │   │   ├── user.service.js
│   │   │   │   └── user.model.js
│   │   │   ├── signal/        # 信号模块
│   │   │   │   ├── signal.controller.js
│   │   │   │   ├── signal.service.js
│   │   │   │   └── signal.model.js
│   │   │   ├── dog/           # 狗狗档案模块
│   │   │   │   ├── dog.controller.js
│   │   │   │   ├── dog.service.js
│   │   │   │   └── dog.model.js
│   │   │   ├── hotspot/       # 热点聚合模块
│   │   │   │   ├── hotspot.service.js
│   │   │   │   └── hotspot.model.js
│   │   │   ├── image/         # 图片模块
│   │   │   │   ├── image.controller.js
│   │   │   │   └── image.service.js
│   │   │   └── report/        # 举报模块
│   │   │       ├── report.controller.js
│   │   │       └── report.model.js
│   │   ├── middleware/
│   │   │   ├── auth.js        # 微信登录鉴权
│   │   │   ├── validator.js   # 参数校验
│   │   │   ├── rateLimit.js   # 限流
│   │   │   └── errorHandler.js
│   │   ├── jobs/
│   │   │   ├── signalExpire.js    # 信号过期定时任务
│   │   │   └── historicalHeat.js  # 历史热度统计任务
│   │   ├── utils/
│   │   │   ├── h3.js
│   │   │   ├── cos.js         # 腾讯云 COS
│   │   │   └── contentAudit.js # 内容审核
│   │   └── app.js
│   ├── config/
│   │   ├── database.js
│   │   ├── redis.js
│   │   └── wechat.js
│   └── package.json
│
└── docs/                      # 文档
    ├── api.md                 # API 文档
    └── deploy.md              # 部署文档
```

#### 5.2 API 接口设计

**核心 API 列表**：

| 模块 | 接口 | 方法 | 说明 |
|------|------|------|------|
| 用户 | `/api/user/login` | POST | 微信登录，获取 token |
| 用户 | `/api/user/profile` | GET/PUT | 获取/更新用户信息 |
| 用户 | `/api/user/delete` | POST | 账号注销 |
| 狗狗 | `/api/dogs` | GET/POST | 获取列表/创建档案 |
| 狗狗 | `/api/dogs/:id` | GET/PUT/DELETE | 详情/编辑/删除 |
| 信号 | `/api/signals` | POST | 上报遛狗信号 |
| 信号 | `/api/signals/refresh` | POST | 手动刷新信号 |
| 信号 | `/api/signals/end` | POST | 结束遛狗 |
| 热点 | `/api/hotspots` | GET | 查询热点列表（带坐标范围） |
| 热点 | `/api/hotspots/:h3Index` | GET | 热点详情 |
| 热点 | `/api/hotspots/trend/:h3Index` | GET | 时段趋势 |
| POI | `/api/pois` | GET | 获取 POI 列表 |
| POI | `/api/pois` | POST | 用户标记新 POI |
| 图片 | `/api/images/upload` | POST | 上传图片（含审核） |
| 举报 | `/api/reports` | POST | 提交举报 |

**关键接口详细定义**：

```javascript
// POST /api/signals - 上报遛狗信号
{
  request: {
    dogId: string,           // 必填，狗狗档案ID
    location: {
      lng: number,           // 必填，经度
      lat: number            // 必填，纬度
    },
    accuracy: number,        // 可选，GPS精度（米）
    h3Index: string          // 可选，前端计算的H3索引
  },
  response: {
    success: boolean,
    data: {
      signalId: string,
      expiresAt: string,     // ISO 时间字符串
      nearestHotspot: {      // 最近的热点（可选返回）
        h3Index: string,
        distance: number,    // 距离（米）
        dogCount: number
      }
    }
  }
}

// GET /api/hotspots?bounds=sw_lng,sw_lat,ne_lng,ne_lat&zoom=15
{
  response: {
    success: boolean,
    data: {
      hotspots: [
        {
          h3Index: string,
          center: { lng: number, lat: number },
          dogCount: number,
          tags: {
            sizes: { small: 2, medium: 1 },
            topTags: [
              { tag: '活泼', count: 2 },
              { tag: '胆小', count: 1 }
            ]
          },
          intensity: number,   // 0.0-1.0
          latestSignal: string // 最新信号时间
        }
      ],
      weather: {              // 顺带返回天气（减少请求）
        temp: string,
        text: string,
        score: number
      },
      updatedAt: string
    }
  }
}
```

#### 5.3 数据库详细设计

**MongoDB 集合定义**：

```javascript
// 1. Users 集合
{
  _id: ObjectId,
  openId: string,            // 微信 openId，唯一索引
  unionId: string,           // 可选，微信 unionId
  nickname: string,
  avatarUrl: string,
  privacyAgreedAt: Date,     // 隐私协议同意时间
  locationConsentAt: Date,   // 位置授权同意时间
  status: 'active' | 'deleting' | 'deleted',
  deleteRequestedAt: Date,   // 注销申请时间
  createdAt: Date,
  updatedAt: Date
}
// 索引：openId (unique), unionId (sparse)

// 2. DogProfiles 集合
{
  _id: ObjectId,
  userId: ObjectId,          // 关联 Users
  name: string,              // 必填
  size: 'small' | 'medium' | 'large',  // 必填
  tags: [string],            // 必填，至少1个，最多5个
  avatarUrl: string,         // 可选
  breed: string,             // 可选，品种
  age: number,               // 可选，年龄（月）
  isActive: boolean,         // 是否活跃（用于统计）
  lastWalkAt: Date,          // 最近一次遛狗时间
  totalWalks: number,        // 累计遛狗次数
  createdAt: Date,
  updatedAt: Date
}
// 索引：userId, userId+isActive

// 3. Signals 集合（核心）
{
  _id: ObjectId,
  userId: ObjectId,
  dogId: ObjectId,
  location: {
    type: 'Point',
    coordinates: [number, number]  // [经度, 纬度]
  },
  h3Index: string,           // H3 Level 8/9 索引
  accuracy: number,          // GPS 精度（米）
  status: 'active' | 'expired' | 'ended',
  startedAt: Date,           // 遛狗开始时间
  expiresAt: Date,           // 信号过期时间（startedAt + 90min）
  endedAt: Date,             // 实际结束时间（可选）
  createdAt: Date
}
// 索引：
//   location (2dsphere)     // 地理查询
//   h3Index                 // H3 聚合查询
//   status + expiresAt      // 过期清理
//   userId + status         // 用户信号查询
// TTL 索引：expiresAt (自动删除过期信号，可选)

// 4. Hotspots 集合（聚合缓存）
{
  _id: ObjectId,
  h3Index: string,           // H3 索引，唯一
  center: {
    type: 'Point',
    coordinates: [number, number]
  },
  dogCount: number,          // 当前狗狗数量
  dogs: [{                   // 狗狗摘要（匿名）
    dogId: ObjectId,
    size: string,
    tags: [string]
  }],
  heatValue: number,         // 热度值
  intensity: number,         // 归一化强度 0.0-1.0
  latestSignalAt: Date,      // 最新信号时间
  updatedAt: Date
}
// 索引：h3Index (unique), center (2dsphere)

// 5. POIs 集合
{
  _id: ObjectId,
  name: string,
  type: 'park' | 'petpark' | 'restaurant' | 'mall' | 'other',
  location: {
    type: 'Point',
    coordinates: [number, number]
  },
  source: 'system' | 'user', // 数据来源
  createdBy: ObjectId,       // 用户创建时关联
  photos: [string],          // 图片 URL 数组
  rating: {                  // 简单评分
    thumbsUp: number,
    thumbsDown: number
  },
  notes: string,             // 备注
  status: 'active' | 'pending' | 'rejected',
  auditResult: {             // 内容审核结果
    status: 'pass' | 'review' | 'reject',
    detail: string
  },
  createdAt: Date,
  updatedAt: Date
}
// 索引：location (2dsphere), type, status

// 6. HistoricalHeat 集合（趋势数据）
{
  _id: ObjectId,
  h3Index: string,
  date: Date,                // 日期（精确到天）
  hour: number,              // 小时（0-23）
  signalCount: number,
  uniqueDogs: number,
  uniqueUsers: number,
  createdAt: Date
}
// 索引：h3Index+date+hour (compound, unique)

// 7. Reports 集合（举报）
{
  _id: ObjectId,
  reporterId: ObjectId,      // 举报人
  targetType: 'signal' | 'poi' | 'image' | 'dog',
  targetId: ObjectId,        // 被举报对象ID
  reason: string,            // 举报原因
  description: string,       // 详细描述
  status: 'pending' | 'resolved' | 'dismissed',
  resolvedBy: ObjectId,      // 处理人（管理员）
  resolvedAt: Date,
  createdAt: Date
}
// 索引：status, targetType+targetId
```

**Redis Key 设计**：

```
# 信号缓存（TTL 90分钟）
signal:{userId}:{dogId}  →  { location, h3Index, expiresAt }
                           TTL: 5400

# 热点缓存（TTL 1分钟）
hotspot:{h3Index}  →  { dogCount, dogs, heatValue, intensity }
                      TTL: 60

# 用户当前遛狗状态
walking:{userId}  →  { dogId, startedAt, signalCount }
                    TTL: 10800 (3小时)

# 接口限流
ratelimit:{userId}:{endpoint}  →  count
                                   TTL: 60
```

#### 5.4 关键业务流程时序图

**信号上报与聚合流程**：
```
用户          小程序          Node.js         Redis         MongoDB        H3
 │              │               │              │              │             │
 │  开始遛狗    │               │              │              │             │
 │─────────────>│               │              │              │             │
 │              │  getLocation  │              │              │             │
 │              │──────────────>│              │              │             │
 │              │  {lat,lng}    │              │              │             │
 │              │<──────────────│              │              │             │
 │              │               │              │              │             │
 │              │  POST /signals│              │              │             │
 │              │─────────────────────────────>│              │             │
 │              │               │              │              │             │
 │              │               │  计算H3索引   │              │             │
 │              │               │─────────────────────────────────────────>│
 │              │               │              │              │  h3Index    │
 │              │               │<─────────────────────────────────────────│
 │              │               │              │              │             │
 │              │               │  写入信号缓存 │              │             │
 │              │               │─────────────>│              │             │
 │              │               │  SET TTL 5400 │              │             │
 │              │               │              │              │             │
 │              │               │  持久化信号   │              │             │
 │              │               │─────────────────────────────>│             │
 │              │               │              │              │  insert     │
 │              │               │              │              │             │
 │              │               │  触发热点聚合 │              │             │
 │              │               │  (异步)       │              │             │
 │              │               │              │              │             │
 │              │  {signalId,   │              │              │             │
 │              │   expiresAt}  │              │              │             │
 │              │<─────────────────────────────│              │             │
 │              │               │              │              │             │
 │  显示计时器   │               │              │              │             │
 │<─────────────│               │              │              │             │
 │              │               │              │              │             │
```

**热点聚合详细流程**：
```
Node.js 聚合服务:

1. 接收聚合请求（来自前端查询或定时触发）
   ↓
2. 查询 Redis 中指定 H3 cell 的所有活跃信号
   → 如果 Redis 缓存命中，直接返回
   → 如果未命中，从 MongoDB 查询并更新缓存
   ↓
3. 按 H3 cell 分组信号
   ↓
4. 对每个 cell：
   a. 统计狗狗数量
   b. 聚合体型和性格标签
   c. 计算热度值（考虑时间衰减）
   d. 归一化强度值（0.0-1.0）
   ↓
5. 更新 Hotspots 集合（MongoDB upsert）
   ↓
6. 更新 Redis 缓存（TTL 60秒）
   ↓
7. 返回热点列表给前端
```

#### 5.5 部署架构与运维

**MVP 部署方案**：
```yaml
# docker-compose.yml (单机部署)
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: always

  app:
    build: ./server
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://mongo:27017/pawtrace
      - REDIS_URL=redis://redis:6379
      - COS_BUCKET=pawtrace-xxx
      - COS_REGION=ap-shanghai
    depends_on:
      - mongo
      - redis
    restart: always
    # 单机2核2G足够MVP使用

  mongo:
    image: mongo:6
    volumes:
      - mongo_data:/data/db
    environment:
      - MONGO_INITDB_DATABASE=pawtrace
    restart: always

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    restart: always

volumes:
  mongo_data:
  redis_data:
```

**监控与告警**：
```
必须监控的指标：
1. 信号上报成功率（目标 > 95%）
2. 热点聚合延迟（目标 < 500ms）
3. 图片上传成功率（目标 > 98%）
4. 内容审核拒绝率（异常高时可能是误判）
5. Redis 内存使用率（目标 < 80%）
6. MongoDB 查询慢日志（> 100ms 的查询）

告警阈值：
- 服务器 CPU > 80% 持续5分钟
- 内存使用 > 85%
- 磁盘使用 > 80%
- API 错误率 > 5%
- 响应时间 P95 > 2秒
```

---

## 六、竞争格局与风险提示

### 竞品对比

| 产品 | 类型 | 核心功能 | 与"狗遇"的差异 |
|------|------|---------|--------------|
| 口袋狗 | 原生 App | 遛狗记录 + 社交互动 + 约遛 | 有社交功能，无热力图，已停止运营 |
| 宠步+ | 微信小程序 | 遛狗记录 + 天气 + 活动赛事 | 偏工具型，无地图社交 |
| BarkHappy | 原生 App (美国) | LBS 发现附近狗主人 + 匹配 | 有社交/约会功能，无热力图 |
| DogMap | 原生 App (欧洲) | 宠物友好地点地图 + 评价 | POI 导向，无实时信号 |
| 狗狗地图 | 原生 App (中国) | 领地争夺 + 遛狗记录 | 游戏化思路，已停止运营 |

### 竞品教训
- 口袋狗、狗狗地图等中国宠物社交产品均已停止运营，共同问题：社交功能无法维持活跃度
- "狗遇"砍掉社交是明智的，但需要回答：**没有社交，留存靠什么？**
- 产品留存应依赖"工具价值"而非"社交价值"——POI 数据库质量和内容质量比信号数量更重要

### Yik Yak 警示
- 匿名 + 地理位置的模式在海外有失败先例（Yik Yak），因滥用问题最终关闭
- "狗遇"的匿名设计需要更严格的反滥用机制

---

## 七、行动建议优先级

### 立即解决（阻塞开发）
1. 定义信号聚合算法的具体参数
2. 补充 PIPL 合规设计（单独同意、删除权、注销流程）
3. 确认小程序服务类目和主体类型（需企业主体）
4. 定义内容审核方案
5. 补充完整的用户流程和状态设计

### 短期解决（影响 MVP 质量）
6. 设计冷启动运营方案
7. 定义隐身/播报模式切换交互
8. 制定微信位置权限审核应对策略（含降级方案）
9. 补充通知权限策略
10. 制定防作弊规则

### 中期完善（影响增长）
11. 增加天气集成和时段趋势图
12. 设计微信分享卡片
13. 建立举报机制
14. 考虑将寻狗/流浪动物模块推迟到 V2

---

## 八、被否决的替代方案

| 替代方案 | 否决理由 |
|---------|---------|
| 使用 `wx.getFuzzyLocation` 替代精确定位 | 精度约1km级别，无法支撑社区级热力图展示，仅作为审核不通过时的兜底 |
| 90分钟后台持续定位广播 | 后台定位权限审核极严，MVP 阶段建议降级为手动刷新模式 |
| 客户端 Canvas 手绘热力图 | 开发量大、性能受限，腾讯地图原生热力图图层完全满足需求 |
| 微信云开发作为唯一后端方案 | 适合快速验证但地理查询能力受限，建议正式开发用 Node.js + MongoDB |
| MVP 包含寻狗 + 流浪动物模块 | 分散核心聚焦，建议推迟到 V2 |
| 宠物识别 AI 全量接入 | 成本较高（20元/千次），MVP 阶段用通用审核 + 用户举报替代 |

---

## 九、结论

**产品方向正确，差异化定位清晰**，但 PRD 在可执行层面存在 6 个 P0 级缺口。最关键三个问题是：
1. **信号聚合算法未定义** → 核心功能无法开发
2. **PIPL 合规 + 微信位置权限审核** → 可能导致无法上线
3. **冷启动策略空白** → 可能导致产品上线即死亡

建议在这三个问题得到解答之前，不进入开发阶段。PRD 需要补充约 2-3 页的算法定义、合规设计和冷启动运营方案后，方可启动技术实现。

---

*分析日期：2026年8月8日*
*分析维度：产品设计、技术架构、法律合规*
