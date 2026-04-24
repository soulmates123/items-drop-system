const DATA = window.DROP_DATA || {
  vesselRows: [],
  dropColorRows: [],
  dropItemsRows: [],
  itemRows: [],
  vesselNameRows: [],
  containerNames: [],
  roomNames: [],
  roomMap: {},
  roomMeta: {},
  meta: { counts: {}, lastBuiltAt: "" }
};

const vesselRuleCountEl = document.getElementById("vesselRuleCount");
const colorRuleCountEl = document.getElementById("colorRuleCount");
const itemRuleCountEl = document.getElementById("itemRuleCount");
const roomCountEl = document.getElementById("roomCount");
const lastLoadedAtEl = document.getElementById("lastLoadedAt");

const containerSelectEl = document.getElementById("containerSelect");
const searchTimesEl = document.getElementById("searchTimes");
const globalLimitEl = document.getElementById("globalLimit");

const roomSelectEl = document.getElementById("roomSelect");
const roomSearchTimesEl = document.getElementById("roomSearchTimes");
const roomGlobalLimitEl = document.getElementById("roomGlobalLimit");

const simulateBtn = document.getElementById("simulateBtn");
const simulateRoomBtn = document.getElementById("simulateRoomBtn");

const statusBoxEl = document.getElementById("statusBox");
const roundListEl = document.getElementById("roundList");
const summaryBoxEl = document.getElementById("summaryBox");

function cleanText(value) {
  return String(value ?? "").trim();
}

// 容器等级排序：按级数（1-6）排序
function getContainerLevelOrder(level) {
  const match = String(level).match(/(\d+)/);
  return match ? parseInt(match[1]) : 999;
}

// 品质排序：按固定顺序（白、绿、蓝、紫、金、红）
function getQualityOrder(quality) {
  const qualityOrder = { "白": 0, "绿": 1, "蓝": 2, "紫": 3, "金": 4, "红": 5 };
  return qualityOrder[quality] !== undefined ? qualityOrder[quality] : 999;
}

function randomInt(min, max) {
  if (min > max) [min, max] = [max, min];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function rollTenThousand(probability) {
  return randomInt(1, 10000) <= probability;
}

function weightedPick(list, getWeight) {
  const valid = list.filter((item) => getWeight(item) > 0);
  const total = valid.reduce((sum, item) => sum + getWeight(item), 0);
  if (!valid.length || total <= 0) return null;

  let r = Math.random() * total;
  for (const item of valid) {
    r -= getWeight(item);
    if (r <= 0) return item;
  }
  return valid[valid.length - 1];
}

function setStatus(text, isError = false) {
  statusBoxEl.textContent = text;
  statusBoxEl.style.color = isError ? "#ff9e9e" : "#edf2f7";
}

function renderContainerOptions(names) {
  const options = [
    `<option value="__ALL__">汇总</option>`,
    ...names.map((name) => `<option value="${name}">${name}</option>`)
  ];
  containerSelectEl.innerHTML = options.join("");
}

function renderRoomOptions(names) {
  const filteredNames = names.filter((name) => String(name).trim() !== "汇总");
  roomSelectEl.innerHTML = [
    `<option value="__ROOM_ALL__" selected>汇总</option>`,
    ...filteredNames.map((name) => `<option value="${name}">${name}</option>`)
  ].join("");
}

function initMeta() {
  vesselRuleCountEl.textContent = DATA.meta?.counts?.vesselRules || DATA.vesselRows.length || 0;
  colorRuleCountEl.textContent = DATA.meta?.counts?.colorRules || DATA.dropColorRows.length || 0;
  itemRuleCountEl.textContent = DATA.meta?.counts?.itemRules || DATA.dropItemsRows.length || 0;
  roomCountEl.textContent = DATA.meta?.counts?.roomCount || DATA.roomNames.length || 0;
  lastLoadedAtEl.textContent = DATA.meta?.lastBuiltAt || "-";

  renderContainerOptions(DATA.containerNames || []);
  renderRoomOptions(DATA.roomNames || []);

  setStatus("数据读取成功");
}

function pickQualityForRule(rule) {
  let candidates = DATA.dropColorRows.filter(
    (row) =>
      row.containerName === rule.containerName &&
      row.dropLevel === rule.dropLevel &&
      row.dropItemId === rule.dropItemId
  );

  if (!candidates.length) {
    candidates = DATA.dropColorRows.filter(
      (row) =>
        row.containerName === rule.containerName &&
        row.dropLevel === rule.dropLevel
    );
  }

  const picked = weightedPick(candidates, (x) => x.weight);
  return picked ? picked.quality : null;
}

function pickItemForQuality(rule, quality) {
  let candidates = DATA.dropItemsRows.filter(
    (row) =>
      row.containerName === rule.containerName &&
      row.containerLevel === rule.containerLevel &&
      row.quality === quality
  );

  if (!candidates.length) {
    candidates = DATA.dropItemsRows.filter(
      (row) =>
        row.containerName === rule.containerName &&
        row.quality === quality
    );
  }

  const picked = weightedPick(candidates, (x) => x.weight);
  return picked ? picked.itemName : null;
}

function simulateContainerOnce(containerName, globalLimitLeft, sourceRoomName = "") {
  const rules = DATA.vesselRows.filter((row) => row.containerName === containerName);
  if (!rules.length) {
    return {
      containerName,
      drops: [],
      totalValue: 0
    };
  }

  const drops = [];
  let totalValue = 0;

  for (const rule of rules) {
    if (drops.length >= globalLimitLeft) break;

    if (!rollTenThousand(rule.probability)) continue;

    const count = randomInt(rule.minDrop, rule.maxDrop);

    for (let i = 0; i < count; i++) {
      if (drops.length >= globalLimitLeft) break;

      const quality = pickQualityForRule(rule);
      if (!quality) continue;

      const itemName = pickItemForQuality(rule, quality);
      if (!itemName) continue;

      const itemInfo = DATA.itemRows.find((x) => x.itemName === itemName);

      const result = {
        containerName,
        sourceRoomName,
        containerLevel: rule.containerLevel,
        dropLevel: rule.dropLevel,
        quality,
        itemName,
        category: itemInfo ? itemInfo.category : "",
        itemValue: itemInfo ? itemInfo.itemValue : 0
      };

      drops.push(result);
      totalValue += result.itemValue || 0;
    }
  }

  return {
    containerName,
    drops,
    totalValue
  };
}

function simulateContainerSearch(containerName, searchTimes, globalLimit) {
  const rounds = [];
  const summaryByQuality = {};
  const summaryByItem = {};
  const summaryByContainer = {};
  let totalDropped = 0;
  let totalValue = 0;

  for (let roundIndex = 1; roundIndex <= searchTimes; roundIndex++) {
    if (totalDropped >= globalLimit) break;

    const left = globalLimit - totalDropped;
    const containerResult = simulateContainerOnce(containerName, left);

    for (const drop of containerResult.drops) {
      totalDropped++;
      totalValue += drop.itemValue || 0;
      
      // 按品质统计：记录计数和总价值
      if (!summaryByQuality[drop.quality]) {
        summaryByQuality[drop.quality] = { count: 0, totalValue: 0 };
      }
      summaryByQuality[drop.quality].count += 1;
      summaryByQuality[drop.quality].totalValue += drop.itemValue || 0;
      
      // 按物品统计：记录计数、品质和价值
      if (!summaryByItem[drop.itemName]) {
        summaryByItem[drop.itemName] = { count: 0, quality: drop.quality, totalValue: 0 };
      }
      summaryByItem[drop.itemName].count += 1;
      summaryByItem[drop.itemName].totalValue += drop.itemValue || 0;
      
      // 按容器统计：记录容器名、等级和计数
      if (!summaryByContainer[drop.containerName]) {
        summaryByContainer[drop.containerName] = { count: 0, containerLevel: drop.containerLevel };
      }
      summaryByContainer[drop.containerName].count += 1;
    }

    rounds.push({
      round: roundIndex,
      drops: containerResult.drops,
      roundValue: containerResult.totalValue
    });
  }

  return {
    mode: "container",
    containerName,
    searchTimes,
    globalLimit,
    totalDropped,
    totalValue,
    rounds,
    summary: {
      byContainer: summaryByContainer,
      byQuality: summaryByQuality,
      byItem: summaryByItem
    }
  };
}

function simulateAllContainers(searchTimes, globalLimit) {
  const containerNames = DATA.containerNames || [];
  const rounds = [];
  const summaryByContainer = {};
  const summaryByQuality = {};
  const summaryByItem = {};

  let totalDropped = 0;
  let totalValue = 0;

  for (let roundIndex = 1; roundIndex <= searchTimes; roundIndex++) {
    if (totalDropped >= globalLimit) break;

    const containerResults = [];
    let roundValue = 0;

    for (const containerName of containerNames) {
      if (totalDropped >= globalLimit) break;

      const left = globalLimit - totalDropped;
      const containerResult = simulateContainerOnce(containerName, left);

      containerResults.push({
        containerName,
        drops: containerResult.drops,
        totalValue: containerResult.totalValue
      });

      for (const drop of containerResult.drops) {
        totalDropped++;
        totalValue += drop.itemValue || 0;
        roundValue += drop.itemValue || 0;
        
        // 按容器统计：记录容器名、等级和计数
        if (!summaryByContainer[drop.containerName]) {
          summaryByContainer[drop.containerName] = { count: 0, containerLevel: drop.containerLevel };
        }
        summaryByContainer[drop.containerName].count += 1;
        
        // 按品质统计：记录计数和总价值
        if (!summaryByQuality[drop.quality]) {
          summaryByQuality[drop.quality] = { count: 0, totalValue: 0 };
        }
        summaryByQuality[drop.quality].count += 1;
        summaryByQuality[drop.quality].totalValue += drop.itemValue || 0;
        
        // 按物品统计：记录计数、品质和价值
        if (!summaryByItem[drop.itemName]) {
          summaryByItem[drop.itemName] = { count: 0, quality: drop.quality, totalValue: 0 };
        }
        summaryByItem[drop.itemName].count += 1;
        summaryByItem[drop.itemName].totalValue += drop.itemValue || 0;
      }
    }

    rounds.push({
      round: roundIndex,
      containers: containerResults,
      roundValue
    });
  }

  return {
    mode: "container-all",
    searchTimes,
    globalLimit,
    totalDropped,
    totalValue,
    rounds,
    summary: {
      byContainer: summaryByContainer,
      byQuality: summaryByQuality,
      byItem: summaryByItem
    }
  };
}

function simulateRoom(roomName, roomSearchTimes, globalLimit) {
  const roomEntries = DATA.roomMap[roomName];
  if (!roomEntries || !roomEntries.length) {
    throw new Error(`未找到房间：${roomName} 的容器分布配置`);
  }

  const rounds = [];
  const summaryByContainer = {};
  const summaryByQuality = {};
  const summaryByItem = {};
  let totalDropped = 0;
  let totalValue = 0;

  for (let roundIndex = 1; roundIndex <= roomSearchTimes; roundIndex++) {
    if (totalDropped >= globalLimit) break;

    const spawnedContainers = [];

    for (const entry of roomEntries) {
      for (let i = 0; i < entry.fixedCount; i++) {
        spawnedContainers.push({ containerName: entry.containerName, spawnType: 'fixed' });
      }

      for (let i = 0; i < entry.randomCount; i++) {
        if (rollTenThousand(entry.randomProbability)) {
          spawnedContainers.push({ containerName: entry.containerName, spawnType: 'random' });
        }
      }
    }

    const containerResults = [];
    let roundValue = 0;
    let instanceIndex = 1;

    for (const containerInfo of spawnedContainers) {
      if (totalDropped >= globalLimit) break;

      const left = globalLimit - totalDropped;
      const containerResult = simulateContainerOnce(containerInfo.containerName, left, roomName);

      containerResults.push({
        instanceIndex,
        containerName: containerInfo.containerName,
        spawnType: containerInfo.spawnType,
        sourceRoomName: roomName,
        drops: containerResult.drops,
        totalValue: containerResult.totalValue
      });

      instanceIndex++;

      for (const drop of containerResult.drops) {
        totalDropped++;
        totalValue += drop.itemValue || 0;
        roundValue += drop.itemValue || 0;

        // 按容器统计：记录容器名、等级和计数
        if (!summaryByContainer[drop.containerName]) {
          summaryByContainer[drop.containerName] = { count: 0, containerLevel: drop.containerLevel };
        }
        summaryByContainer[drop.containerName].count += 1;

        // 按品质统计：记录计数和总价值
        if (!summaryByQuality[drop.quality]) {
          summaryByQuality[drop.quality] = { count: 0, totalValue: 0 };
        }
        summaryByQuality[drop.quality].count += 1;
        summaryByQuality[drop.quality].totalValue += drop.itemValue || 0;
        
        // 按物品统计：记录计数、品质和价值
        if (!summaryByItem[drop.itemName]) {
          summaryByItem[drop.itemName] = { count: 0, quality: drop.quality, totalValue: 0 };
        }
        summaryByItem[drop.itemName].count += 1;
        summaryByItem[drop.itemName].totalValue += drop.itemValue || 0;
      }
    }

    rounds.push({
      round: roundIndex,
      containers: containerResults,
      roundValue
    });
  }

  return {
    mode: "room",
    roomName,
    roomSearchTimes,
    globalLimit,
    totalDropped,
    totalValue,
    rounds,
    summary: {
      byContainer: summaryByContainer,
      byQuality: summaryByQuality,
      byItem: summaryByItem
    }
  };
}

function simulateAllRooms(roomSearchTimes, globalLimit) {
  const actualRoomNames = (DATA.roomNames || []).filter(
    (name) => cleanText(name) && cleanText(name) !== "汇总"
  );

  const rounds = [];
  const summaryByContainer = {};
  const summaryByQuality = {};
  const summaryByItem = {};
  const summaryByRegion = {};

  let totalDropped = 0;
  let totalValue = 0;

  for (let roundIndex = 1; roundIndex <= roomSearchTimes; roundIndex++) {
    if (totalDropped >= globalLimit) break;

    const roomResults = [];
    let roundValue = 0;

    for (const actualRoomName of actualRoomNames) {
      if (totalDropped >= globalLimit) break;

      const roomMeta = DATA.roomMeta?.[actualRoomName] || {};
      const bigRegion = roomMeta.bigRegion || "未分区";

      const roomEntries = DATA.roomMap[actualRoomName] || [];
      const spawnedContainers = [];

      for (const entry of roomEntries) {
        for (let i = 0; i < entry.fixedCount; i++) {
          spawnedContainers.push({ containerName: entry.containerName, spawnType: 'fixed' });
        }

        for (let i = 0; i < entry.randomCount; i++) {
          if (rollTenThousand(entry.randomProbability)) {
            spawnedContainers.push({ containerName: entry.containerName, spawnType: 'random' });
          }
        }
      }

      const containerResults = [];
      let instanceIndex = 1;
      let roomValue = 0;

      for (const containerInfo of spawnedContainers) {
        if (totalDropped >= globalLimit) break;

        const left = globalLimit - totalDropped;
        const containerResult = simulateContainerOnce(containerInfo.containerName, left, actualRoomName);

        containerResults.push({
          instanceIndex,
          containerName: containerInfo.containerName,
          spawnType: containerInfo.spawnType,
          sourceRoomName: actualRoomName,
          bigRegion,
          drops: containerResult.drops,
          totalValue: containerResult.totalValue
        });

        instanceIndex++;

        if (!summaryByRegion[bigRegion]) {
          summaryByRegion[bigRegion] = {
            roomCount: 0,
            containerCount: 0,
            dropCount: 0,
            totalValue: 0
          };
        }
        summaryByRegion[bigRegion].containerCount += 1;

        for (const drop of containerResult.drops) {
          totalDropped++;
          totalValue += drop.itemValue || 0;
          roomValue += drop.itemValue || 0;
          roundValue += drop.itemValue || 0;

          // 按容器统计：记录容器名、等级和计数
          if (!summaryByContainer[drop.containerName]) {
            summaryByContainer[drop.containerName] = { count: 0, containerLevel: drop.containerLevel };
          }
          summaryByContainer[drop.containerName].count += 1;

          // 按品质统计：记录计数和总价值
          if (!summaryByQuality[drop.quality]) {
            summaryByQuality[drop.quality] = { count: 0, totalValue: 0 };
          }
          summaryByQuality[drop.quality].count += 1;
          summaryByQuality[drop.quality].totalValue += drop.itemValue || 0;
          
          // 按物品统计：记录计数、品质和价值
          if (!summaryByItem[drop.itemName]) {
            summaryByItem[drop.itemName] = { count: 0, quality: drop.quality, totalValue: 0 };
          }
          summaryByItem[drop.itemName].count += 1;
          summaryByItem[drop.itemName].totalValue += drop.itemValue || 0;

          summaryByRegion[bigRegion].dropCount += 1;
          summaryByRegion[bigRegion].totalValue += drop.itemValue || 0;
        }
      }

      if (!summaryByRegion[bigRegion]) {
        summaryByRegion[bigRegion] = {
          roomCount: 0,
          containerCount: 0,
          dropCount: 0,
          totalValue: 0
        };
      }
      summaryByRegion[bigRegion].roomCount += 1;

      roomResults.push({
        roomName: actualRoomName,
        bigRegion,
        containers: containerResults,
        roomValue
      });
    }

    rounds.push({
      round: roundIndex,
      rooms: roomResults,
      roundValue
    });
  }

  return {
    mode: "room-all",
    roomSearchTimes,
    globalLimit,
    totalDropped,
    totalValue,
    rounds,
    summary: {
      byRegion: summaryByRegion,
      byContainer: summaryByContainer,
      byQuality: summaryByQuality,
      byItem: summaryByItem
    }
  };
}

function renderContainerRounds(result) {
  if (!result || !result.rounds || !result.rounds.length) {
    roundListEl.className = "round-list empty";
    roundListEl.innerHTML = "暂无结果";
    return;
  }

  roundListEl.className = "round-list";
  roundListEl.innerHTML = result.rounds.map((round) => {
    const itemsHtml = round.drops.length
      ? round.drops.map((drop) => `
          <div class="drop-item">
            <span class="badge badge-level">掉落等级 ${drop.dropLevel}</span>
            <span class="badge badge-quality">品质 ${drop.quality}</span>
            <div><strong>${drop.itemName}</strong></div>
            <div>容器：${drop.containerName}</div>
            <div>容器等级：${drop.containerLevel || "-"}</div>
            <div>分类：${drop.category || "-"}</div>
            <div>价值：${Number(drop.itemValue || 0).toLocaleString("zh-CN")}</div>
          </div>
        `).join("")
      : `<div class="drop-item">本次未掉落任何物品</div>`;

    return `
      <div class="round-card">
        <div class="round-title">第 ${round.round} 次搜索</div>
        <div style="margin-bottom:10px; color:#ffd27a;">本次小计价值：${Number(round.roundValue || 0).toLocaleString("zh-CN")}</div>
        ${itemsHtml}
      </div>
    `;
  }).join("");
}

function renderContainerSummary(result) {
  // 按品质统计，按固定品质顺序显示
  const qualityHtml = Object.entries(result.summary.byQuality || {})
    .sort((a, b) => getQualityOrder(a[0]) - getQualityOrder(b[0]))
    .map(([quality, data]) => {
      const avgValue = data.count > 0 ? Math.round(data.totalValue / data.count) : 0;
      return `<div>品质 ${quality}：${data.count} 件 | 总价值：${Number(data.totalValue || 0).toLocaleString("zh-CN")} | 平均价值：${Number(avgValue).toLocaleString("zh-CN")}</div>`;
    })
    .join("");

  // 按物品统计，按品质分组，支持展开/折叠，按品质顺序排序，包含全部统计
  const itemsByQuality = {};
  let totalItemCount = 0;
  let totalItemValue = 0;
  
  Object.entries(result.summary.byItem || {}).forEach(([itemName, data]) => {
    const quality = data.quality;
    if (!itemsByQuality[quality]) {
      itemsByQuality[quality] = [];
    }
    itemsByQuality[quality].push({ itemName, ...data });
    totalItemCount += data.count;
    totalItemValue += data.totalValue || 0;
  });

  const itemHtml = Object.entries(itemsByQuality)
    .sort((a, b) => getQualityOrder(a[0]) - getQualityOrder(b[0]))
    .map(([quality, items]) => {
      const qualityTotal = items.reduce((sum, item) => sum + (item.totalValue || 0), 0);
      const itemsHtml = items
        .sort((a, b) => b.totalValue - a.totalValue)
        .map(item => {
          const avgValue = item.count > 0 ? Math.round(item.totalValue / item.count) : 0;
          return `<div style="padding:4px 0 4px 12px; border-top:1px solid rgba(255,255,255,0.03);">
            <span class="drop-item-name">${item.itemName}</span>：${item.count} 件 | 总价值：${Number(item.totalValue || 0).toLocaleString("zh-CN")} | 平均价值：${Number(avgValue).toLocaleString("zh-CN")}
          </div>`;
        })
        .join("");

      return `<details style="margin-bottom:8px; background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px;">
        <summary style="cursor:pointer; color:#ffe3a3; font-weight:bold; outline:none;">
          品质 ${quality} (${items.length} 种，共 ${items.reduce((sum, i) => sum + i.count, 0)} 件，总价值：${Number(qualityTotal || 0).toLocaleString("zh-CN")})
        </summary>
        <div style="margin-top:8px;">
          ${itemsHtml}
        </div>
      </details>`;
    })
    .join("");

  // 物品全部统计
  const itemAllHtml = `<details style="margin-bottom:8px; background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px;">
    <summary style="cursor:pointer; color:#ffe3a3; font-weight:bold; outline:none;">
      全部 (${Object.keys(result.summary.byItem || {}).length} 种，共 ${totalItemCount} 件，总价值：${Number(totalItemValue || 0).toLocaleString("zh-CN")})
    </summary>
  </details>`;

  // 按容器统计，按容器等级分组，按等级顺序排序，包含全部统计
  const containersByLevel = {};
  let totalContainerCount = 0;
  
  Object.entries(result.summary.byContainer || {}).forEach(([containerName, data]) => {
    const level = data.containerLevel || "未知";
    if (!containersByLevel[level]) {
      containersByLevel[level] = [];
    }
    containersByLevel[level].push({ containerName, ...data });
    totalContainerCount += data.count;
  });

  const containerHtml = Object.entries(containersByLevel)
    .sort((a, b) => getContainerLevelOrder(a[0]) - getContainerLevelOrder(b[0]))
    .map(([level, containers]) => {
      const levelTotal = containers.reduce((sum, c) => sum + c.count, 0);
      const containersHtml = containers
        .map(c => `<div style="padding:4px 0 4px 12px; border-top:1px solid rgba(255,255,255,0.03);">${c.containerName}：${c.count}</div>`)
        .join("");

      return `<details style="margin-bottom:8px; background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px;">
        <summary style="cursor:pointer; color:#ffe3a3; font-weight:bold; outline:none;">
          ${level} (${containers.length} 种，共 ${levelTotal} 个)
        </summary>
        <div style="margin-top:8px;">
          ${containersHtml}
        </div>
      </details>`;
    })
    .join("");

  // 容器全部统计
  const containerAllHtml = `<details style="margin-bottom:8px; background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px;">
    <summary style="cursor:pointer; color:#ffe3a3; font-weight:bold; outline:none;">
      全部 (${Object.keys(result.summary.byContainer || {}).length} 种，共 ${totalContainerCount} 个)
    </summary>
  </details>`;

  summaryBoxEl.className = "summary-box";
  summaryBoxEl.innerHTML = `
    <div>模式：按容器搜索 | 容器：${result.containerName} | 搜索次数：${result.searchTimes}</div>
    <div style="margin-bottom: 8px;">本次总掉落上限：${result.globalLimit} | 实际总掉落数：${result.totalDropped} | 本次搜索总价值：${Number(result.totalValue || 0).toLocaleString("zh-CN")} | 每轮平均价值：${result.searchTimes > 0 ? Math.round(Number(result.totalValue || 0) / result.searchTimes).toLocaleString("zh-CN") : "0"}</div>

    <div style="margin-top: 10px; color:#ffd27a;">按品质统计</div>
    ${qualityHtml || "<div>无</div>"}

    <div style="margin-top: 10px; color:#ffd27a;">按物品统计（按品质分类）</div>
    ${itemHtml || "<div>无</div>"}
    ${itemAllHtml}

    <div style="margin-top: 10px; color:#ffd27a;">按容器等级统计</div>
    ${containerHtml || "<div>无</div>"}
    ${containerAllHtml}
  `;
}

function renderAllContainersRounds(result) {
  if (!result || !result.rounds || !result.rounds.length) {
    roundListEl.className = "round-list empty";
    roundListEl.innerHTML = "暂无结果";
    return;
  }

  roundListEl.className = "round-list";
  roundListEl.innerHTML = result.rounds.map((round) => {
    const containerHtml = round.containers.length
      ? round.containers.map((container) => {
          const dropsHtml = container.drops.length
            ? container.drops.map((drop) => `
                <div class="drop-item">
                  <span class="badge badge-level">掉落等级 ${drop.dropLevel}</span>
                  <span class="badge badge-quality">品质 ${drop.quality}</span>
                  <div><strong>${drop.itemName}</strong></div>
                  <div>容器：${drop.containerName}</div>
                  <div>容器等级：${drop.containerLevel || "-"}</div>
                  <div>分类：${drop.category || "-"}</div>
                  <div>价值：${Number(drop.itemValue || 0).toLocaleString("zh-CN")}</div>
                </div>
              `).join("")
            : `<div class="drop-item">该容器本次未掉落物品</div>`;

          return `
            <div class="round-card" style="margin-bottom:12px;">
              <div class="container-title">容器：${container.containerName}</div>
              <div style="margin-bottom:10px; color:#ffd27a;">该容器小计价值：${Number(container.totalValue || 0).toLocaleString("zh-CN")}</div>
              ${dropsHtml}
            </div>
          `;
        }).join("")
      : `<div class="drop-item">本轮没有容器结果</div>`;

    return `
      <div class="round-card">
        <div class="round-title">第 ${round.round} 轮汇总搜索</div>
        <div style="margin-bottom:10px; color:#ffd27a;">本轮总价值：${Number(round.roundValue || 0).toLocaleString("zh-CN")}</div>
        ${containerHtml}
      </div>
    `;
  }).join("");
}

function renderAllContainersSummary(result) {
  // 按容器等级分组，按等级顺序排序
  const containersByLevel = {};
  Object.entries(result.summary.byContainer || {}).forEach(([containerName, data]) => {
    const level = data.containerLevel || "未知";
    if (!containersByLevel[level]) {
      containersByLevel[level] = [];
    }
    containersByLevel[level].push({ containerName, ...data });
  });

  const containerHtml = Object.entries(containersByLevel)
    .sort((a, b) => getContainerLevelOrder(a[0]) - getContainerLevelOrder(b[0]))
    .map(([level, containers]) => {
      const levelTotal = containers.reduce((sum, c) => sum + c.count, 0);
      const containersHtml = containers
        .map(c => `<div style="padding:4px 0 4px 12px; border-top:1px solid rgba(255,255,255,0.03);">${c.containerName}：${c.count}</div>`)
        .join("");

      return `<details style="margin-bottom:8px; background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px;">
        <summary style="cursor:pointer; color:#ffe3a3; font-weight:bold; outline:none;">
          ${level} (${containers.length} 种，共 ${levelTotal} 个)
        </summary>
        <div style="margin-top:8px;">
          ${containersHtml}
        </div>
      </details>`;
    })
    .join("");

  // 按品质统计，按固定品质顺序显示
  const qualityHtml = Object.entries(result.summary.byQuality || {})
    .sort((a, b) => getQualityOrder(a[0]) - getQualityOrder(b[0]))
    .map(([quality, data]) => {
      const avgValue = data.count > 0 ? Math.round(data.totalValue / data.count) : 0;
      return `<div>品质 ${quality}：${data.count} 件 | 总价值：${Number(data.totalValue || 0).toLocaleString("zh-CN")} | 平均价值：${Number(avgValue).toLocaleString("zh-CN")}</div>`;
    })
    .join("");

  // 按物品统计，按品质分组，支持展开/折叠，按品质顺序排序
  const itemsByQuality = {};
  Object.entries(result.summary.byItem || {}).forEach(([itemName, data]) => {
    const quality = data.quality;
    if (!itemsByQuality[quality]) {
      itemsByQuality[quality] = [];
    }
    itemsByQuality[quality].push({ itemName, ...data });
  });

  const itemHtml = Object.entries(itemsByQuality)
    .sort((a, b) => getQualityOrder(a[0]) - getQualityOrder(b[0]))
    .map(([quality, items]) => {
      const qualityTotal = items.reduce((sum, item) => sum + (item.totalValue || 0), 0);
      const itemsHtml = items
        .sort((a, b) => b.totalValue - a.totalValue)
        .map(item => {
          const avgValue = item.count > 0 ? Math.round(item.totalValue / item.count) : 0;
          return `<div style="padding:4px 0 4px 12px; border-top:1px solid rgba(255,255,255,0.03);">
            <span class="drop-item-name">${item.itemName}</span>：${item.count} 件 | 总价值：${Number(item.totalValue || 0).toLocaleString("zh-CN")} | 平均价值：${Number(avgValue).toLocaleString("zh-CN")}
          </div>`;
        })
        .join("");

      return `<details style="margin-bottom:8px; background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px;">
        <summary style="cursor:pointer; color:#ffe3a3; font-weight:bold; outline:none;">
          品质 ${quality} (${items.length} 种，共 ${items.reduce((sum, i) => sum + i.count, 0)} 件，总价值：${Number(qualityTotal || 0).toLocaleString("zh-CN")})
        </summary>
        <div style="margin-top:8px;">
          ${itemsHtml}
        </div>
      </details>`;
    })
    .join("");

  summaryBoxEl.className = "summary-box";
  const avgValue = result.searchTimes > 0 ? Math.round(Number(result.totalValue || 0) / result.searchTimes) : 0;
  summaryBoxEl.innerHTML = `
    <div>模式：容器汇总搜索 | 说明：所有容器各搜索一遍 | 轮数：${result.searchTimes}</div>
    <div>本次总掉落上限：${result.globalLimit} | 实际总掉落数：${result.totalDropped} | 本次搜索总价值：${Number(result.totalValue || 0).toLocaleString("zh-CN")} | 每轮平均价值：${avgValue.toLocaleString("zh-CN")}</div>

    <div style="margin-top: 10px; color:#ffd27a;">按容器等级统计</div>
    ${containerHtml || "<div>无</div>"}

    <div style="margin-top: 10px; color:#ffd27a;">按品质统计</div>
    ${qualityHtml || "<div>无</div>"}

    <div style="margin-top: 10px; color:#ffd27a;">按物品统计（按品质分类）</div>
    ${itemHtml || "<div>无</div>"}
  `;
}

function renderRoomRounds(result) {
  if (!result || !result.rounds || !result.rounds.length) {
    roundListEl.className = "round-list empty";
    roundListEl.innerHTML = "暂无结果";
    return;
  }

  roundListEl.className = "round-list";
  roundListEl.innerHTML = result.rounds.map((round) => {
    const roomMeta = DATA.roomMeta?.[result.roomName] || {};
    const bigRegion = roomMeta.bigRegion || "未分区";
    const containerCount = round.containers?.length || 0;

    const containerHtml = containerCount
      ? round.containers.map((container) => {
          const dropsHtml = container.drops.length
            ? container.drops.map((drop) => `
                <div style="
                  padding:6px 0 6px 8px;
                  line-height:1.8;
                  border-top:1px solid rgba(255,255,255,0.05);
                ">
                <span class="drop-item-name">${drop.itemName}</span>
                ｜ 掉落等级${drop.dropLevel}
                ｜ 品质${drop.quality}
                ｜ 分类：${drop.category || "-"}
                ｜ 价值：${Number(drop.itemValue || 0).toLocaleString("zh-CN")}
                </div>
              `).join("")
            : `<div style="padding:6px 0 6px 8px; color:#9fb3c8;">该容器本次未掉落物品</div>`;

          const spawnTypeLabel = container.spawnType === 'fixed' ? '固定' : '随机';
          return `
            <div class="round-card" style="margin-bottom:10px;">
              <div class="container-title" style="margin-bottom:6px;">
                ${container.instanceIndex}#容器：${container.containerName}
                ｜ 刷新类型：${spawnTypeLabel}
                ｜ 来源房间：${container.sourceRoomName || result.roomName || "-"}
                ｜ 容器等级：${container.drops?.[0]?.containerLevel || "-"}
                ｜ 该容器小计价值：${Number(container.totalValue || 0).toLocaleString("zh-CN")}
              </div>
              ${dropsHtml}
            </div>
          `;
        }).join("")
      : `<div class="drop-item">该房间本次未刷出任何容器</div>`;

    return `
      <div class="round-card">
        <div class="room-title" style="margin-bottom:10px;">
          房间：${result.roomName}
          ｜ 所属大区域：${bigRegion}
          ｜ 刷出容器数量：${containerCount} 个
          ｜ 该房间小计价值：${Number(round.roundValue || 0).toLocaleString("zh-CN")}
        </div>
        ${containerHtml}
      </div>
    `;
  }).join("");
}

function renderRoomSummary(result) {
  const roomMeta = DATA.roomMeta?.[result.roomName] || {};
  const bigRegion = roomMeta.bigRegion || "未分区";

  // 按容器等级分组，按等级顺序排序
  const containersByLevel = {};
  Object.entries(result.summary.byContainer || {}).forEach(([containerName, data]) => {
    const level = data.containerLevel || "未知";
    if (!containersByLevel[level]) {
      containersByLevel[level] = [];
    }
    containersByLevel[level].push({ containerName, ...data });
  });

  const containerHtml = Object.entries(containersByLevel)
    .sort((a, b) => getContainerLevelOrder(a[0]) - getContainerLevelOrder(b[0]))
    .map(([level, containers]) => {
      const levelTotal = containers.reduce((sum, c) => sum + c.count, 0);
      const containersHtml = containers
        .map(c => `<div style="padding:4px 0 4px 12px; border-top:1px solid rgba(255,255,255,0.03);">${c.containerName}：${c.count}</div>`)
        .join("");

      return `<details style="margin-bottom:8px; background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px;">
        <summary style="cursor:pointer; color:#ffe3a3; font-weight:bold; outline:none;">
          ${level} (${containers.length} 种，共 ${levelTotal} 个)
        </summary>
        <div style="margin-top:8px;">
          ${containersHtml}
        </div>
      </details>`;
    })
    .join("");

  // 按品质统计，按固定品质顺序显示
  const qualityHtml = Object.entries(result.summary.byQuality || {})
    .sort((a, b) => getQualityOrder(a[0]) - getQualityOrder(b[0]))
    .map(([quality, data]) => {
      const avgValue = data.count > 0 ? Math.round(data.totalValue / data.count) : 0;
      return `<div>品质 ${quality}：${data.count} 件 | 总价值：${Number(data.totalValue || 0).toLocaleString("zh-CN")} | 平均价值：${Number(avgValue).toLocaleString("zh-CN")}</div>`;
    })
    .join("");

  // 按物品统计，按品质分组，支持展开/折叠，按品质顺序排序
  const itemsByQuality = {};
  Object.entries(result.summary.byItem || {}).forEach(([itemName, data]) => {
    const quality = data.quality;
    if (!itemsByQuality[quality]) {
      itemsByQuality[quality] = [];
    }
    itemsByQuality[quality].push({ itemName, ...data });
  });

  const itemHtml = Object.entries(itemsByQuality)
    .sort((a, b) => getQualityOrder(a[0]) - getQualityOrder(b[0]))
    .map(([quality, items]) => {
      const qualityTotal = items.reduce((sum, item) => sum + (item.totalValue || 0), 0);
      const itemsHtml = items
        .sort((a, b) => b.totalValue - a.totalValue)
        .map(item => {
          const avgValue = item.count > 0 ? Math.round(item.totalValue / item.count) : 0;
          return `<div style="padding:4px 0 4px 12px; border-top:1px solid rgba(255,255,255,0.03);">
            <span class="drop-item-name">${item.itemName}</span>：${item.count} 件 | 总价值：${Number(item.totalValue || 0).toLocaleString("zh-CN")} | 平均价值：${Number(avgValue).toLocaleString("zh-CN")}
          </div>`;
        })
        .join("");

      return `<details style="margin-bottom:8px; background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px;">
        <summary style="cursor:pointer; color:#ffe3a3; font-weight:bold; outline:none;">
          品质 ${quality} (${items.length} 种，共 ${items.reduce((sum, i) => sum + i.count, 0)} 件，总价值：${Number(qualityTotal || 0).toLocaleString("zh-CN")})
        </summary>
        <div style="margin-top:8px;">
          ${itemsHtml}
        </div>
      </details>`;
    })
    .join("");

  summaryBoxEl.className = "summary-box";
  summaryBoxEl.innerHTML = `
    <div>模式：按房间搜索 | 房间：${result.roomName} | 所属大区域：${bigRegion} | 搜索房间次数：${result.roomSearchTimes}</div>
    <div style="margin-bottom: 8px;">本次总掉落上限：${result.globalLimit} | 实际总掉落数：${result.totalDropped} | 本次搜索总价值：${Number(result.totalValue || 0).toLocaleString("zh-CN")} | 每轮平均价值：${result.roomSearchTimes > 0 ? Math.round(Number(result.totalValue || 0) / result.roomSearchTimes).toLocaleString("zh-CN") : "0"}</div>

    <div style="margin-top: 10px; color:#ffd27a;">按容器等级统计</div>
    ${containerHtml || "<div>无</div>"}

    <div style="margin-top: 10px; color:#ffd27a;">按品质统计</div>
    ${qualityHtml || "<div>无</div>"}

    <div style="margin-top: 10px; color:#ffd27a;">按物品统计（按品质分类）</div>
    ${itemHtml || "<div>无</div>"}
  `;
}

function renderAllRoomsResult(result) {
  if (!result || !result.rounds || !result.rounds.length) {
    roundListEl.className = "round-list empty";
    roundListEl.innerHTML = "暂无结果";
    return;
  }

  roundListEl.className = "round-list";
  roundListEl.innerHTML = result.rounds.map((round) => {
    const roomHtml = round.rooms.length
      ? round.rooms.map((room) => {
          const containerCount = room.containers?.length || 0;

          const containerHtml = containerCount
            ? room.containers.map((container) => {
                const dropsHtml = container.drops.length
                  ? container.drops.map((drop) => `
                      <div style="
                        padding:6px 0 6px 8px;
                        line-height:1.8;
                        border-top:1px solid rgba(255,255,255,0.05);
                      ">
                        <span class="drop-item-name">${drop.itemName}</span>
                        ｜ 掉落等级${drop.dropLevel}
                        ｜ 品质${drop.quality}
                        ｜ 分类：${drop.category || "-"}
                        ｜ 价值：${Number(drop.itemValue || 0).toLocaleString("zh-CN")}
                      </div>
                    `).join("")
                  : `<div style="padding:6px 0 6px 8px; color:#9fb3c8;">该容器本次未掉落物品</div>`;

                const spawnTypeLabel = container.spawnType === 'fixed' ? '固定' : '随机';
                return `
                  <div class="round-card" style="margin-bottom:10px;">
                    <div class="container-title" style="margin-bottom:6px;">
                      ${container.instanceIndex}#容器：${container.containerName}
                      ｜ 刷新类型：${spawnTypeLabel}
                      ｜ 来源房间：${container.sourceRoomName || room.roomName}
                      ｜ 容器等级：${container.drops?.[0]?.containerLevel || "-"}
                      ｜ 该容器小计价值：${Number(container.totalValue || 0).toLocaleString("zh-CN")}
                    </div>
                    ${dropsHtml}
                  </div>
                `;
              }).join("")
            : `<div class="drop-item">该房间本次未刷出任何容器</div>`;

          return `
            <div class="round-card" style="margin-bottom:14px;">
              <div class="room-title" style="margin-bottom:10px;">
                房间：${room.roomName}
                ｜ 所属大区域：${room.bigRegion || "未分区"}
                ｜ 刷出容器数量：${containerCount} 个
                ｜ 该房间小计价值：${Number(room.roomValue || 0).toLocaleString("zh-CN")}
              </div>
              ${containerHtml}
            </div>
          `;
        }).join("")
      : `<div class="drop-item">本轮没有房间结果</div>`;

    return `
      <div class="round-card">
        <div class="round-title">第 ${round.round} 轮房间汇总搜索</div>
        <div style="margin-bottom:10px; color:#ffd27a;">
          本轮总价值：${Number(round.roundValue || 0).toLocaleString("zh-CN")}
        </div>
        ${roomHtml}
      </div>
    `;
  }).join("");
}

function renderAllRoomsSummary(result) {
  const rounds = result.rounds || [];

  const groupedRoundHtml = [];
  for (let i = 0; i < rounds.length; i += 10) {
    const group = rounds.slice(i, i + 10);
    const start = group[0]?.round ?? i + 1;
    const end = group[group.length - 1]?.round ?? i + group.length;

    const groupTotal = group.reduce((sum, round) => sum + Number(round.roundValue || 0), 0);

    const groupItemsHtml = group
      .map((round) => {
        return `<div style="padding:4px 0;">第 ${round.round} 轮：${Number(round.roundValue || 0).toLocaleString("zh-CN")}</div>`;
      })
      .join("");

    groupedRoundHtml.push(`
      <details style="margin-bottom:10px; background:rgba(255,255,255,0.04); border-radius:10px; padding:10px 12px;">
        <summary style="cursor:pointer; color:#ffe3a3; font-weight:bold; outline:none;">
          第 ${start}-${end} 轮（小计：${groupTotal.toLocaleString("zh-CN")}）
        </summary>
        <div style="margin-top:8px; color:#edf2f7;">
          ${groupItemsHtml}
        </div>
      </details>
    `);
  }

  const regionEntries = Object.entries(result.summary.byRegion || {})
    .sort((a, b) => b[1].totalValue - a[1].totalValue);
  
  const totalRegionValue = regionEntries.reduce((sum, [, stat]) => sum + Number(stat.totalValue || 0), 0);
  
  const regionHtml = regionEntries
    .map(([region, stat]) => {
      const avgValue = result.roomSearchTimes > 0 ? Math.round(Number(stat.totalValue || 0) / result.roomSearchTimes) : 0;
      const percentValue = totalRegionValue > 0 ? ((Number(stat.totalValue || 0) / totalRegionValue) * 100).toFixed(2) : "0.00";
      return `
      <div style="margin-bottom:6px; display:grid; grid-template-columns: 100px 1fr; gap: 10px; align-items: center;">
        <strong style="color:#ffe3a3;">${region}</strong>
        <div>房间数：${stat.roomCount} ｜ 容器数：${stat.containerCount} ｜ 掉落数：${stat.dropCount} ｜ 总价值：${Number(stat.totalValue || 0).toLocaleString("zh-CN")} ｜ 平均价值：${avgValue.toLocaleString("zh-CN")} ｜ 价值占比：${percentValue}%</div>
      </div>
    `;
    })
    .join("");

  // 按容器等级分组
  const containersByLevel = {};
  Object.entries(result.summary.byContainer || {}).forEach(([containerName, data]) => {
    const level = data.containerLevel || "未知";
    if (!containersByLevel[level]) {
      containersByLevel[level] = [];
    }
    containersByLevel[level].push({ containerName, ...data });
  });

  const containerHtml = Object.entries(containersByLevel)
    .sort((a, b) => getContainerLevelOrder(a[0]) - getContainerLevelOrder(b[0]))
    .map(([level, containers]) => {
      const levelTotal = containers.reduce((sum, c) => sum + c.count, 0);
      const containersHtml = containers
        .map(c => `<div style="padding:4px 0 4px 12px; border-top:1px solid rgba(255,255,255,0.03);">${c.containerName}：${c.count}</div>`)
        .join("");

      return `<details style="margin-bottom:8px; background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px;">
        <summary style="cursor:pointer; color:#ffe3a3; font-weight:bold; outline:none;">
          ${level} (${containers.length} 种，共 ${levelTotal} 个)
        </summary>
        <div style="margin-top:8px;">
          ${containersHtml}
        </div>
      </details>`;
    })
    .join("");

  // 按品质统计，按固定品质顺序显示
  const qualityHtml = Object.entries(result.summary.byQuality || {})
    .sort((a, b) => getQualityOrder(a[0]) - getQualityOrder(b[0]))
    .map(([quality, data]) => {
      const avgValue = data.count > 0 ? Math.round(data.totalValue / data.count) : 0;
      return `<div>品质 ${quality}：${data.count} 件 | 总价值：${Number(data.totalValue || 0).toLocaleString("zh-CN")} | 平均价值：${Number(avgValue).toLocaleString("zh-CN")}</div>`;
    })
    .join("");

  // 按物品统计，按品质分组，支持展开/折叠
  const itemsByQuality = {};
  Object.entries(result.summary.byItem || {}).forEach(([itemName, data]) => {
    const quality = data.quality;
    if (!itemsByQuality[quality]) {
      itemsByQuality[quality] = [];
    }
    itemsByQuality[quality].push({ itemName, ...data });
  });

  const itemHtml = Object.entries(itemsByQuality)
    .sort((a, b) => getQualityOrder(a[0]) - getQualityOrder(b[0]))
    .map(([quality, items]) => {
      const qualityTotal = items.reduce((sum, item) => sum + (item.totalValue || 0), 0);
      const itemsHtml = items
        .sort((a, b) => b.totalValue - a.totalValue)
        .map(item => {
          const avgValue = item.count > 0 ? Math.round(item.totalValue / item.count) : 0;
          return `<div style="padding:4px 0 4px 12px; border-top:1px solid rgba(255,255,255,0.03);">
            <span class="drop-item-name">${item.itemName}</span>：${item.count} 件 | 总价值：${Number(item.totalValue || 0).toLocaleString("zh-CN")} | 平均价值：${Number(avgValue).toLocaleString("zh-CN")}
          </div>`;
        })
        .join("");

      return `<details style="margin-bottom:8px; background:rgba(255,255,255,0.04); border-radius:6px; padding:10px 12px;">
        <summary style="cursor:pointer; color:#ffe3a3; font-weight:bold; outline:none;">
          品质 ${quality} (${items.length} 种，共 ${items.reduce((sum, i) => sum + i.count, 0)} 件，总价值：${Number(qualityTotal || 0).toLocaleString("zh-CN")})
        </summary>
        <div style="margin-top:8px;">
          ${itemsHtml}
        </div>
      </details>`;
    })
    .join("");

  summaryBoxEl.className = "summary-box";
  const avgValue = result.roomSearchTimes > 0 ? Math.round(Number(result.totalValue || 0) / result.roomSearchTimes) : 0;
  summaryBoxEl.innerHTML = `
    <div>模式：房间汇总搜索 | 说明：所有房间各搜索一遍 | 轮数：${result.roomSearchTimes}</div>
    <div>本次总掉落上限：${result.globalLimit} | 实际总掉落数：${result.totalDropped} | 本次搜索总价值：${Number(result.totalValue || 0).toLocaleString("zh-CN")} | 每轮平均价值：${avgValue.toLocaleString("zh-CN")}</div>

    <div style="margin-top: 1px; color:#ffd27a;">每轮价值统计（每 10 轮一组）</div>
    <div style="margin-top:8px;">
      ${groupedRoundHtml.join("") || "<div>无</div>"}
    </div>

    <div style="margin-top: 12px; color:#ffd27a;">按大区域统计</div>
    ${regionHtml || "<div>无</div>"}

    <div style="margin-top: 12px; color:#ffd27a;">按容器等级统计</div>
    ${containerHtml || "<div>无</div>"}

    <div style="margin-top: 12px; color:#ffd27a;">按品质统计</div>
    ${qualityHtml || "<div>无</div>"}

    <div style="margin-top: 12px; color:#ffd27a;">按物品统计（按品质分类）</div>
    ${itemHtml || "<div>无</div>"}
  `;
}

function simulateContainerAction() {
  try {
    const isAll = containerSelectEl.value === "__ALL__";
    setStatus(isAll ? "正在模拟容器汇总搜索..." : "正在模拟容器搜索...");

    const result =
      containerSelectEl.value === "__ALL__"
        ? simulateAllContainers(Number(searchTimesEl.value), Number(globalLimitEl.value))
        : simulateContainerSearch(containerSelectEl.value, Number(searchTimesEl.value), Number(globalLimitEl.value));

    if (result.mode === "container-all") {
      renderAllContainersRounds(result);
      renderAllContainersSummary(result);
      setStatus("容器汇总搜索模拟完成");
    } else {
      renderContainerRounds(result);
      renderContainerSummary(result);
      setStatus("容器搜索模拟完成");
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

function simulateRoomAction() {
  try {
    const isAllRooms = roomSelectEl.value === "__ROOM_ALL__";
    setStatus(isAllRooms ? "正在模拟房间汇总搜索..." : "正在模拟房间搜索...");

    const result =
      roomSelectEl.value === "__ROOM_ALL__"
        ? simulateAllRooms(Number(roomSearchTimesEl.value), Number(roomGlobalLimitEl.value))
        : simulateRoom(roomSelectEl.value, Number(roomSearchTimesEl.value), Number(roomGlobalLimitEl.value));

    if (result.mode === "room-all") {
      renderAllRoomsResult(result);
      renderAllRoomsSummary(result);
      setStatus("房间汇总搜索模拟完成");
    } else {
      renderRoomRounds(result);
      renderRoomSummary(result);
      setStatus("房间搜索模拟完成");
    }
  } catch (error) {
    setStatus(error.message, true);
  }
}

simulateBtn.addEventListener("click", simulateContainerAction);
simulateRoomBtn.addEventListener("click", simulateRoomAction);

initMeta();