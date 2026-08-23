const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 8000;
const VIDEO_DIR = process.env.VIDEO_DIR || path.join(__dirname, "videos");
const TAGS_FILE = path.join(VIDEO_DIR, ".homeflix-tags.json");
const THUMBS_DIR = path.join(VIDEO_DIR, ".homeflix-thumbnails");
const THUMBS_FILE = path.join(VIDEO_DIR, ".homeflix-thumbnails.json");
const TMDB_API_KEY = process.env.TMDB_API_KEY || "";

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mkv", ".mov", ".m4v"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"]);
const MEDIA_EXTENSIONS = new Set([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS]);

app.use(express.json());

fs.mkdirSync(VIDEO_DIR, { recursive: true });
fs.mkdirSync(THUMBS_DIR, { recursive: true });

function loadTags() {
  try {
    return JSON.parse(fs.readFileSync(TAGS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveTags(tags) {
  fs.writeFileSync(TAGS_FILE, JSON.stringify(tags, null, 2));
}

function loadThumbs() {
  try {
    return JSON.parse(fs.readFileSync(THUMBS_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveThumbs(thumbs) {
  fs.writeFileSync(THUMBS_FILE, JSON.stringify(thumbs, null, 2));
}

function deleteThumbFile(storedName) {
  if (!storedName) return;
  const p = path.join(THUMBS_DIR, storedName);
  fs.unlink(p, () => {});
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function getImageContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
    ".gif": "image/gif",
  };
  return types[ext] || "application/octet-stream";
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VIDEO_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext).replace(/[/\\]/g, "_");
    let candidate = base + ext;
    let i = 1;
    while (fs.existsSync(path.join(VIDEO_DIR, candidate))) {
      candidate = `${base} (${i})${ext}`;
      i++;
    }
    cb(null, candidate);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(ext)) {
      return cb(new Error("Unsupported file type: " + ext));
    }
    cb(null, true);
  },
});

const thumbStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, THUMBS_DIR),
  filename: (req, file, cb) => {
    const videoFilename = path.basename(req.params.filename);
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const safeBase = path.basename(videoFilename, path.extname(videoFilename)).replace(/[^a-z0-9]/gi, "_");
    cb(null, `${safeBase}-${Date.now()}${ext}`);
  },
});

const thumbUpload = multer({
  storage: thumbStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(ext)) {
      return cb(new Error("Unsupported image type: " + ext));
    }
    cb(null, true);
  },
});

app.use(express.static(path.join(__dirname, "public"), {
  etag: true,
  setHeaders: (res) => {
    res.setHeader("Cache-Control", "no-cache");
  },
}));

app.get("/api/config", (req, res) => {
  res.json({ posterSearchEnabled: Boolean(TMDB_API_KEY) });
});

app.get("/api/videos", (req, res) => {
  fs.readdir(VIDEO_DIR, { withFileTypes: true }, (err, entries) => {
    if (err) {
      console.error("Failed to read VIDEO_DIR:", err.message);
      return res.status(500).json({ error: "Could not read video folder" });
    }

    const tags = loadTags();
    const thumbs = loadThumbs();

    const videos = entries
      .filter((e) => e.isFile() && MEDIA_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
      .map((e) => {
        const stats = fs.statSync(path.join(VIDEO_DIR, e.name));
        const ext = path.extname(e.name).toLowerCase();
        return {
          filename: e.name,
          title: path.basename(e.name, ext).replace(/[._]/g, " "),
          sizeBytes: stats.size,
          tags: tags[e.name] || [],
          kind: AUDIO_EXTENSIONS.has(ext) ? "audio" : "video",
          hasThumbnail: Boolean(thumbs[e.name]),
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    res.json(videos);
  });
});

app.get("/api/categories", (req, res) => {
  const tags = loadTags();
  const all = new Set();
  Object.values(tags).forEach((list) => list.forEach((t) => all.add(t)));
  res.json([...all].sort((a, b) => a.localeCompare(b)));
});

app.put("/api/videos/:filename/tags", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(VIDEO_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  const incoming = Array.isArray(req.body.tags) ? req.body.tags : [];
  const cleaned = [...new Set(
    incoming
      .map((t) => String(t).trim())
      .filter((t) => t.length > 0)
  )];

  const tags = loadTags();
  if (cleaned.length === 0) {
    delete tags[filename];
  } else {
    tags[filename] = cleaned;
  }
  saveTags(tags);

  res.json({ filename, tags: cleaned });
});

app.post("/api/videos/:filename/thumbnail", (req, res) => {
  const videoFilename = path.basename(req.params.filename);
  const videoPath = path.join(VIDEO_DIR, videoFilename);

  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: "Video not found" });
  }

  thumbUpload.single("thumbnail")(req, res, (err) => {
    if (err) {
      console.error("Thumbnail upload failed:", err.message);
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No image received" });
    }

    const thumbs = loadThumbs();
    const previous = thumbs[videoFilename];
    thumbs[videoFilename] = req.file.filename;
    saveThumbs(thumbs);
    if (previous && previous !== req.file.filename) deleteThumbFile(previous);

    res.json({ filename: videoFilename, thumbnail: req.file.filename });
  });
});

app.delete("/api/videos/:filename/thumbnail", (req, res) => {
  const videoFilename = path.basename(req.params.filename);
  const thumbs = loadThumbs();
  const existing = thumbs[videoFilename];

  if (!existing) {
    return res.json({ filename: videoFilename, removed: false });
  }

  delete thumbs[videoFilename];
  saveThumbs(thumbs);
  deleteThumbFile(existing);

  res.json({ filename: videoFilename, removed: true });
});

app.get("/thumbnail/:filename", (req, res) => {
  const videoFilename = path.basename(req.params.filename);
  const thumbs = loadThumbs();
  const storedName = thumbs[videoFilename];

  if (!storedName) {
    return res.status(404).send("No thumbnail set");
  }

  const thumbPath = path.join(THUMBS_DIR, storedName);
  fs.stat(thumbPath, (err, stats) => {
    if (err) return res.status(404).send("Thumbnail file missing");

    const etag = `"${storedName}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", getImageContentType(storedName));

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    res.setHeader("Content-Length", stats.size);
    fs.createReadStream(thumbPath).pipe(res);
  });
});

app.get("/api/videos/:filename/poster-search", async (req, res) => {
  if (!TMDB_API_KEY) {
    return res.status(501).json({ error: "Poster search isn't configured on this server" });
  }

  const query = String(req.query.title || "").trim();
  if (!query) {
    return res.status(400).json({ error: "Missing title" });
  }

  try {
    const url = `https://api.themoviedb.org/3/search/multi?api_key=${encodeURIComponent(TMDB_API_KEY)}&query=${encodeURIComponent(query)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("TMDB request failed: " + response.status);
    const data = await response.json();

    const results = (data.results || [])
      .filter((r) => r.poster_path)
      .slice(0, 8)
      .map((r) => ({
        id: r.id,
        title: r.title || r.name || query,
        year: (r.release_date || r.first_air_date || "").slice(0, 4),
        posterUrl: `https://image.tmdb.org/t/p/w342${r.poster_path}`,
      }));

    res.json(results);
  } catch (err) {
    console.error("Poster search failed:", err.message);
    res.status(502).json({ error: "Poster search failed" });
  }
});

app.post("/api/videos/:filename/thumbnail-from-url", async (req, res) => {
  if (!TMDB_API_KEY) {
    return res.status(501).json({ error: "Poster search isn't configured on this server" });
  }

  const videoFilename = path.basename(req.params.filename);
  const videoPath = path.join(VIDEO_DIR, videoFilename);
  if (!fs.existsSync(videoPath)) {
    return res.status(404).json({ error: "Video not found" });
  }

  const imageUrl = String(req.body.url || "");
  let parsed;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  if (parsed.hostname !== "image.tmdb.org") {
    return res.status(400).json({ error: "Only TMDB image URLs are allowed" });
  }

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) throw new Error("Image fetch failed: " + response.status);
    const buffer = Buffer.from(await response.arrayBuffer());

    const ext = path.extname(parsed.pathname).toLowerCase() || ".jpg";
    const safeBase = path.basename(videoFilename, path.extname(videoFilename)).replace(/[^a-z0-9]/gi, "_");
    const storedName = `${safeBase}-${Date.now()}${ext}`;
    fs.writeFileSync(path.join(THUMBS_DIR, storedName), buffer);

    const thumbs = loadThumbs();
    const previous = thumbs[videoFilename];
    thumbs[videoFilename] = storedName;
    saveThumbs(thumbs);
    if (previous && previous !== storedName) deleteThumbFile(previous);

    res.json({ filename: videoFilename, thumbnail: storedName });
  } catch (err) {
    console.error("Thumbnail-from-url failed:", err.message);
    res.status(502).json({ error: "Could not save that poster" });
  }
});

app.post("/api/upload", (req, res) => {
  upload.single("video")(req, res, (err) => {
    if (err) {
      console.error("Upload failed:", err.message);
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: "No file received" });
    }
    res.json({ filename: req.file.filename });
  });
});

app.put("/api/videos/:filename/rename", (req, res) => {
  const oldFilename = path.basename(req.params.filename);
  const oldPath = path.join(VIDEO_DIR, oldFilename);

  if (!fs.existsSync(oldPath)) {
    return res.status(404).json({ error: "File not found" });
  }

  const ext = path.extname(oldFilename);
  let newBase = String(req.body.newName || "").trim().replace(/[\/\\]/g, "_");

  if (!newBase) {
    return res.status(400).json({ error: "Name cannot be empty" });
  }

  const newFilename = newBase + ext;
  const newPath = path.join(VIDEO_DIR, newFilename);

  if (newFilename === oldFilename) {
    return res.json({ oldFilename, newFilename });
  }

  if (fs.existsSync(newPath)) {
    return res.status(409).json({ error: "A file with that name already exists" });
  }

  fs.rename(oldPath, newPath, (err) => {
    if (err) {
      console.error("Rename failed:", err.message);
      return res.status(500).json({ error: "Could not rename file" });
    }

    const tags = loadTags();
    if (tags[oldFilename]) {
      tags[newFilename] = tags[oldFilename];
      delete tags[oldFilename];
      saveTags(tags);
    }

    const thumbs = loadThumbs();
    if (thumbs[oldFilename]) {
      thumbs[newFilename] = thumbs[oldFilename];
      delete thumbs[oldFilename];
      saveThumbs(thumbs);
    }

    res.json({ oldFilename, newFilename });
  });
});

app.delete("/api/videos/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(VIDEO_DIR, filename);

  if (!MEDIA_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
    return res.status(400).json({ error: "Not a supported media file" });
  }

  fs.unlink(filePath, (err) => {
    if (err) {
      console.error("Delete failed:", err.message);
      return res.status(err.code === "ENOENT" ? 404 : 500).json({ error: "Could not delete file" });
    }

    const tags = loadTags();
    if (tags[filename]) {
      delete tags[filename];
      saveTags(tags);
    }

    const thumbs = loadThumbs();
    if (thumbs[filename]) {
      deleteThumbFile(thumbs[filename]);
      delete thumbs[filename];
      saveThumbs(thumbs);
    }

    res.json({ deleted: filename });
  });
});

app.get("/stream/:filename", (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(VIDEO_DIR, filename);

  if (!MEDIA_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
    return res.status(400).send("Not a supported media file");
  }

  fs.stat(filePath, (err, stats) => {
    if (err) return res.status(404).send("File not found");

    const fileSize = stats.size;
    const contentType = getContentType(filename);
    const etag = `"${fileSize}-${stats.mtimeMs}"`;
    const lastModified = stats.mtime.toUTCString();

    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", lastModified);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Accept-Ranges", "bytes");

    const ifNoneMatch = req.headers["if-none-match"];
    const ifModifiedSince = req.headers["if-modified-since"];
    if (ifNoneMatch === etag || (ifModifiedSince && new Date(ifModifiedSince) >= stats.mtime)) {
      return res.status(304).end();
    }

    const range = req.headers.range;
    const streamOptions = { highWaterMark: 1024 * 1024 };

    if (!range) {
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType,
      });
      return fs.createReadStream(filePath, streamOptions).pipe(res);
    }

    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Content-Length": chunkSize,
      "Content-Type": contentType,
    });

    fs.createReadStream(filePath, { ...streamOptions, start, end }).pipe(res);
  });
});

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".aac": "audio/aac",
  };
  return types[ext] || "application/octet-stream";
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`\nhomeflix running`);
  console.log(`  Serving folder: ${VIDEO_DIR}`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`  Network: http://<this-machine's-LAN-IP>:${PORT}\n`);
});
