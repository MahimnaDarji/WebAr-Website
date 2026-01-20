const els = {
  videoInput: document.getElementById("videoInput"),
  videoPreview: document.getElementById("videoPreview"),
  emptyPreview: document.getElementById("emptyPreview"),

  metaFile: document.getElementById("metaFile"),
  metaSize: document.getElementById("metaSize"),
  metaType: document.getElementById("metaType"),
  metaDuration: document.getElementById("metaDuration"),

  optimizeBtn: document.getElementById("optimizeBtn"),
  clearBtn: document.getElementById("clearBtn"),
  backToStep2Btn: document.getElementById("backToStep2Btn"),
  continueBtn: document.getElementById("continueBtn"),

  status: document.getElementById("status"),
  suggestions: document.getElementById("suggestions"),
};

const STORAGE_KEYS = {
  videoMeta: "webar_builder_video_meta",
};

const IDB = {
  dbName: "webar_builder_db",
  storeName: "files",
  key: "video_file",
};

let state = {
  file: null,
  objectUrl: null,
  meta: null,
};

function setStatus(msg) {
  els.status.textContent = msg;
}

function setSuggestions(items) {
  els.suggestions.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No issues detected.";
    els.suggestions.appendChild(li);
    return;
  }
  items.forEach(t => {
    const li = document.createElement("li");
    li.textContent = t;
    els.suggestions.appendChild(li);
  });
}

function bytesToMB(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeParseJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

/* ---------- IndexedDB helpers ---------- */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB.dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB.storeName)) {
        db.createObjectStore(IDB.storeName);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB.storeName, "readwrite");
    tx.objectStore(IDB.storeName).put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB.storeName, "readonly");
    const req = tx.objectStore(IDB.storeName).get(key);
    req.onsuccess = () => { const v = req.result || null; db.close(); resolve(v); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function idbDelete(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB.storeName, "readwrite");
    tx.objectStore(IDB.storeName).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

/* ---------- UI ---------- */

function resetUI(keepStored = false) {
  state.file = null;
  state.meta = null;

  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = null;

  els.videoInput.value = "";

  els.videoPreview.pause();
  els.videoPreview.removeAttribute("src");
  els.videoPreview.load();
  els.videoPreview.style.display = "none";
  els.emptyPreview.style.display = "block";

  els.metaFile.textContent = "None";
  els.metaSize.textContent = "-";
  els.metaType.textContent = "-";
  els.metaDuration.textContent = "-";

  els.optimizeBtn.disabled = true;
  els.clearBtn.disabled = true;
  els.continueBtn.disabled = true;

  setSuggestions(["No checks yet."]);
  setStatus("No video selected.");

  if (!keepStored) {
    localStorage.removeItem(STORAGE_KEYS.videoMeta);
    idbDelete(IDB.key).catch(() => {});
  }
}

function showVideoPreviewFromFile(file) {
  if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
  state.objectUrl = URL.createObjectURL(file);

  els.videoPreview.src = state.objectUrl;
  els.videoPreview.muted = true;
  els.videoPreview.playsInline = true;
  els.videoPreview.controls = true;

  els.videoPreview.style.display = "block";
  els.emptyPreview.style.display = "none";
}

function validateFile(file) {
  const allowedTypes = ["video/mp4", "video/webm", "video/quicktime"];
  if (!allowedTypes.includes(file.type)) {
    return { ok: false, msg: "Unsupported format. Upload MP4 or WebM." };
  }
  return { ok: true, msg: "" };
}

function buildWarnings(meta) {
  const warnings = [];
  if (meta.duration > 15) warnings.push("Video is longer than 15 seconds. Shorter videos load faster.");
  if (meta.size > 20 * 1024 * 1024) warnings.push("Video is larger than 20 MB. Consider compressing for faster loading.");
  if (!meta.type.includes("mp4")) warnings.push("MP4 is recommended for best compatibility.");
  return warnings;
}

async function handleSelected(file) {
  const v = validateFile(file);
  if (!v.ok) {
    setStatus(v.msg);
    return;
  }

  state.file = file;

  showVideoPreviewFromFile(file);

  els.clearBtn.disabled = false;
  els.optimizeBtn.disabled = true;
  els.continueBtn.disabled = true;

  setStatus("Loading video metadata…");

  els.videoPreview.onloadedmetadata = () => {
    const duration = els.videoPreview.duration;

    state.meta = {
      name: file.name,
      type: file.type,
      size: file.size,
      duration
    };

    els.metaFile.textContent = file.name;
    els.metaSize.textContent = bytesToMB(file.size);
    els.metaType.textContent = file.type;
    els.metaDuration.textContent = `${duration.toFixed(1)} sec`;

    setSuggestions(buildWarnings(state.meta));

    els.optimizeBtn.disabled = false;
    setStatus("Video ready. Click Save video to lock it for Step 4 and Experience.");
  };
}

async function saveVideo() {
  if (!state.file || !state.meta) return;

  els.optimizeBtn.disabled = true;
  setStatus("Saving video…");

  try {
    await idbSet(IDB.key, state.file);
    localStorage.setItem(STORAGE_KEYS.videoMeta, JSON.stringify(state.meta));

    els.continueBtn.disabled = false;
    setStatus("Saved. You can continue to Step 4.");
  } catch {
    setStatus("Failed to save video. Try again.");
  } finally {
    els.optimizeBtn.disabled = false;
  }
}

/* ---------- restore on load ---------- */

async function restoreIfPresent() {
  const meta = safeParseJson(localStorage.getItem(STORAGE_KEYS.videoMeta));
  if (!meta) return;

  try {
    const file = await idbGet(IDB.key);
    if (!file) return;

    // Restore UI from stored file
    resetUI(true);

    state.file = file;
    state.meta = meta;

    showVideoPreviewFromFile(file);

    els.metaFile.textContent = meta.name || "Video";
    els.metaSize.textContent = meta.size ? bytesToMB(meta.size) : "-";
    els.metaType.textContent = meta.type || "-";
    els.metaDuration.textContent = meta.duration ? `${Number(meta.duration).toFixed(1)} sec` : "-";

    setSuggestions(buildWarnings(meta));

    els.clearBtn.disabled = false;
    els.optimizeBtn.disabled = false;
    els.continueBtn.disabled = false;

    setStatus("Loaded saved video. You can continue or replace it.");
  } catch {
    // ignore restore errors
  }
}

/* ---------- events ---------- */

els.videoInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) {
    resetUI();
    return;
  }
  handleSelected(file);
});

els.optimizeBtn.addEventListener("click", () => {
  saveVideo();
});

els.clearBtn.addEventListener("click", () => {
  resetUI(false);
});

els.backToStep2Btn.addEventListener("click", () => {
  window.location.href = "./step2page.html";
});

els.continueBtn.addEventListener("click", () => {
  window.location.href = "./step4page.html";
});

/* ---------- init ---------- */
resetUI(true);
restoreIfPresent();