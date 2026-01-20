const els = {
  artworkState: document.getElementById("artworkState"),
  videoState: document.getElementById("videoState"),
  targetState: document.getElementById("targetState"),
  urlState: document.getElementById("urlState"),
  qrState: document.getElementById("qrState"),
  status: document.getElementById("status"),

  backToStep5Btn: document.getElementById("backToStep5Btn"),
  restartBtn: document.getElementById("restartBtn"),

  downloadQrBtn: document.getElementById("downloadQrBtn"),
  downloadTargetBtn: document.getElementById("downloadTargetBtn"),
  copyUrlBtn: document.getElementById("copyUrlBtn"),
};

const STORAGE_KEYS = {
  artwork: "webar_builder_artwork",
  videoMeta: "webar_builder_video_meta",
  targetBase64: "webar_builder_target_file_base64",
  targetMeta: "webar_builder_target_meta",
  experienceUrl: "webar_builder_experience_url",
};

const IDB = {
  dbName: "webar_builder_db",
  storeName: "files",
  key: "video_file",
};

function safeParseJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function setStatus(msg) {
  els.status.textContent = msg;
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

async function idbGet(key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB.storeName, "readonly");
    const req = tx.objectStore(IDB.storeName).get(key);
    req.onsuccess = () => { const v = req.result || null; db.close(); resolve(v); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

/* ---------- base64 helpers ---------- */

function base64ToBlob(base64, mime = "application/octet-stream") {
  const binStr = atob(base64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* ---------- load + render ---------- */

async function loadState() {
  const artwork = localStorage.getItem(STORAGE_KEYS.artwork);
  const videoMeta = safeParseJson(localStorage.getItem(STORAGE_KEYS.videoMeta));
  const targetBase64 = localStorage.getItem(STORAGE_KEYS.targetBase64);
  const targetMeta = safeParseJson(localStorage.getItem(STORAGE_KEYS.targetMeta));
  const url = localStorage.getItem(STORAGE_KEYS.experienceUrl);

  let videoFile = null;
  try {
    videoFile = await idbGet(IDB.key);
  } catch {}

  return { artwork, videoMeta, videoFile, targetBase64, targetMeta, url };
}

function renderSummary({ artwork, videoMeta, videoFile, targetBase64, targetMeta, url }) {
  els.artworkState.textContent = artwork ? "Ready" : "Missing";
  els.videoState.textContent = (videoMeta && videoFile) ? "Ready" : "Missing";

  const hasTarget = !!targetBase64;
  els.targetState.textContent = hasTarget
    ? (targetMeta?.filename ? `Ready (${targetMeta.filename})` : "Ready")
    : "Missing";

  els.urlState.textContent = url ? url : "Missing";
  els.qrState.textContent = url ? "Ready" : "Missing";

  // Enable actions
  els.copyUrlBtn.disabled = !url;
  els.downloadTargetBtn.disabled = !hasTarget;

  // QR download depends on Step 5 rendering. If user jumps here directly, we still enable it
  // but show a clear message if QR DOM isn't present.
  els.downloadQrBtn.disabled = !url;
}

function findQrDataUrlFromStep5() {
  // Step 5 QRCode.js renders inside #qrcode
  const container = document.getElementById("qrcode");
  if (!container) return null;

  const img = container.querySelector("img");
  if (img && img.src) return img.src;

  const canvas = container.querySelector("canvas");
  if (canvas) return canvas.toDataURL("image/png");

  return null;
}

/* ---------- actions ---------- */

els.backToStep5Btn.addEventListener("click", () => {
  window.location.href = "./step5page.html";
});

els.restartBtn.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "./builder.html";
});

els.copyUrlBtn.addEventListener("click", async () => {
  const url = localStorage.getItem(STORAGE_KEYS.experienceUrl);
  if (!url) return;

  try {
    await navigator.clipboard.writeText(url);
    setStatus("Experience URL copied.");
  } catch {
    setStatus("Copy failed. Copy the URL manually.");
  }
});

els.downloadQrBtn.addEventListener("click", () => {
  const url = localStorage.getItem(STORAGE_KEYS.experienceUrl);
  if (!url) {
    setStatus("Experience URL missing. Go back to Step 5.");
    return;
  }

  const dataUrl = findQrDataUrlFromStep5();
  if (!dataUrl) {
    setStatus("QR not found here. Go back to Step 5 and download it from there.");
    return;
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "webar-qr.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
});

els.downloadTargetBtn.addEventListener("click", () => {
  const base64 = localStorage.getItem(STORAGE_KEYS.targetBase64);
  const meta = safeParseJson(localStorage.getItem(STORAGE_KEYS.targetMeta));

  if (!base64) {
    setStatus("Target missing. Generate it in Step 2 first.");
    return;
  }

  const filename = meta?.filename || "target.mind";
  const blob = base64ToBlob(base64, "application/octet-stream");
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
});

/* ---------- init ---------- */

(async function init() {
  setStatus("Loading export summary…");
  const s = await loadState();
  renderSummary(s);

  if (!s.artwork || !s.videoMeta || !s.videoFile || !s.url) {
    setStatus("Some items are missing. Go back and complete the previous steps.");
  } else {
    setStatus("Ready. Download QR and copy the link.");
  }
})();