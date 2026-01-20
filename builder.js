/* builder.js
   Step 1 (publishable): upload artwork + tracking score + save for later steps
   Uses only localStorage (artwork + meta + score). Step 2 will generate target.
*/

const els = {
  fileInput: document.getElementById("fileInput"),
  analyzeBtn: document.getElementById("analyzeBtn"),
  clearBtn: document.getElementById("clearBtn"),
  continueBtn: document.getElementById("continueBtn"),
  status: document.getElementById("status"),

  previewImg: document.getElementById("previewImg"),
  emptyPreview: document.getElementById("emptyPreview"),

  metaFile: document.getElementById("metaFile"),
  metaRes: document.getElementById("metaRes"),
  metaSize: document.getElementById("metaSize"),
  metaType: document.getElementById("metaType"),

  scoreValue: document.getElementById("scoreValue"),
  scoreText: document.getElementById("scoreText"),
  meterFill: document.getElementById("meterFill"),
  suggestions: document.getElementById("suggestions"),
};

const STORAGE_KEYS = {
  artwork: "webar_builder_artwork",
  artworkMeta: "webar_builder_artwork_meta",
  artworkScore: "webar_builder_artwork_score",
};

let current = {
  file: null,
  dataUrl: null,
  imgWidth: null,
  imgHeight: null,
};

function setStatus(msg) {
  els.status.textContent = msg;
}

function bytesToKB(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

function setSuggestions(items) {
  els.suggestions.innerHTML = "";
  if (!items || items.length === 0) {
    const li = document.createElement("li");
    li.className = "muted";
    li.textContent = "No issues detected.";
    els.suggestions.appendChild(li);
    return;
  }
  for (const t of items) {
    const li = document.createElement("li");
    li.textContent = t;
    els.suggestions.appendChild(li);
  }
}

function setScore(score, label) {
  els.scoreValue.textContent = typeof score === "number" ? String(score) : "-";
  els.scoreText.textContent = label || "Upload an image to score it.";

  const pct = typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
  els.meterFill.style.width = `${pct}%`;
}

function safeParseJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function resetUI() {
  current.file = null;
  current.dataUrl = null;
  current.imgWidth = null;
  current.imgHeight = null;

  els.fileInput.value = "";

  els.previewImg.src = "";
  els.previewImg.style.display = "none";
  els.emptyPreview.style.display = "block";

  els.metaFile.textContent = "None";
  els.metaRes.textContent = "-";
  els.metaSize.textContent = "-";
  els.metaType.textContent = "-";

  els.analyzeBtn.disabled = true;
  els.clearBtn.disabled = true;
  els.continueBtn.disabled = true;

  setScore(null, "Upload an image to score it.");
  setSuggestions(["No analysis yet."]);
  setStatus("No file selected.");

  localStorage.removeItem(STORAGE_KEYS.artwork);
  localStorage.removeItem(STORAGE_KEYS.artworkMeta);
  localStorage.removeItem(STORAGE_KEYS.artworkScore);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error("File read failed"));
    r.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image load failed"));
    img.src = dataUrl;
  });
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/*
  Tracking heuristic:
  - Sharpness: Laplacian variance
  - Contrast: grayscale std dev
  - Feature density: gradient threshold ratio
  - Resolution: minimum dimension
*/
function analyzeForTracking(img) {
  const suggestions = [];

  const maxSide = 900;
  let w = img.naturalWidth;
  let h = img.naturalHeight;

  if (Math.max(w, h) > maxSide) {
    const s = maxSide / Math.max(w, h);
    w = Math.round(w * s);
    h = Math.round(h * s);
  }

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const { data } = ctx.getImageData(0, 0, w, h);

  const gray = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray[p] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Contrast (std dev)
  let sum = 0;
  for (let i = 0; i < gray.length; i++) sum += gray[i];
  const mean = sum / gray.length;

  let v = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i] - mean;
    v += d * d;
  }
  const variance = v / gray.length;
  const contrastStd = Math.sqrt(variance);

  // Sharpness: Laplacian variance
  let lapSum = 0;
  let lapSumSq = 0;
  let lapCount = 0;

  // Feature density
  let edgeCount = 0;
  let gradCount = 0;
  const edgeThreshold = 35;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;

      const c = gray[idx];
      const up = gray[idx - w];
      const dn = gray[idx + w];
      const lf = gray[idx - 1];
      const rt = gray[idx + 1];

      const lap = (up + dn + lf + rt) - 4 * c;
      lapSum += lap;
      lapSumSq += lap * lap;
      lapCount++;

      const gx = rt - lf;
      const gy = dn - up;
      const mag = Math.abs(gx) + Math.abs(gy);

      gradCount++;
      if (mag > edgeThreshold) edgeCount++;
    }
  }

  const lapMean = lapSum / lapCount;
  const lapVar = (lapSumSq / lapCount) - (lapMean * lapMean);
  const sharpness = Math.max(0, lapVar);
  const featureDensity = edgeCount / gradCount;

  const minDim = Math.min(img.naturalWidth, img.naturalHeight);

  // Flat area estimate
  const flatThreshold = 10;
  let flatCount = 0;
  const sampleStep = 6;
  for (let i = 0; i < gray.length; i += sampleStep) {
    if (Math.abs(gray[i] - mean) < flatThreshold) flatCount++;
  }
  const flatRatio = flatCount / Math.ceil(gray.length / sampleStep);

  // Normalize -> 0..100
  const sharpScore = clamp01(sharpness / 1200) * 100;
  const contrastScore = clamp01(contrastStd / 55) * 100;
  const featureScore = clamp01(featureDensity / 0.18) * 100;
  const resScore = clamp01(minDim / 800) * 100;

  const raw =
    0.34 * sharpScore +
    0.22 * contrastScore +
    0.30 * featureScore +
    0.14 * resScore;

  const score = Math.round(Math.max(0, Math.min(100, raw)));

  // Suggestions
  if (minDim < 800) {
    suggestions.push("Low resolution. Use a higher resolution artwork (at least 1200px on the shorter side).");
  }
  if (sharpness < 400) {
    suggestions.push("Artwork looks soft. Use a sharper image and avoid motion blur.");
  }
  if (contrastStd < 25) {
    suggestions.push("Low contrast. Increase contrast or add clearer edges.");
  }
  if (featureDensity < 0.06) {
    suggestions.push("Not enough features for tracking. Add texture, patterns, or detailed elements (avoid large plain areas).");
  }
  if (flatRatio > 0.55) {
    suggestions.push("Large flat areas detected. Tracking works better with unique corners and busy regions.");
  }

  const label =
    score >= 78 ? "Strong for tracking." :
    score >= 58 ? "Acceptable, but can be improved." :
    score >= 40 ? "Weak. Fix before printing." :
    "Very weak. Likely to fail tracking.";

  return { score, label, suggestions, debug: { sharpness, contrastStd, featureDensity, minDim, flatRatio } };
}

function persistArtwork(file, dataUrl, w, h) {
  localStorage.setItem(STORAGE_KEYS.artwork, dataUrl);
  localStorage.setItem(STORAGE_KEYS.artworkMeta, JSON.stringify({
    name: file.name,
    type: file.type,
    size: file.size,
    lastModified: file.lastModified,
    width: w,
    height: h,
  }));
}

async function handleSelectedFile(file) {
  if (!file) return;

  if (!["image/png", "image/jpeg"].includes(file.type)) {
    resetUI();
    setStatus("Invalid file type. Upload a JPG or PNG.");
    return;
  }

  els.clearBtn.disabled = false;
  els.analyzeBtn.disabled = true;
  els.continueBtn.disabled = true;

  setStatus("Loading image...");

  try {
    const dataUrl = await readFileAsDataURL(file);
    const img = await loadImage(dataUrl);

    current.file = file;
    current.dataUrl = dataUrl;
    current.imgWidth = img.naturalWidth;
    current.imgHeight = img.naturalHeight;

    // Preview
    els.previewImg.src = dataUrl;
    els.previewImg.style.display = "block";
    els.emptyPreview.style.display = "none";

    // Meta
    els.metaFile.textContent = file.name;
    els.metaRes.textContent = `${img.naturalWidth} x ${img.naturalHeight}`;
    els.metaSize.textContent = bytesToKB(file.size);
    els.metaType.textContent = file.type === "image/jpeg" ? "JPG" : "PNG";

    // Persist raw artwork immediately
    persistArtwork(file, dataUrl, img.naturalWidth, img.naturalHeight);

    setScore(null, "Ready to analyze.");
    setSuggestions(["No analysis yet."]);

    els.analyzeBtn.disabled = false;
    setStatus("Image loaded. Click Analyze artwork.");

    // Auto-analyze once (keeps flow smooth)
    await runAnalysis(img);
  } catch {
    resetUI();
    setStatus("Failed to load image.");
  }
}

async function runAnalysis(preloadedImg) {
  if (!current.dataUrl || !current.file) return;

  els.analyzeBtn.disabled = true;
  setStatus("Analyzing...");

  try {
    const img = preloadedImg || await loadImage(current.dataUrl);
    const analysis = analyzeForTracking(img);

    setScore(analysis.score, analysis.label);
    setSuggestions(analysis.suggestions);

    localStorage.setItem(STORAGE_KEYS.artworkScore, JSON.stringify({
      score: analysis.score,
      label: analysis.label,
      debug: analysis.debug,
    }));

    // Gate continue for truly bad images
    els.continueBtn.disabled = analysis.score < 40;

    setStatus(analysis.score < 40
      ? "Analysis complete. Tracking is weak. Improve artwork before continuing."
      : "Analysis complete. You can continue."
    );
  } catch {
    setStatus("Analysis failed.");
  } finally {
    els.analyzeBtn.disabled = false;
  }
}

/* ---------- events ---------- */

els.fileInput.addEventListener("change", (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) {
    resetUI();
    return;
  }
  handleSelectedFile(file);
});

els.analyzeBtn.addEventListener("click", async () => {
  await runAnalysis();
});

els.clearBtn.addEventListener("click", () => {
  resetUI();
});

els.continueBtn.addEventListener("click", () => {
  const saved = localStorage.getItem(STORAGE_KEYS.artwork);
  if (!saved) {
    setStatus("Artwork not saved. Please upload again.");
    return;
  }
  // Your Step 2 file name in this project:
  window.location.href = "./step2page.html";
});

/* ---------- init ---------- */
resetUI();

// Optional: restore last artwork preview if present (publishable convenience)
(function restoreIfPresent() {
  const dataUrl = localStorage.getItem(STORAGE_KEYS.artwork);
  const meta = safeParseJson(localStorage.getItem(STORAGE_KEYS.artworkMeta));
  const score = safeParseJson(localStorage.getItem(STORAGE_KEYS.artworkScore));

  if (!dataUrl || !meta) return;

  els.previewImg.src = dataUrl;
  els.previewImg.style.display = "block";
  els.emptyPreview.style.display = "none";

  els.metaFile.textContent = meta.name || "Artwork";
  if (meta.width && meta.height) els.metaRes.textContent = `${meta.width} x ${meta.height}`;
  if (meta.size) els.metaSize.textContent = bytesToKB(meta.size);
  els.metaType.textContent =
    meta.type === "image/jpeg" ? "JPG" :
    meta.type === "image/png" ? "PNG" :
    (meta.type || "-");

  els.clearBtn.disabled = false;
  els.analyzeBtn.disabled = false;

  if (score && typeof score.score === "number") {
    setScore(score.score, score.label || "Scored.");
    els.continueBtn.disabled = score.score < 40;
    setSuggestions([]);
    setStatus("Loaded previous artwork. You can continue or replace it.");
  } else {
    setStatus("Loaded previous artwork. Click Analyze artwork.");
  }
})();
