const grid = document.getElementById("grid");
const status = document.getElementById("status");
const overlay = document.getElementById("player-overlay");
const videoEl = document.getElementById("video-el");
const playerTitle = document.getElementById("player-title");
const closeBtn = document.getElementById("close-player");
const uploadBtn = document.getElementById("upload-btn");
const fileInput = document.getElementById("file-input");
const uploadsList = document.getElementById("uploads");
const dropzone = document.getElementById("dropzone");
const searchInput = document.getElementById("search-input");
const categoriesEl = document.getElementById("categories");
const tagModalOverlay = document.getElementById("tag-modal-overlay");
const tagModalTitle = document.getElementById("tag-modal-title");
const tagInput = document.getElementById("tag-input");
const tagCancelBtn = document.getElementById("tag-cancel");
const tagSaveBtn = document.getElementById("tag-save");
const gamepadIndicator = document.getElementById("gamepad-indicator");
const assignBanner = document.getElementById("assign-banner");
const assignCategoryName = document.getElementById("assign-category-name");
const assignDoneBtn = document.getElementById("assign-done");
const musicPlayer = document.getElementById("music-player");
const audioEl = document.getElementById("audio-el");
const visualizerCanvas = document.getElementById("visualizer");
const nameInput = document.getElementById("name-input");
const nameExt = document.getElementById("name-ext");
const settingsBtn = document.getElementById("settings-btn");
const settingsOverlay = document.getElementById("settings-modal-overlay");
const settingsCloseBtn = document.getElementById("settings-close");
const themeGrid = document.getElementById("theme-grid");
const enhanceToggle = document.getElementById("enhance-toggle");
const videoWrap = document.getElementById("video-wrap");
const enhanceCanvas = document.getElementById("enhance-canvas");
const enhanceBadge = document.getElementById("enhance-badge");
const bufferSpinner = document.getElementById("buffer-spinner");
const musicSpinner = document.getElementById("music-spinner");

let allVideos = [];
let activeCategory = null;
let searchTerm = "";
let editingFilename = null;
let editingExt = "";
let assignMode = null;

function formatSize(bytes) {
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) return gb.toFixed(1) + " GB";
  const mb = bytes / (1024 ** 2);
  return mb.toFixed(0) + " MB";
}

const THEMES = [
  { id: "ocean", name: "Ocean", a: "#2dd4c8", b: "#3b82f6" },
  { id: "sunset", name: "Sunset", a: "#f472b6", b: "#a855f7" },
  { id: "grape", name: "Grape", a: "#8b5cf6", b: "#d946ef" },
  { id: "ember", name: "Ember", a: "#fb923c", b: "#ef4444" },
  { id: "forest", name: "Forest", a: "#34d399", b: "#10b981" },
  { id: "rose", name: "Rose", a: "#fb7185", b: "#e11d48" },
  { id: "gold", name: "Gold", a: "#fbbf24", b: "#d97706" },
  { id: "midnight", name: "Midnight", a: "#6366f1", b: "#4338ca" },
  { id: "cyber", name: "Cyber", a: "#22d3ee", b: "#e879f9" },
  { id: "light", name: "Light", a: "#0891a3", b: "#4f46e5" },
  { id: "sand", name: "Sand", a: "#d97706", b: "#c2410c" },
];

function getCurrentTheme() {
  return localStorage.getItem("homeflix-theme") || "ocean";
}

function applyTheme(themeId) {
  document.documentElement.setAttribute("data-theme", themeId);
  localStorage.setItem("homeflix-theme", themeId);
  renderThemeGrid();
}

function renderThemeGrid() {
  const current = getCurrentTheme();
  themeGrid.innerHTML = "";

  THEMES.forEach((theme) => {
    const swatch = document.createElement("div");
    swatch.className = "theme-swatch" + (current === theme.id ? " active" : "");
    swatch.innerHTML = `
      <div class="swatch-dot" style="background: linear-gradient(135deg, ${theme.a}, ${theme.b});"></div>
      <div class="swatch-label">${theme.name}</div>
    `;
    swatch.addEventListener("click", () => applyTheme(theme.id));
    themeGrid.appendChild(swatch);
  });
}

settingsBtn.addEventListener("click", () => {
  renderThemeGrid();
  settingsOverlay.classList.add("open");
});

settingsCloseBtn.addEventListener("click", () => settingsOverlay.classList.remove("open"));

settingsOverlay.addEventListener("click", (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.remove("open");
});

function getEnhanceSetting() {
  return localStorage.getItem("homeflix-enhance") === "on";
}

function setEnhanceSetting(on) {
  localStorage.setItem("homeflix-enhance", on ? "on" : "off");
  enhanceToggle.classList.toggle("on", on);
  enhanceToggle.setAttribute("aria-checked", on ? "true" : "false");
}

enhanceToggle.addEventListener("click", () => {
  setEnhanceSetting(!getEnhanceSetting());
});

setEnhanceSetting(getEnhanceSetting());

async function loadLibrary() {
  try {
    const res = await fetch("/api/videos");
    if (!res.ok) throw new Error("Server error " + res.status);
    allVideos = await res.json();
    renderCategories();
    renderGrid();
  } catch (err) {
    status.style.display = "block";
    status.textContent = "Couldn't load the library: " + err.message;
  }
}

function renderCategories() {
  const all = new Set();
  allVideos.forEach((v) => v.tags.forEach((t) => all.add(t)));
  const cats = [...all].sort((a, b) => a.localeCompare(b));

  categoriesEl.innerHTML = "";

  const allChip = document.createElement("div");
  allChip.className = "chip" + (activeCategory === null ? " active" : "");
  allChip.textContent = "All";
  allChip.addEventListener("click", () => {
    activeCategory = null;
    renderCategories();
    renderGrid();
  });
  categoriesEl.appendChild(allChip);

  cats.forEach((cat) => {
    const wrap = document.createElement("div");
    wrap.className = "chip-wrap";

    const chip = document.createElement("div");
    chip.className = "chip" + (activeCategory === cat ? " active" : "");
    chip.textContent = cat;
    chip.addEventListener("click", () => {
      activeCategory = activeCategory === cat ? null : cat;
      renderCategories();
      renderGrid();
    });
    wrap.appendChild(chip);

    const addBtn = document.createElement("button");
    addBtn.className = "chip-add";
    addBtn.title = `Add videos to "${cat}"`;
    addBtn.textContent = "+";
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      startAssignMode(cat);
    });
    wrap.appendChild(addBtn);

    categoriesEl.appendChild(wrap);
  });
}

function startAssignMode(category) {
  assignMode = category;
  activeCategory = null;
  searchInput.value = "";
  searchTerm = "";
  assignCategoryName.textContent = category;
  assignBanner.classList.add("active");
  renderCategories();
  renderGrid();
}

function stopAssignMode() {
  assignMode = null;
  assignBanner.classList.remove("active");
  renderGrid();
}

async function toggleAssignMembership(video) {
  const has = video.tags.includes(assignMode);
  const newTags = has ? video.tags.filter((t) => t !== assignMode) : [...video.tags, assignMode];

  try {
    const res = await fetch(`/api/videos/${encodeURIComponent(video.filename)}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: newTags }),
    });
    if (!res.ok) throw new Error("Server error " + res.status);
    video.tags = newTags;
    renderGrid();
  } catch (err) {
    alert("Couldn't update category: " + err.message);
  }
}

assignDoneBtn.addEventListener("click", stopAssignMode);

async function deleteVideo(video) {
  const confirmed = confirm(`Delete "${video.title}" from the server? This can't be undone.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/videos/${encodeURIComponent(video.filename)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Server error " + res.status);
    loadLibrary();
  } catch (err) {
    alert("Couldn't delete video: " + err.message);
  }
}

function getVisibleVideos() {
  return allVideos.filter((v) => {
    const matchesCategory = !activeCategory || v.tags.includes(activeCategory);
    const matchesSearch = !searchTerm || v.title.toLowerCase().includes(searchTerm);
    return matchesCategory && matchesSearch;
  });
}

function renderGrid() {
  const visible = getVisibleVideos();

  if (allVideos.length === 0) {
    status.style.display = "block";
    status.textContent = "No videos found. Check that VIDEO_DIR points at a folder with .mp4/.mkv/.webm/.mov files.";
    grid.innerHTML = "";
    return;
  }

  if (visible.length === 0) {
    status.style.display = "block";
    status.textContent = "Nothing matches that search / category.";
    grid.innerHTML = "";
    return;
  }

  status.style.display = "none";
  grid.innerHTML = "";

  visible.forEach((v) => {
    const card = document.createElement("div");
    card.className = "card" + (assignMode && v.tags.includes(assignMode) ? " assign-member" : "");
    card.tabIndex = 0;
    card.dataset.filename = v.filename;

    const badgeTag = v.tags[0];
    const extraTagsHtml = v.tags.slice(1).map((t) => `<span class="tag-pill">${escapeHtml(t)}</span>`).join("");

    card.innerHTML = `
      <button class="delete-btn" title="Delete video">✕</button>
      <div class="assign-check">✓</div>
      <div class="card-thumb">
        <span class="play-icon">${v.kind === "audio" ? "♪" : "▶"}</span>
        <div class="card-thumb-overlay">
          ${badgeTag ? `<span class="card-badge">${escapeHtml(badgeTag)}</span>` : ""}
          <div class="card-thumb-title">${escapeHtml(v.title)}</div>
        </div>
      </div>
      <div class="card-body">
        <div class="card-meta">
          <span>${formatSize(v.sizeBytes)}</span>
          <button class="edit-tags-btn" title="Edit categories">🏷 edit</button>
        </div>
        ${extraTagsHtml ? `<div class="card-tags">${extraTagsHtml}</div>` : ""}
      </div>
    `;

    card.addEventListener("click", (e) => {
      if (e.target.closest(".edit-tags-btn") || e.target.closest(".delete-btn")) return;
      if (assignMode) {
        toggleAssignMembership(v);
      } else {
        openPlayer(v);
      }
    });
    card.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      if (assignMode) toggleAssignMembership(v);
      else openPlayer(v);
    });

    card.querySelector(".edit-tags-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openTagEditor(v);
    });

    card.querySelector(".delete-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      deleteVideo(v);
    });

    grid.appendChild(card);
  });

  resetGamepadFocus();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

searchInput.addEventListener("input", () => {
  searchTerm = searchInput.value.trim().toLowerCase();
  renderGrid();
});

function openTagEditor(video) {
  editingFilename = video.filename;
  const dot = video.filename.lastIndexOf(".");
  editingExt = dot >= 0 ? video.filename.slice(dot) : "";
  const base = dot >= 0 ? video.filename.slice(0, dot) : video.filename;

  tagModalTitle.textContent = video.title;
  nameInput.value = base;
  nameExt.textContent = editingExt;
  tagInput.value = video.tags.join(", ");
  tagModalOverlay.classList.add("open");
  nameInput.focus();
  nameInput.select();
}

function closeTagEditor() {
  tagModalOverlay.classList.remove("open");
  editingFilename = null;
  editingExt = "";
}

async function saveTagEditor() {
  if (!editingFilename) return;

  const newBase = nameInput.value.trim();
  if (!newBase) {
    alert("File name can't be empty.");
    return;
  }

  let currentFilename = editingFilename;

  if (newBase !== editingFilename.slice(0, editingFilename.length - editingExt.length)) {
    try {
      const res = await fetch(`/api/videos/${encodeURIComponent(editingFilename)}/rename`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newName: newBase }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Server error " + res.status);
      currentFilename = data.newFilename;
    } catch (err) {
      alert("Couldn't rename file: " + err.message);
      return;
    }
  }

  const tags = tagInput.value
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  try {
    const res = await fetch(`/api/videos/${encodeURIComponent(currentFilename)}/tags`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    if (!res.ok) throw new Error("Server error " + res.status);
    closeTagEditor();
    loadLibrary();
  } catch (err) {
    alert("Couldn't save categories: " + err.message);
  }
}

tagCancelBtn.addEventListener("click", closeTagEditor);
tagSaveBtn.addEventListener("click", saveTagEditor);
tagInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveTagEditor();
  if (e.key === "Escape") closeTagEditor();
});

nameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") saveTagEditor();
  if (e.key === "Escape") closeTagEditor();
});

uploadBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  uploadFiles(fileInput.files);
  fileInput.value = "";
});

let dragCounter = 0;

window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragCounter++;
  dropzone.classList.add("active");
});

window.addEventListener("dragover", (e) => e.preventDefault());

window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    dropzone.classList.remove("active");
  }
});

window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  dropzone.classList.remove("active");
  if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
});

function uploadFiles(fileList) {
  Array.from(fileList).forEach(uploadOne);
}

function uploadOne(file) {
  const row = document.createElement("div");
  row.className = "upload-row";
  row.innerHTML = `
    <div class="name"><span>${escapeHtml(file.name)}</span><span class="pct">0%</span></div>
    <div class="bar-track"><div class="bar-fill"></div></div>
  `;
  uploadsList.appendChild(row);

  const pctEl = row.querySelector(".pct");
  const barEl = row.querySelector(".bar-fill");

  const formData = new FormData();
  formData.append("video", file);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/upload");

  xhr.upload.addEventListener("progress", (e) => {
    if (!e.lengthComputable) return;
    const pct = Math.round((e.loaded / e.total) * 100);
    barEl.style.width = pct + "%";
    pctEl.textContent = pct + "%";
  });

  xhr.addEventListener("load", () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      pctEl.textContent = "done";
      setTimeout(() => {
        row.remove();
        loadLibrary();
      }, 600);
    } else {
      handleUploadError(row, xhr.responseText);
    }
  });

  xhr.addEventListener("error", () => handleUploadError(row, "Network error"));

  xhr.send(formData);
}

function handleUploadError(row, message) {
  row.classList.add("error");
  let text = message;
  try {
    text = JSON.parse(message).error || message;
  } catch (_) {}
  row.querySelector(".pct").textContent = "failed";
  row.querySelector(".name span").title = text;
}

function isMusicMode(video) {
  if (video.kind === "audio") return true;
  return video.tags.some((t) => t.toLowerCase() === "music");
}

videoEl.addEventListener("waiting", () => bufferSpinner.classList.add("active"));
videoEl.addEventListener("loadstart", () => bufferSpinner.classList.add("active"));
videoEl.addEventListener("playing", () => bufferSpinner.classList.remove("active"));
videoEl.addEventListener("canplay", () => bufferSpinner.classList.remove("active"));

audioEl.addEventListener("waiting", () => musicSpinner.classList.add("active"));
audioEl.addEventListener("loadstart", () => musicSpinner.classList.add("active"));
audioEl.addEventListener("playing", () => musicSpinner.classList.remove("active"));
audioEl.addEventListener("canplay", () => musicSpinner.classList.remove("active"));

function openPlayer(video) {
  playerTitle.textContent = video.title;

  if (isMusicMode(video)) {
    videoEl.pause();
    videoEl.removeAttribute("src");
    videoEl.style.display = "none";
    musicPlayer.classList.add("open");
    stopEnhance();

    audioEl.src = "/stream/" + encodeURIComponent(video.filename);
    overlay.classList.add("open");
    audioEl.play();
    startVisualizer();
  } else {
    audioEl.pause();
    audioEl.removeAttribute("src");
    musicPlayer.classList.remove("open");
    videoEl.style.display = "";

    videoEl.src = "/stream/" + encodeURIComponent(video.filename);
    overlay.classList.add("open");
    videoEl.play();
    stopVisualizer();

    if (getEnhanceSetting()) {
      startEnhance();
    } else {
      stopEnhance();
    }
  }
}

function closePlayer() {
  videoEl.pause();
  videoEl.removeAttribute("src");
  videoEl.load();

  audioEl.pause();
  audioEl.removeAttribute("src");

  overlay.classList.remove("open");
  musicPlayer.classList.remove("open");
  videoEl.style.display = "";
  stopVisualizer();
  stopEnhance();
  bufferSpinner.classList.remove("active");
  musicSpinner.classList.remove("active");
}

closeBtn.addEventListener("click", closePlayer);
document.addEventListener("keydown", (e) => {
  if (!overlay.classList.contains("open")) return;
  const typing = document.activeElement && ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName);
  if (typing) return;

  if (e.key === "Escape") closePlayer();

  if (e.key === " ") {
    e.preventDefault();
    const activeMedia = musicPlayer.classList.contains("open") ? audioEl : videoEl;
    if (activeMedia.paused) activeMedia.play(); else activeMedia.pause();
  }
});

let audioCtx = null;
let analyser = null;
let sourceNode = null;
let visualizerFrame = null;

function ensureAudioGraph() {
  if (sourceNode) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioCtx.createMediaElementSource(audioEl);
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 128;
  sourceNode.connect(analyser);
  analyser.connect(audioCtx.destination);
}

function startVisualizer() {
  ensureAudioGraph();
  if (audioCtx.state === "suspended") audioCtx.resume();

  const dpr = window.devicePixelRatio || 1;
  const cssWidth = visualizerCanvas.clientWidth || 720;
  const cssHeight = visualizerCanvas.clientHeight || 200;
  visualizerCanvas.width = cssWidth * dpr;
  visualizerCanvas.height = cssHeight * dpr;
  const ctx = visualizerCanvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const rootStyles = getComputedStyle(document.documentElement);
  const colorBottom = rootStyles.getPropertyValue("--blue").trim() || "#3b82f6";
  const colorMid = rootStyles.getPropertyValue("--teal").trim() || "#2dd4c8";
  const colorTop = rootStyles.getPropertyValue("--glow-a").trim() || "#8b5cf6";

  function draw() {
    visualizerFrame = requestAnimationFrame(draw);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const barCount = bufferLength;
    const gap = 3;
    const barWidth = (cssWidth - gap * (barCount - 1)) / barCount;

    for (let i = 0; i < barCount; i++) {
      const value = dataArray[i] / 255;
      const barHeight = Math.max(3, value * cssHeight);
      const x = i * (barWidth + gap);
      const y = cssHeight - barHeight;

      const gradient = ctx.createLinearGradient(0, cssHeight, 0, 0);
      gradient.addColorStop(0, colorBottom);
      gradient.addColorStop(0.55, colorMid);
      gradient.addColorStop(1, colorTop);

      ctx.fillStyle = gradient;
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(x, y, barWidth, barHeight, 3);
      } else {
        ctx.rect(x, y, barWidth, barHeight);
      }
      ctx.fill();
    }
  }

  draw();
}

function stopVisualizer() {
  if (visualizerFrame) {
    cancelAnimationFrame(visualizerFrame);
    visualizerFrame = null;
  }
}

let glCtx = null;
let glProgram = null;
let glTexture = null;
let glTexelLoc = null;
let enhanceFrame = null;
let enhanceRunning = false;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function initWebGL() {
  if (glCtx) return;

  const gl = enhanceCanvas.getContext("webgl") || enhanceCanvas.getContext("experimental-webgl");
  if (!gl) return;
  glCtx = gl;

  const vsSource = `
    attribute vec2 aPosition;
    attribute vec2 aTexCoord;
    varying vec2 vTexCoord;
    void main() {
      vTexCoord = aTexCoord;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fsSource = `
    precision mediump float;
    varying vec2 vTexCoord;
    uniform sampler2D uSampler;
    uniform vec2 uTexel;
    void main() {
      vec4 center = texture2D(uSampler, vTexCoord);
      vec4 up = texture2D(uSampler, vTexCoord + vec2(0.0, -uTexel.y));
      vec4 down = texture2D(uSampler, vTexCoord + vec2(0.0, uTexel.y));
      vec4 left = texture2D(uSampler, vTexCoord + vec2(-uTexel.x, 0.0));
      vec4 right = texture2D(uSampler, vTexCoord + vec2(uTexel.x, 0.0));
      vec4 sharpened = center * 5.0 - up - down - left - right;
      vec3 color = mix(center.rgb, sharpened.rgb, 0.35);
      color = (color - 0.5) * 1.06 + 0.5;
      float gray = dot(color, vec3(0.299, 0.587, 0.114));
      color = mix(vec3(gray), color, 1.12);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), center.a);
    }
  `;

  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return;

  glProgram = gl.createProgram();
  gl.attachShader(glProgram, vs);
  gl.attachShader(glProgram, fs);
  gl.linkProgram(glProgram);
  if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(glProgram));
    glProgram = null;
    return;
  }
  gl.useProgram(glProgram);

  const positions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
  const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 1, 0]);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  const aPosition = gl.getAttribLocation(glProgram, "aPosition");
  gl.enableVertexAttribArray(aPosition);
  gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
  const aTexCoord = gl.getAttribLocation(glProgram, "aTexCoord");
  gl.enableVertexAttribArray(aTexCoord);
  gl.vertexAttribPointer(aTexCoord, 2, gl.FLOAT, false, 0, 0);

  glTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  glTexelLoc = gl.getUniformLocation(glProgram, "uTexel");
}

function resizeEnhanceCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = videoWrap.clientWidth;
  const height = videoWrap.clientHeight;
  enhanceCanvas.width = Math.max(1, Math.round(width * dpr));
  enhanceCanvas.height = Math.max(1, Math.round(height * dpr));
  if (glCtx) glCtx.viewport(0, 0, enhanceCanvas.width, enhanceCanvas.height);
}

function enhanceLoop() {
  if (!enhanceRunning) return;
  enhanceFrame = requestAnimationFrame(enhanceLoop);
  if (!glCtx || !glProgram || videoEl.readyState < 2) return;

  const gl = glCtx;
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, videoEl);
  } catch (e) {
    return;
  }
  gl.uniform2f(glTexelLoc, 1 / enhanceCanvas.width, 1 / enhanceCanvas.height);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function startEnhance() {
  initWebGL();
  if (!glCtx || !glProgram) return;
  enhanceCanvas.classList.add("active");
  enhanceBadge.classList.add("active");
  resizeEnhanceCanvas();
  enhanceRunning = true;
  enhanceLoop();
}

function stopEnhance() {
  enhanceRunning = false;
  if (enhanceFrame) cancelAnimationFrame(enhanceFrame);
  enhanceCanvas.classList.remove("active");
  enhanceBadge.classList.remove("active");
}

enhanceCanvas.addEventListener("click", () => {
  if (videoEl.paused) videoEl.play(); else videoEl.pause();
});

window.addEventListener("resize", () => {
  if (enhanceRunning) resizeEnhanceCanvas();
});

let gamepadFocusIndex = 0;
let gamepadConnected = false;
const buttonState = {};

function resetGamepadFocus() {
  gamepadFocusIndex = 0;
  updateGamepadFocusVisual();
}

function getCardEls() {
  return Array.from(grid.querySelectorAll(".card"));
}

function updateGamepadFocusVisual() {
  const cards = getCardEls();
  cards.forEach((c) => c.classList.remove("gamepad-focus"));
  if (!gamepadConnected || cards.length === 0) return;
  gamepadFocusIndex = Math.max(0, Math.min(gamepadFocusIndex, cards.length - 1));
  const el = cards[gamepadFocusIndex];
  el.classList.add("gamepad-focus");
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function getColumnCount() {
  const style = getComputedStyle(grid);
  return style.gridTemplateColumns.split(" ").filter(Boolean).length || 1;
}

function moveGamepadFocus(dx, dy) {
  const cards = getCardEls();
  if (cards.length === 0) return;
  const cols = getColumnCount();
  let next = gamepadFocusIndex + dx + dy * cols;
  next = Math.max(0, Math.min(next, cards.length - 1));
  gamepadFocusIndex = next;
  updateGamepadFocusVisual();
}

function cycleCategory(direction) {
  const chips = Array.from(categoriesEl.children);
  if (chips.length === 0) return;
  const currentIndex = chips.findIndex((c) => c.classList.contains("active"));
  let next = currentIndex + direction;
  if (next < 0) next = chips.length - 1;
  if (next >= chips.length) next = 0;
  chips[next].click();
}

function buttonPressed(index, pressed, now) {
  const state = buttonState[index] || { held: false, nextRepeat: 0 };
  let fire = false;

  if (pressed && !state.held) {
    fire = true;
    state.nextRepeat = now + 380;
  } else if (pressed && state.held && now >= state.nextRepeat) {
    fire = true;
    state.nextRepeat = now + 140;
  }

  state.held = pressed;
  buttonState[index] = state;
  return fire;
}

function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const pad = pads && pads[0];

  if (pad) {
    if (!gamepadConnected) {
      gamepadConnected = true;
      gamepadIndicator.classList.add("connected");
      resetGamepadFocus();
    }

    const now = performance.now();
    const isModalOpen = tagModalOverlay.classList.contains("open");
    const isPlayerOpen = overlay.classList.contains("open");

    const up = pad.buttons[12] && pad.buttons[12].pressed;
    const down = pad.buttons[13] && pad.buttons[13].pressed;
    const left = pad.buttons[14] && pad.buttons[14].pressed;
    const right = pad.buttons[15] && pad.buttons[15].pressed;
    const stickX = pad.axes[0] || 0;
    const stickY = pad.axes[1] || 0;
    const deadzone = 0.5;

    const dirUp = up || stickY < -deadzone;
    const dirDown = down || stickY > deadzone;
    const dirLeft = left || stickX < -deadzone;
    const dirRight = right || stickX > deadzone;

    const aBtn = pad.buttons[0] && pad.buttons[0].pressed;
    const bBtn = pad.buttons[1] && pad.buttons[1].pressed;
    const lb = pad.buttons[4] && pad.buttons[4].pressed;
    const rb = pad.buttons[5] && pad.buttons[5].pressed;

    if (isModalOpen) {
      if (buttonPressed("modal-b", bBtn, now)) closeTagEditor();
      if (buttonPressed("modal-a", aBtn, now)) saveTagEditor();
    } else if (isPlayerOpen) {
      const activeMedia = musicPlayer.classList.contains("open") ? audioEl : videoEl;
      if (buttonPressed("player-b", bBtn, now)) closePlayer();
      if (buttonPressed("player-a", aBtn, now)) {
        if (activeMedia.paused) activeMedia.play(); else activeMedia.pause();
      }
      if (buttonPressed("player-left", dirLeft, now)) activeMedia.currentTime = Math.max(0, activeMedia.currentTime - 10);
      if (buttonPressed("player-right", dirRight, now)) activeMedia.currentTime += 10;
      if (buttonPressed("player-up", dirUp, now)) activeMedia.volume = Math.min(1, activeMedia.volume + 0.1);
      if (buttonPressed("player-down", dirDown, now)) activeMedia.volume = Math.max(0, activeMedia.volume - 0.1);
    } else {
      const bBtnGrid = pad.buttons[1] && pad.buttons[1].pressed;
      if (assignMode && buttonPressed("grid-b", bBtnGrid, now)) stopAssignMode();

      if (buttonPressed("grid-up", dirUp, now)) moveGamepadFocus(0, -1);
      if (buttonPressed("grid-down", dirDown, now)) moveGamepadFocus(0, 1);
      if (buttonPressed("grid-left", dirLeft, now)) moveGamepadFocus(-1, 0);
      if (buttonPressed("grid-right", dirRight, now)) moveGamepadFocus(1, 0);
      if (buttonPressed("grid-a", aBtn, now)) {
        const cards = getCardEls();
        const card = cards[gamepadFocusIndex];
        if (card) {
          const video = allVideos.find((v) => v.filename === card.dataset.filename);
          if (video) {
            if (assignMode) toggleAssignMembership(video);
            else openPlayer(video);
          }
        }
      }
      if (buttonPressed("grid-lb", lb, now)) cycleCategory(-1);
      if (buttonPressed("grid-rb", rb, now)) cycleCategory(1);
    }
  } else if (gamepadConnected) {
    gamepadConnected = false;
    gamepadIndicator.classList.remove("connected");
    getCardEls().forEach((c) => c.classList.remove("gamepad-focus"));
  }

  requestAnimationFrame(pollGamepad);
}

window.addEventListener("gamepadconnected", () => {
  gamepadConnected = true;
  gamepadIndicator.classList.add("connected");
  resetGamepadFocus();
});

window.addEventListener("gamepaddisconnected", () => {
  gamepadConnected = false;
  gamepadIndicator.classList.remove("connected");
});

document.documentElement.setAttribute("data-theme", getCurrentTheme());

requestAnimationFrame(pollGamepad);

loadLibrary();
