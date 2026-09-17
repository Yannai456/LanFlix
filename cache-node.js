const express = require("express");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { Bonjour } = require("bonjour-service");

const PORT = process.env.CACHE_PORT || 8100;
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, "cache-storage");
const CACHE_SECRET = process.env.CACHE_SECRET;
const MAX_CACHE_BYTES = Number(process.env.CACHE_MAX_MB || 20000) * 1024 * 1024;
const MANUAL_MAIN_SERVER = process.env.MAIN_SERVER_URL || null;

if (!CACHE_SECRET) {
  console.error("Missing CACHE_SECRET. Copy the pairing secret printed by the main server's startup log and set it here, e.g.:");
  console.error('  CACHE_SECRET="the-secret-from-main-server" node cache-node.js\n');
  process.exit(1);
}

fs.mkdirSync(CACHE_DIR, { recursive: true });

const nodeId = generateNodeId();
let mainServerUrl = MANUAL_MAIN_SERVER;
let localLibraryVersion = null;

function generateNodeId() {
  return "cache-" + Math.random().toString(36).slice(2, 10);
}

function findMainServerViaMdns() {
  return new Promise((resolve) => {
    if (MANUAL_MAIN_SERVER) return resolve(MANUAL_MAIN_SERVER);

    const bonjour = new Bonjour();
    console.log("Looking for a Lan flix server on the LAN (mDNS)...");
    const browser = bonjour.find({ type: "lanflix" });

    const timeout = setTimeout(() => {
      browser.stop();
      bonjour.destroy();
      resolve(null);
    }, 8000);

    browser.on("up", (service) => {
      clearTimeout(timeout);
      const address = service.referer && service.referer.address ? service.referer.address : service.addresses[0];
      const url = `http://${address}:${service.port}`;
      console.log(`Found Lan flix server via mDNS at ${url}`);
      browser.stop();
      bonjour.destroy();
      resolve(url);
    });
  });
}

async function registerWithMainServer() {
  try {
    const res = await fetch(`${mainServerUrl}/internal/register-cache-node`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Cache-Secret": CACHE_SECRET },
      body: JSON.stringify({ id: nodeId, port: Number(PORT) }),
    });
    if (!res.ok) throw new Error("Registration failed: " + res.status);
    await res.json();
    return true;
  } catch (err) {
    console.error("Could not register with main server:", err.message);
    return false;
  }
}

function cachePathFor(filename) {
  return path.join(CACHE_DIR, encodeURIComponent(filename));
}

function indexPath() {
  return path.join(CACHE_DIR, ".index.json");
}

function loadIndex() {
  try {
    return JSON.parse(fs.readFileSync(indexPath(), "utf8"));
  } catch {
    return {};
  }
}

function saveIndex(index) {
  fs.writeFileSync(indexPath(), JSON.stringify(index, null, 2));
}

function touchIndex(filename, sizeBytes) {
  const index = loadIndex();
  index[filename] = { lastAccess: Date.now(), sizeBytes };
  saveIndex(index);
}

function currentCacheSize() {
  const index = loadIndex();
  return Object.values(index).reduce((sum, entry) => sum + (entry.sizeBytes || 0), 0);
}

function evictIfNeeded(incomingBytes) {
  let index = loadIndex();
  let size = currentCacheSize();

  const entries = Object.entries(index).sort((a, b) => a[1].lastAccess - b[1].lastAccess);

  while (size + incomingBytes > MAX_CACHE_BYTES && entries.length > 0) {
    const [filename, entry] = entries.shift();
    const filePath = cachePathFor(filename);
    fs.unlink(filePath, () => {});
    size -= entry.sizeBytes || 0;
    delete index[filename];
    console.log(`Evicted "${filename}" from local cache (LRU) to make room`);
  }

  saveIndex(index);
}

async function invalidateIfLibraryChanged() {
  try {
    const res = await fetch(`${mainServerUrl}/internal/cache-manifest`, {
      headers: { "X-Cache-Secret": CACHE_SECRET },
    });
    if (!res.ok) return;
    const data = await res.json();

    if (localLibraryVersion !== null && data.libraryVersion === localLibraryVersion) {
      return;
    }

    const validFilenames = new Set(data.filenames);
    const index = loadIndex();
    let changed = false;

    for (const filename of Object.keys(index)) {
      if (!validFilenames.has(filename)) {
        fs.unlink(cachePathFor(filename), () => {});
        delete index[filename];
        changed = true;
        console.log(`Invalidated cached copy of "${filename}" (deleted, renamed, or made private on the main server)`);
      }
    }

    if (changed) saveIndex(index);
    localLibraryVersion = data.libraryVersion;
  } catch (err) {
    console.error("Could not check for library changes:", err.message);
  }
}

const app = express();

app.get("/video/:filename", async (req, res) => {
  const filename = path.basename(req.params.filename);
  const cachePath = cachePathFor(filename);

  if (fs.existsSync(cachePath)) {
    const stats = fs.statSync(cachePath);
    touchIndex(filename, stats.size);
    res.setHeader("X-Served-By", "cache-node");
    return fs.createReadStream(cachePath).pipe(res);
  }

  try {
    const upstream = await fetch(`${mainServerUrl}/internal/cache-fetch/${encodeURIComponent(filename)}`, {
      headers: { "X-Cache-Secret": CACHE_SECRET },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send("Could not fetch from main server");
    }

    const sizeBytes = Number(upstream.headers.get("content-length") || 0);
    evictIfNeeded(sizeBytes);

    res.setHeader("X-Served-By", "cache-node-fresh-pull");
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/octet-stream");

    const tempPath = cachePath + ".downloading";
    const fileStream = fs.createWriteStream(tempPath);
    const reader = upstream.body.getReader();

    async function pump() {
      const { done, value } = await reader.read();
      if (done) {
        fileStream.end();
        fs.renameSync(tempPath, cachePath);
        touchIndex(filename, sizeBytes);
        return;
      }
      const buf = Buffer.from(value);
      fileStream.write(buf);
      res.write(buf);
      pump();
    }

    res.on("close", () => {});
    await pump();
    res.end();
  } catch (err) {
    console.error("Pull-through fetch failed:", err.message);
    if (!res.headersSent) res.status(502).send("Cache node could not reach main server");
  }
});

app.get("/status", (req, res) => {
  const index = loadIndex();
  res.json({
    nodeId,
    mainServerUrl,
    cachedFiles: Object.keys(index).length,
    cacheSizeBytes: currentCacheSize(),
    maxCacheBytes: MAX_CACHE_BYTES,
  });
});

async function main() {
  mainServerUrl = await findMainServerViaMdns();

  if (!mainServerUrl) {
    console.error("Could not find a Lan flix server on the LAN via mDNS.");
    console.error("Set MAIN_SERVER_URL manually instead, e.g.:");
    console.error('  MAIN_SERVER_URL="http://192.168.1.50:8000" CACHE_SECRET="..." node cache-node.js\n');
    process.exit(1);
  }

  const registered = await registerWithMainServer();
  if (!registered) {
    console.error("Check that CACHE_SECRET matches the main server's printed secret, and that it's reachable.");
    process.exit(1);
  }

  const bonjour = new Bonjour();
  bonjour.publish({ name: `Lan flix cache (${nodeId})`, type: "lanflix-cache", port: Number(PORT) });

  setInterval(() => registerWithMainServer(), 20 * 1000);
  setInterval(() => invalidateIfLibraryChanged(), 30 * 1000);
  invalidateIfLibraryChanged();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\nLan flix cache node running`);
    console.log(`  Caching from: ${mainServerUrl}`);
    console.log(`  Storage dir:  ${CACHE_DIR}`);
    console.log(`  Max size:     ${(MAX_CACHE_BYTES / (1024 * 1024)).toFixed(0)} MB`);
    console.log(`  Local:        http://localhost:${PORT}`);
    console.log(`  Network:      http://<this-machine's-LAN-IP>:${PORT}\n`);
  });
}

main();
