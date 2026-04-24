const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");

const DATA_DIR = path.join(__dirname, "data");
const OUTPUT_FILE = path.join(__dirname, "data.js");

function cleanText(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  if (typeof value === "number") return value;
  const text = cleanText(value).replace(/,/g, "");
  if (!text) return NaN;
  return Number(text);
}

function pickFile(predicate) {
  const files = fs.readdirSync(DATA_DIR);
  const found = files.find((file) => predicate(file.toLowerCase(), file));
  if (!found) {
    throw new Error("未找到所需数据表，请检查 data 文件夹中的文件名。");
  }
  return path.join(DATA_DIR, found);
}

function getDataFiles() {
  return {
    vessel: pickFile((lower, file) => {
      return (
        lower.startsWith("c_vessel") &&
        !lower.includes("name") &&
        !lower.includes("distribute") &&
        !lower.includes("distrybute") &&
        !file.includes("容器名称")
      );
    }),
    dropColor: pickFile((lower) => lower.startsWith("c_dropcolor")),
    dropItems: pickFile((lower) => lower.startsWith("c_dropitems") || lower.startsWith("c_dropitem")),
    items: pickFile((lower) => lower.startsWith("c_items")),
    vesselName: pickFile((lower, file) => {
      return lower.startsWith("c_vesselname") || lower.startsWith("c_vesslename") || file.includes("容器名称");
    }),
    vesselDistribute: pickFile((lower, file) => {
      return (
        (lower.includes("distr") || lower.includes("distrib")) &&
        !lower.includes("weight") &&
        !file.includes("权重")
      );
    }),
    vesselDistributeWeight: pickFile((lower, file) => {
      return (
        (lower.includes("distr") || lower.includes("distrib")) &&
        (lower.includes("weight") || file.includes("权重"))
      );
    }),
    roomArea: pickFile((lower, file) => {
      return lower.startsWith("c_roomarea") || file.includes("房间区域");
    })
  };
}

function readSheetAsObjects(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

  if (!rows.length) return [];

  const headers = rows[0].map((v) => cleanText(v));

  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

function readRawSheet(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
}

function parseRoomAreaSheet(filePath) {
  const rows = readSheetAsObjects(filePath)
    .map((row) => ({
      seq: toNumber(row["序号"]),
      bigRegion: cleanText(row["所属区域"]),
      roomName: cleanText(row["房间"])
    }))
    .filter((row) => row.roomName);

  const roomAreaMap = {};
  for (const row of rows) {
    roomAreaMap[row.roomName] = {
      roomName: row.roomName,
      bigRegion: row.bigRegion || "未分区"
    };
  }

  return roomAreaMap;
}

function parseFixedRandomCell(value) {
  const text = cleanText(value);
  if (!text) return { fixedCount: 0, randomCount: 0 };

  const normalized = text.replace(/，/g, ",");
  const parts = normalized.split(",").map((x) => toNumber(x));

  return {
    fixedCount: Number.isFinite(parts[0]) ? parts[0] : 0,
    randomCount: Number.isFinite(parts[1]) ? parts[1] : 0
  };
}

function findCellPosition(rows, keyword) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const text = cleanText(rows[r][c]);
      if (text.includes(keyword)) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

function isNumericLike(text) {
  return /^-?\d+(\.\d+)?$/.test(text);
}

function extractRoomName(rows, col, endRowExclusive) {
  const ignore = new Set([
    "大区域",
    "小区域",
    "总容器",
    "总容器数",
    "容器序号",
    "掉落布局",
    "随机容器出现权重"
  ]);

  let candidate = "";
  for (let r = 0; r < endRowExclusive; r++) {
    const text = cleanText(rows[r]?.[col]);
    if (!text) continue;
    if (ignore.has(text)) continue;
    if (isNumericLike(text)) continue;
    candidate = text;
  }
  return candidate;
}

function parseRoomMatrixSheet(filePath, valueParser) {
  const rows = readRawSheet(filePath);

  const idPos = findCellPosition(rows, "容器序号");
  const namePos = findCellPosition(rows, "掉落布局");

  if (!idPos || !namePos) {
    throw new Error(`表 ${path.basename(filePath)} 中未找到“容器序号”或“掉落布局”区域。`);
  }

  const headerRow = idPos.row;
  const idCol = idPos.col;
  const nameCol = namePos.col;
  const roomStartCol = nameCol + 1;
  const maxCol = Math.max(...rows.map((r) => r.length));

  const roomColumns = [];
  for (let col = roomStartCol; col < maxCol; col++) {
    const roomName = extractRoomName(rows, col, headerRow);
    if (roomName) {
      roomColumns.push({ col, roomName });
    }
  }

  if (!roomColumns.length) {
    throw new Error(`表 ${path.basename(filePath)} 中未识别到任何房间列。`);
  }

  const entries = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    const containerId = toNumber(row[idCol]);
    const containerName = cleanText(row[nameCol]);

    if (!Number.isFinite(containerId) || containerId <= 0) continue;
    if (!containerName) continue;

    const values = {};
    for (const roomCol of roomColumns) {
      values[roomCol.roomName] = valueParser(row[roomCol.col]);
    }

    entries.push({
      containerId,
      containerName,
      values
    });
  }

  return {
    roomNames: roomColumns.map((x) => x.roomName),
    entries
  };
}

function buildRoomDistribution(distributeFile, weightFile) {
  const distributeData = parseRoomMatrixSheet(distributeFile, parseFixedRandomCell);
  const weightData = parseRoomMatrixSheet(weightFile, (value) => {
    const num = toNumber(value);
    return Number.isFinite(num) ? num : 0;
  });

  const roomNames = [...new Set([...distributeData.roomNames, ...weightData.roomNames])];
  const weightMap = new Map();

  for (const entry of weightData.entries) {
    for (const roomName of weightData.roomNames) {
      const probability = entry.values[roomName] || 0;
      weightMap.set(`${entry.containerName}__${roomName}`, probability);
    }
  }

  const roomMap = {};
  const roomMeta = {};

  for (const roomName of roomNames) {
    roomMap[roomName] = [];
    roomMeta[roomName] = {
      roomName,
      bigRegion: "未分区"
    };
  }

  for (const entry of distributeData.entries) {
    for (const roomName of distributeData.roomNames) {
      const parsed = entry.values[roomName] || { fixedCount: 0, randomCount: 0 };
      const randomProbability = weightMap.get(`${entry.containerName}__${roomName}`) || 0;

      if (parsed.fixedCount > 0 || parsed.randomCount > 0) {
        roomMap[roomName].push({
          containerId: entry.containerId,
          containerName: entry.containerName,
          fixedCount: parsed.fixedCount,
          randomCount: parsed.randomCount,
          randomProbability
        });
      }
    }
  }

  return {
    roomNames,
    roomMap,
    roomMeta
  };
}

function buildStaticData() {
  const files = getDataFiles();

  const vesselRows = readSheetAsObjects(files.vessel)
    .map((row) => ({
      seq: toNumber(row["序号"]),
      containerLevel: cleanText(row["容器等级"]),
      dropLevel: cleanText(row["掉落等级"]),
      containerName: cleanText(row["容器名称"]),
      dropGroupId: cleanText(row["掉落组ID"]),
      dropItemId: cleanText(row["掉落物ID"]),
      probability: toNumber(row["概率万分比"]),
      minDrop: toNumber(row["最少掉落"]),
      maxDrop: toNumber(row["最多掉落"])
    }))
    .filter((row) =>
      row.containerName &&
      !Number.isNaN(row.probability) &&
      row.probability > 0 &&
      !Number.isNaN(row.minDrop) &&
      !Number.isNaN(row.maxDrop)
    )
    .sort((a, b) => a.seq - b.seq);

  const dropColorRows = readSheetAsObjects(files.dropColor)
    .map((row) => ({
      id: toNumber(row["id"]),
      containerName: cleanText(row["容器名称"]),
      dropLevel: cleanText(row["掉落等级"]),
      quality: cleanText(row["掉落品质"]),
      dropItemId: cleanText(row["掉落物ID"]),
      weight: toNumber(row["权重万分比"])
    }))
    .filter((row) =>
      row.containerName &&
      row.dropLevel &&
      row.quality &&
      !Number.isNaN(row.weight) &&
      row.weight > 0
    );

  const dropItemsRows = readSheetAsObjects(files.dropItems)
    .map((row) => ({
      id: toNumber(row["ID"]),
      containerLevel: cleanText(row["容器等级"]),
      containerName: cleanText(row["容器名称"]),
      quality: cleanText(row["掉落品质"]),
      itemName: cleanText(row["掉落物"]),
      weight: toNumber(row["权重万分比"])
    }))
    .filter((row) =>
      row.containerName &&
      row.quality &&
      row.itemName &&
      !Number.isNaN(row.weight) &&
      row.weight > 0
    );

  const itemRows = readSheetAsObjects(files.items)
    .map((row) => ({
      id: toNumber(row["序号"]),
      itemName: cleanText(row["物品名称"]),
      category: cleanText(row["物品分类"]),
      quality: cleanText(row["品质"]),
      itemValue: toNumber(row["初始定价"]) || 0
    }))
    .filter((row) => row.itemName);

  const vesselNameRows = readSheetAsObjects(files.vesselName)
    .map((row) => ({
      containerId: toNumber(row["容器id"]),
      containerName: cleanText(row["容器名称"])
    }))
    .filter((row) => row.containerName);

  const roomDistribution = buildRoomDistribution(files.vesselDistribute, files.vesselDistributeWeight);
  const roomAreaMap = parseRoomAreaSheet(files.roomArea);

  for (const roomName of Object.keys(roomDistribution.roomMeta)) {
    const areaInfo = roomAreaMap[roomName];
    if (areaInfo) {
      roomDistribution.roomMeta[roomName] = {
        ...roomDistribution.roomMeta[roomName],
        bigRegion: areaInfo.bigRegion || "未分区"
      };
    }
  }

  const data = {
    vesselRows,
    dropColorRows,
    dropItemsRows,
    itemRows,
    vesselNameRows,
    containerNames: [...new Set(vesselRows.map((row) => row.containerName))],
    roomNames: roomDistribution.roomNames,
    roomMap: roomDistribution.roomMap,
    roomMeta: roomDistribution.roomMeta,
    meta: {
      lastBuiltAt: new Date().toLocaleString("zh-CN"),
      counts: {
        vesselRules: vesselRows.length,
        colorRules: dropColorRows.length,
        itemRules: dropItemsRows.length,
        roomCount: roomDistribution.roomNames.length
      }
    }
  };

  const content = `window.DROP_DATA = ${JSON.stringify(data, null, 2)};`;
  fs.writeFileSync(OUTPUT_FILE, content, "utf8");
  console.log("已生成数据文件：", OUTPUT_FILE);
}

buildStaticData();