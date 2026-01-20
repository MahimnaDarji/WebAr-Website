const els = {
  artworkState: document.getElementById("artworkState"),
  videoState: document.getElementById("videoState"),
  targetState: document.getElementById("targetState"),
  step4Status: document.getElementById("step4Status"),

  backToStep3Btn: document.getElementById("backToStep3Btn"),
  goStep1Btn: document.getElementById("goStep1Btn"),

  simModeBtn: document.getElementById("simModeBtn"),
  arModeBtn: document.getElementById("arModeBtn"),
  startBtn: document.getElementById("startBtn"),
  stopBtn: document.getElementById("stopBtn"),
  continueBtn: document.getElementById("continueBtn"),

  simWrap: document.getElementById("simWrap"),
  arWrap: document.getElementById("arWrap"),

  simArtworkImg: document.getElementById("simArtworkImg"),
  simVideo: document.getElementById("simVideo"),

  arVideo: document.getElementById("arVideo"),
  arHint: document.getElementById("arHint"),
};

const STORAGE_KEYS = {
  artwork: "webar_builder_artwork",
  artworkMeta: "webar_builder_artwork_meta",
  videoMeta: "webar_builder_video_meta",
  targetMeta: "webar_builder_target_meta",

  // NEW: real mind file from Step 2 backend
  targetBase64: "webar_builder_target_file_base64",
};

const IDB = {
  dbName: "webar_builder_db",
  storeName: "files",
  key: "video_file",
};

const state = {
  mode: "sim", // "sim" | "ar"
  hasArtwork: false,
  hasVideo: false,
  hasTarget: false,
  canUseAR: false,
  startedOnce: false,

  artworkDataUrl: null,
  artworkMeta: null,

  videoMeta: null,
  videoFile: null,
  videoObjectUrl: null,

  targetMeta: null,
  targetBase64: null,
  targetBlobUrl: null,

  scene: null,
  mindarSystem: null,
  targetEntity: null,
};

function setStatus(msg) {
  els.step4Status.textContent = msg;
}

function safeParseJson(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

/* ---------------- IndexedDB: load stored video file ---------------- */

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
    const store = tx.objectStore(IDB.storeName);
    const req = store.get(key);

    req.onsuccess = () => {
      const val = req.result || null;
      db.close();
      resolve(val);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/* ---------------- Base64 -> Blob URL ---------------- */

function base64ToBlob(base64, mime = "application/octet-stream") {
  const binStr = atob(base64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function ensureTargetBlobUrl() {
  if (!state.targetBase64) return null;

  if (state.targetBlobUrl) {
    try { URL.revokeObjectURL(state.targetBlobUrl); } catch {}
    state.targetBlobUrl = null;
  }

  const blob = base64ToBlob(state.targetBase64, "application/octet-stream");
  state.targetBlobUrl = URL.createObjectURL(blob);
  return state.targetBlobUrl;
}

/* ---------------- UI mode + enable rules ---------------- */

function setMode(mode) {
  state.mode = mode;

  if (mode === "sim") {
    els.simWrap.style.display = "flex";
    els.arWrap.style.display = "none";

    els.simModeBtn.classList.add("active");
    els.arModeBtn.classList.remove("active");

    els.startBtn.disabled = !(state.hasArtwork && state.hasVideo);
    els.stopBtn.disabled = true;

    setStatus(
      state.hasArtwork && state.hasVideo
        ? "Simulated preview ready. Click Start to test playback."
        : "Missing artwork or video. Go back and upload them."
    );
    return;
  }

  // AR mode
  els.simWrap.style.display = "none";
  els.arWrap.style.display = "block";

  els.simModeBtn.classList.remove("active");
  els.arModeBtn.classList.add("active");

  els.startBtn.disabled = !state.canUseAR;
  els.stopBtn.disabled = true;

  if (!state.canUseAR) {
    setStatus("AR preview disabled. Make sure you generated the target file in Step 2.");
  } else {
    setStatus("AR preview ready. Click Start, allow camera, then point at the artwork.");
  }
}

/* Continue depends on having valid inputs (artwork + video).
   Target is not required for moving forward to QR in builder flow, but AR mode needs it. */
function updateContinue() {
  els.continueBtn.disabled = !(state.hasArtwork && state.hasVideo);
}

function stopAll() {
  try {
    els.simVideo.pause();
  } catch {}

  if (state.mindarSystem) {
    try {
      state.mindarSystem.stop();
    } catch {}
  }

  if (els.arVideo) {
    try {
      els.arVideo.pause();
    } catch {}
  }

  els.stopBtn.disabled = true;
  els.startBtn.disabled =
    state.mode === "sim" ? !(state.hasArtwork && state.hasVideo) : !state.canUseAR;
}

/* ---------------- Load saved inputs ---------------- */

function loadSavedInputsFromLocalStorage() {
  state.artworkDataUrl = localStorage.getItem(STORAGE_KEYS.artwork);
  state.artworkMeta = safeParseJson(localStorage.getItem(STORAGE_KEYS.artworkMeta));

  state.videoMeta = safeParseJson(localStorage.getItem(STORAGE_KEYS.videoMeta));

  state.targetMeta = safeParseJson(localStorage.getItem(STORAGE_KEYS.targetMeta));
  state.targetBase64 = localStorage.getItem(STORAGE_KEYS.targetBase64);
}

async function loadVideoFileFromIndexedDB() {
  const file = await idbGet(IDB.key);
  state.videoFile = file;

  if (state.videoObjectUrl) {
    URL.revokeObjectURL(state.videoObjectUrl);
    state.videoObjectUrl = null;
  }

  if (file) {
    state.videoObjectUrl = URL.createObjectURL(file);
  }
}

function renderReadiness() {
  // Artwork
  if (state.artworkDataUrl) {
    state.hasArtwork = true;
    els.artworkState.textContent = "Loaded";
  } else {
    state.hasArtwork = false;
    els.artworkState.textContent = "Missing";
  }

  // Video
  if (state.videoFile && state.videoMeta) {
    state.hasVideo = true;
    els.videoState.textContent = "Loaded";
  } else {
    state.hasVideo = false;
    els.videoState.textContent = "Missing";
  }

  // Target
  state.hasTarget = !!state.targetBase64;
  els.targetState.textContent = state.hasTarget ? "Loaded" : "Missing";
}

function wireSimPreview() {
  if (state.artworkDataUrl) {
    els.simArtworkImg.src = state.artworkDataUrl;
  }

  if (state.videoObjectUrl) {
    els.simVideo.src = state.videoObjectUrl;
    els.simVideo.style.display = "block";
  } else {
    els.simVideo.removeAttribute("src");
    els.simVideo.load();
  }

  els.simVideo.muted = true;
  els.simVideo.playsInline = true;
  els.simVideo.controls = true;
}

function wireARScene() {
  const scene = document.querySelector("a-scene");
  if (!scene) return;

  state.scene = scene;

  scene.addEventListener("loaded", () => {
    state.mindarSystem = scene.systems && scene.systems["mindar-image-system"];

    state.targetEntity = scene.querySelector("[mindar-image-target]");
    if (state.targetEntity) {
      state.targetEntity.addEventListener("targetFound", () => {
        if (!els.arVideo) return;
        els.arVideo.play().catch(() => {});
        els.arHint.textContent = "Image detected. Video should be playing.";
      });

      state.targetEntity.addEventListener("targetLost", () => {
        if (!els.arVideo) return;
        els.arVideo.pause();
        els.arHint.textContent = "Image lost. Point camera back at the artwork.";
      });
    }
  });
}

function configureARInputsIfAvailable() {
  // AR mode requires: artwork + video + target
  state.canUseAR = state.hasArtwork && state.hasVideo && state.hasTarget;

  if (!state.canUseAR) {
    els.arModeBtn.disabled = true;
    return;
  }

  // Set video src for AR
  if (state.videoObjectUrl) {
    els.arVideo.src = state.videoObjectUrl;
    els.arVideo.muted = true;
    els.arVideo.loop = true;
    els.arVideo.playsInline = true;
  }

  // Set target src dynamically from real .mind base64
  const blobUrl = ensureTargetBlobUrl();
  if (blobUrl && state.scene) {
    state.scene.setAttribute("mindar-image", `imageTargetSrc: ${blobUrl}; autoStart: false;`);
  }

  // Match overlay size to artwork ratio for better “auto adjust” feel
  if (state.artworkMeta?.width && state.artworkMeta?.height) {
    const ratio = state.artworkMeta.height / state.artworkMeta.width;
    const newH = Math.max(0.2, Math.min(2.0, ratio));
    const overlayEl = document.getElementById("overlay");
    if (overlayEl) overlayEl.setAttribute("height", String(newH));
  }

  els.arModeBtn.disabled = false;
}

/* ---------------- Start actions ---------------- */

async function startSim() {
  if (!(state.hasArtwork && state.hasVideo)) return;

  try {
    await els.simVideo.play();
  } catch {}

  state.startedOnce = true;
  els.stopBtn.disabled = false;
  els.startBtn.disabled = true;

  setStatus("Simulated preview running. Play and scrub the video to validate it.");
  updateContinue();
}

async function startAR() {
  if (!state.canUseAR) return;

  // Ask camera permission explicitly (prevents silent failures)
  try {
    await navigator.mediaDevices.getUserMedia({ video: true });
  } catch {
    setStatus("Camera blocked. Allow camera permission and try again.");
    return;
  }

  if (!state.mindarSystem) {
    setStatus("AR system still loading. Wait 1 second and press Start again.");
    return;
  }

  try {
    await state.mindarSystem.start();
  } catch {
    setStatus("Failed to start camera. Check permissions and try again.");
    return;
  }

  state.startedOnce = true;
  els.stopBtn.disabled = false;
  els.startBtn.disabled = true;

  setStatus("AR preview running. Point camera at the artwork.");
  updateContinue();
}

/* ---------------- events ---------------- */

els.simModeBtn.addEventListener("click", () => setMode("sim"));

els.arModeBtn.addEventListener("click", () => {
  setMode("ar");
});

els.startBtn.addEventListener("click", async () => {
  if (state.mode === "sim") await startSim();
  else await startAR();
});

els.stopBtn.addEventListener("click", () => {
  stopAll();
  setStatus(
    state.mode === "sim"
      ? "Stopped. You can press Start again."
      : "Stopped AR preview. You can press Start again."
  );
});

els.backToStep3Btn.addEventListener("click", () => {
  stopAll();
  window.location.href = "./step3page.html";
});

els.goStep1Btn.addEventListener("click", () => {
  stopAll();
  window.location.href = "./builder.html";
});

els.continueBtn.addEventListener("click", () => {
  stopAll();
  window.location.href = "./step5page.html";
});

/* ---------------- init ---------------- */

(async function init() {
  loadSavedInputsFromLocalStorage();

  try {
    await loadVideoFileFromIndexedDB();
  } catch {}

  renderReadiness();

  if (!state.hasArtwork && !state.hasVideo) {
    setStatus("Missing artwork and video. Go back to Step 1 and Step 3.");
  } else if (!state.hasArtwork) {
    setStatus("Missing artwork. Go back to Step 1.");
  } else if (!state.hasVideo) {
    setStatus("Missing video. Go back to Step 3 and click Save video.");
  } else {
    setStatus("Simulated preview ready. You can continue to Step 5.");
  }

  wireSimPreview();

  els.simWrap.style.display = "flex";
  els.arWrap.style.display = "none";

  wireARScene();

  // Wait a moment for a-scene to finish loading, then configure AR inputs
  // (mindar system exists after scene 'loaded' event, but we can set attributes earlier)
  configureARInputsIfAvailable();

  setMode("sim");
  updateContinue();

  window.addEventListener("beforeunload", () => {
    try {
      if (state.videoObjectUrl) URL.revokeObjectURL(state.videoObjectUrl);
    } catch {}
    try {
      if (state.targetBlobUrl) URL.revokeObjectURL(state.targetBlobUrl);
    } catch {}
  });
})();
