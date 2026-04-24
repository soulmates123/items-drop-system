const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DIST_DIR = path.join(ROOT, "dist");
const FILES_TO_COPY = ["index.html", "app.js", "style.css", "data.js"];

function ensureCleanDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

function copyRuntimeFiles() {
  for (const file of FILES_TO_COPY) {
    const from = path.join(ROOT, file);
    const to = path.join(DIST_DIR, file);

    if (!fs.existsSync(from)) {
      throw new Error(`Missing required file: ${file}`);
    }

    fs.copyFileSync(from, to);
  }
}

function write404Page() {
  const indexPath = path.join(DIST_DIR, "index.html");
  const notFoundPath = path.join(DIST_DIR, "404.html");
  fs.copyFileSync(indexPath, notFoundPath);
}

function writeDeployNotes() {
  const notes = {
    generatedAt: new Date().toISOString(),
    publishFiles: ["index.html", "404.html", "app.js", "style.css", "data.js"],
    recommendedHosting: [
      "Tencent CloudBase static hosting",
      "Tencent COS static website hosting",
      "Alibaba Cloud OSS static website hosting"
    ]
  };

  fs.writeFileSync(
    path.join(DIST_DIR, "deploy-manifest.json"),
    JSON.stringify(notes, null, 2),
    "utf8"
  );
}

function buildDist() {
  ensureCleanDir(DIST_DIR);
  copyRuntimeFiles();
  write404Page();
  writeDeployNotes();
  console.log(`Built static publish directory: ${DIST_DIR}`);
}

buildDist();
