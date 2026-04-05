/* ===========================
   PIXELPRESS — SCRIPT.JS
   =========================== */

// ─── STATE ──────────────────────────────────────────────────────────────────

const state = {
  queue: [],          // { id, file, name, sizeKB, previewURL, status }
  results: [],        // { id, name, blob, url, origKB, finalKB, width, height, format }
  settings: {
    compress: true,   // reduce to <200KB
    resize:   true,   // resize to 250x250
    format:   'jpeg', // output format
    resizeMode: 'cover' // cover | contain
  }
};

let idCounter = 0;

// ─── DOM REFS ────────────────────────────────────────────────────────────────

const dropZone       = document.getElementById('dropZone');
const fileInput      = document.getElementById('fileInput');
const queueSection   = document.getElementById('queueSection');
const queueList      = document.getElementById('queueList');
const queueCount     = document.getElementById('queueCount');
const resultsSection = document.getElementById('resultsSection');
const resultsGrid    = document.getElementById('resultsGrid');
const resultCount    = document.getElementById('resultCount');
const convertAllBtn  = document.getElementById('convertAllBtn');
const clearAllBtn    = document.getElementById('clearAllBtn');
const downloadAllBtn = document.getElementById('downloadAllBtn');
const canvas         = document.getElementById('processingCanvas');
const ctx            = canvas.getContext('2d');

// ─── DRAG & DROP ─────────────────────────────────────────────────────────────

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));

dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  handleFiles([...e.dataTransfer.files]);
});

fileInput.addEventListener('change', () => {
  handleFiles([...fileInput.files]);
  fileInput.value = '';
});

// ─── SETTINGS TOGGLES ────────────────────────────────────────────────────────

document.getElementById('cardCompress').addEventListener('click', () => {
  state.settings.compress = !state.settings.compress;
  document.getElementById('cardCompress').classList.toggle('active', state.settings.compress);
});

document.getElementById('cardResize').addEventListener('click', () => {
  state.settings.resize = !state.settings.resize;
  document.getElementById('cardResize').classList.toggle('active', state.settings.resize);
});

// Format buttons
document.querySelectorAll('[data-fmt]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-fmt]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.settings.format = btn.dataset.fmt;
  });
});

// Resize mode buttons
document.querySelectorAll('[data-resize]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-resize]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.settings.resizeMode = btn.dataset.resize;
  });
});

// ─── FILE HANDLING ────────────────────────────────────────────────────────────

function handleFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (!imageFiles.length) return;

  imageFiles.forEach(file => {
    const id = ++idCounter;
    const sizeKB = (file.size / 1024).toFixed(1);
    const previewURL = URL.createObjectURL(file);
    const item = { id, file, name: file.name, sizeKB, previewURL, status: 'waiting' };
    state.queue.push(item);
    renderQueueItem(item);
  });

  queueSection.style.display = 'block';
  updateQueueCount();
}

// ─── RENDER QUEUE ITEM ────────────────────────────────────────────────────────

function renderQueueItem(item) {
  const el = document.createElement('div');
  el.className = 'queue-item';
  el.id = `qi-${item.id}`;
  el.innerHTML = `
    <img class="q-thumb" src="${item.previewURL}" alt="${item.name}" />
    <div class="q-info">
      <div class="q-name">${item.name}</div>
      <div class="q-meta">${item.sizeKB} KB &nbsp;·&nbsp; ${item.file.type}</div>
      <div class="q-progress" id="qp-${item.id}">
        <div class="q-progress-bar" id="qpb-${item.id}"></div>
      </div>
    </div>
    <span class="q-status waiting" id="qs-${item.id}">Waiting</span>
    <button class="q-remove" title="Remove" onclick="removeQueueItem(${item.id})">✕</button>
  `;
  queueList.appendChild(el);
}

function removeQueueItem(id) {
  state.queue = state.queue.filter(i => i.id !== id);
  const el = document.getElementById(`qi-${id}`);
  if (el) el.remove();
  updateQueueCount();
  if (state.queue.length === 0) queueSection.style.display = 'none';
}

function updateQueueCount() {
  queueCount.textContent = state.queue.length;
}

function setItemStatus(id, status, label) {
  const el = document.getElementById(`qs-${id}`);
  if (!el) return;
  el.className = `q-status ${status}`;
  el.textContent = label;
}

function setItemProgress(id, pct) {
  const bar = document.getElementById(`qpb-${id}`);
  const wrap = document.getElementById(`qp-${id}`);
  if (!bar || !wrap) return;
  wrap.style.display = 'block';
  bar.style.width = pct + '%';
}

// ─── CONVERT ALL ─────────────────────────────────────────────────────────────

convertAllBtn.addEventListener('click', async () => {
  const pending = state.queue.filter(i => i.status === 'waiting' || i.status === 'error');
  if (!pending.length) return;

  convertAllBtn.disabled = true;
  convertAllBtn.textContent = '⏳ Processing…';

  for (const item of pending) {
    item.status = 'working';
    setItemStatus(item.id, 'working', 'Converting…');
    setItemProgress(item.id, 10);

    try {
      const result = await processImage(item);
      item.status = 'done';
      setItemStatus(item.id, 'done', 'Done ✓');
      setItemProgress(item.id, 100);
      state.results.push(result);
      renderResult(result);
    } catch (e) {
      item.status = 'error';
      setItemStatus(item.id, 'error', 'Error ✗');
      console.error(e);
    }

    // Small visual delay so user can see the progress
    await delay(60);
  }

  resultsSection.style.display = 'block';
  resultCount.textContent = state.results.length;
  convertAllBtn.disabled = false;
  convertAllBtn.innerHTML = '<span>⚡</span> Convert All';
  resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ─── IMAGE PROCESSING ────────────────────────────────────────────────────────

async function processImage(item) {
  const { compress, resize, format, resizeMode } = state.settings;
  const img = await loadImage(item.previewURL);

  let targetW = img.naturalWidth;
  let targetH = img.naturalHeight;

  // Step 1: Resize to 250×250 if enabled
  if (resize) {
    targetW = 250;
    targetH = 250;
  }

  setItemProgress(item.id, 30);

  canvas.width  = targetW;
  canvas.height = targetH;
  ctx.clearRect(0, 0, targetW, targetH);

  if (resize && resizeMode === 'cover') {
    drawCover(img, targetW, targetH);
  } else if (resize && resizeMode === 'contain') {
    drawContain(img, targetW, targetH);
  } else {
    ctx.drawImage(img, 0, 0, targetW, targetH);
  }

  setItemProgress(item.id, 60);

  // Step 2: Compress to under 200KB if enabled
  const mimeType = getMime(format);
  let blob;
  let quality = 0.92;

  if (compress) {
    blob = await canvasToBlob(canvas, mimeType, quality);
    // If still over 200KB, iteratively reduce quality
    while (blob.size > 200 * 1024 && quality > 0.05) {
      quality = Math.max(0.05, quality - 0.08);
      blob = await canvasToBlob(canvas, mimeType, quality);
    }
    // If PNG (lossless) is still too big, try converting to JPEG
    if (blob.size > 200 * 1024 && format === 'png') {
      blob = await canvasToBlob(canvas, 'image/jpeg', 0.75);
    }
  } else {
    blob = await canvasToBlob(canvas, mimeType, quality);
  }

  setItemProgress(item.id, 90);

  const url = URL.createObjectURL(blob);
  const ext = format === 'jpeg' ? 'jpg' : format;
  const outName = item.name.replace(/\.[^/.]+$/, '') + `_converted.${ext}`;

  return {
    id: item.id,
    name: outName,
    blob,
    url,
    origKB:  parseFloat(item.sizeKB),
    finalKB: (blob.size / 1024).toFixed(1),
    width:   targetW,
    height:  targetH,
    format:  format.toUpperCase()
  };
}

// Draw image as "cover" (crop to fill)
function drawCover(img, w, h) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = img.naturalWidth  * scale;
  const sh = img.naturalHeight * scale;
  const sx = (w - sw) / 2;
  const sy = (h - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh);
}

// Draw image as "contain" (fit with letterbox)
function drawContain(img, w, h) {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const sw = img.naturalWidth  * scale;
  const sh = img.naturalHeight * scale;
  const sx = (w - sw) / 2;
  const sy = (h - sh) / 2;
  ctx.fillStyle = '#111118';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, sx, sy, sw, sh);
}

function getMime(fmt) {
  return fmt === 'jpeg' ? 'image/jpeg'
       : fmt === 'png'  ? 'image/png'
       : 'image/webp';
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src     = src;
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── RENDER RESULT ────────────────────────────────────────────────────────────

function renderResult(r) {
  const savings = (((r.origKB - r.finalKB) / r.origKB) * 100).toFixed(0);
  const savedLabel = savings > 0 ? `−${savings}%` : 'Optimized';
  const sizeClass  = r.finalKB <= 200 ? 'green' : 'yellow';

  const card = document.createElement('div');
  card.className = 'result-card';
  card.innerHTML = `
    <div class="result-img-wrap">
      <img src="${r.url}" alt="${r.name}" />
      <div class="result-overlay">
        <button class="result-dl-btn" onclick="downloadResult('${r.id}')">⬇ Download</button>
      </div>
    </div>
    <div class="result-info">
      <div class="result-name">${r.name}</div>
      <div class="result-stats">
        <span class="stat-pill ${sizeClass}">${r.finalKB} KB</span>
        <span class="stat-pill">${r.width}×${r.height}</span>
        <span class="stat-pill green">${savedLabel}</span>
        <span class="stat-pill">${r.format}</span>
      </div>
    </div>
  `;
  resultsGrid.appendChild(card);
}

// ─── DOWNLOAD ─────────────────────────────────────────────────────────────────

function downloadResult(id) {
  const r = state.results.find(x => x.id == id);
  if (!r) return;
  triggerDownload(r.url, r.name);
}

downloadAllBtn.addEventListener('click', () => {
  state.results.forEach((r, i) => {
    setTimeout(() => triggerDownload(r.url, r.name), i * 150);
  });
});

function triggerDownload(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ─── CLEAR ALL ───────────────────────────────────────────────────────────────

clearAllBtn.addEventListener('click', () => {
  state.queue = [];
  state.results = [];
  queueList.innerHTML = '';
  resultsGrid.innerHTML = '';
  queueSection.style.display = 'none';
  resultsSection.style.display = 'none';
  idCounter = 0;
});

// ─── EXPOSE helpers to inline onclick ────────────────────────────────────────
window.removeQueueItem = removeQueueItem;
window.downloadResult  = downloadResult;
