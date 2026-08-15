const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");

const app = express();
const PORT = process.env.PORT || 8000;
const VIDEO_DIR = process.env.VIDEO_DIR || path.join(__dirname, "videos");
const TAGS_FILE = path.join(VIDEO_DIR, ".homeflix-tags.json");

const VIDEO_EXTENSIONS = new Set([".mp4", ".webm", ".mkv", ".mov", ".m4v"]);
const AUDIO_EXTENSIONS = new Set([".mp3", ".wav", ".flac", ".m4a", ".ogg", ".aac"]);
const MEDIA_EXTENSIONS = new Set([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS]);

app.use(express.json());

// Make sure the video folder actually exists before we try to write into it
fs.mkdirSync(VIDEO_DIR, { recursive: true });

// --- Tag storage: a video can belong to many categories at once. ---
// Stored as { "filename.mp4": ["category1", "category2"] } in a JSON file
// that lives inside VIDEO_DIR, so tags travel with the folder.
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

// --- Upload config: write straight into VIDEO_DIR, keep the original filename ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, VIDEO_DIR),
  filename: (req, file, cb) => {
    // Avoid overwriting an existing file with the same name
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
  limits: { fileSize: 20 * 1024 * 1024 * 1024 }, // 20 GB ceiling, adjust as needed
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(ext)) {
      return cb(new Error("Unsupported file type: " + ext));
    }
    cb(null, true);
  },
});

// Serve the frontend (index.html, style.css, app.js)
app.use(express.static(path.join(__dirname, "public")));

// --- API: list all video files in VIDEO_DIR, with their tags ---
app.get("/api/videos", (req, res) => {
  fs.readdir(VIDEO_DIR, { withFileTypes: true }, (err, entries) => {
    if (err) {
      console.error("Failed to read VIDEO_DIR:", err.message);
      return res.status(500).json({ error: "Could not read video folder" });
    }

    const tags = loadTags();

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
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    res.json(videos);
  });
});

// --- API: get every distinct category currently in use ---
app.get("/api/categories", (req, res) => {
  const tags = loadTags();
  const all = new Set();
  Object.values(tags).forEach((list) => list.forEach((t) => all.add(t)));
  res.json([...all].sort((a, b) => a.localeCompare(b)));
});

// --- API: set the full tag list for one video (a video can be in many categories) ---
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

// --- API: upload a new video into VIDEO_DIR ---
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

// --- API: delete a video from disk (and its tag entry) ---
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

    res.json({ deleted: filename });
  });
});

// --- Stream a specific video, with range support so seeking/scrubbing works ---
app.get("/stream/:filename", (req, res) => {
  const filename = path.basename(req.params.filename); // prevent path traversal
  const filePath = path.join(VIDEO_DIR, filename);

  if (!MEDIA_EXTENSIONS.has(path.extname(filename).toLowerCase())) {
    return res.status(400).send("Not a supported media file");
  }

  fs.stat(filePath, (err, stats) => {
    if (err) return res.status(404).send("File not found");

    const fileSize = stats.size;
    const range = req.headers.range;
    const contentType = getContentType(filename);

    if (!range) {
      // No range header: send the whole file (rare — most browsers send range requests)
      res.writeHead(200, {
        "Content-Length": fileSize,
        "Content-Type": contentType,
      });
      return fs.createReadStream(filePath).pipe(res);
    }

    // Parse "bytes=start-end"
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${fileSize}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": contentType,
    });

    fs.createReadStream(filePath, { start, end }).pipe(res);
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
