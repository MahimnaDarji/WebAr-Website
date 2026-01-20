const els = {
  artworkPreview: document.getElementById("artworkPreview"),
  missingArtwork: document.getElementById("missingArtwork"),

  metaFile: document.getElementById("metaFile"),
  metaRes: document.getElementById("metaRes"),
  metaType: document.getElementById("metaType"),

  trackingStatus: document.getElementById("trackingStatus"),

  generateBtn: document.getElementById("generateBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  continueBtn: document.getElementById("continueBtn"),
  backToStep1Btn: document.getElementById("backToStep1Btn"),
};

const STORAGE_KEYS = {
  artwork: "webar_builder_artwork",
  artworkMeta: "webar_builder_artwork_meta",

  targetFileBase64: "webar_builder_target_file_base64",
  targetMeta: "webar_builder_target_meta",

  apiBase: "webar_builder_api_base"
};

const state = {
  apiBase: localStorage.getItem(STORAGE_KEYS.apiBase) || "http://localhost:3001",

  artworkDataUrl: null,
  artworkMeta: null,

  targetBase64: null,
  targetMeta: null,

  serverOk: false
};

function setStatus(msg) {
  els.trackingStatus.textContent = msg;
}

function safeParseJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function bytesToKB(bytes) {
  return `${Math.round(bytes / 1024)} KB`;
}

function base64ToBlob(base64, mime = "application/octet-stream") {
  const binStr = atob(base64);
  const len = binStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binStr.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function loadFromStorage() {
  state.artworkDataUrl = localStorage.getItem(STORAGE_KEYS.artwork);
  state.artworkMeta = safeParseJson(localStorage.getItem(STORAGE_KEYS.artworkMeta));

  state.targetBase64 = localStorage.getItem(STORAGE_KEYS.targetFileBase64);
  state.targetMeta = safeParseJson(localStorage.getItem(STORAGE_KEYS.targetMeta));
}

function renderArtwork() {
  if (!state.artworkDataUrl || !state.artworkMeta) {
    els.artworkPreview.style.display = "none";
    els.missingArtwork.style.display = "block";

    els.metaFile.textContent = "-";
    els.metaRes.textContent = "-";
    els.metaType.textContent = "-";

    els.generateBtn.disabled = true;
    els.downloadBtn.disabled = true;
    els.continueBtn.disabled = false;

    setStatus("No artwork found. Go back to Step 1 and upload an image.");
    return false;
  }

  els.artworkPreview.src = state.artworkDataUrl;
  els.artworkPreview.style.display = "block";
  els.missingArtwork.style.display = "none";

  els.metaFile.textContent = state.artworkMeta.name || "Artwork";
  els.metaRes.textContent =
    state.artworkMeta.width && state.artworkMeta.height
      ? `${state.artworkMeta.width} x ${state.artworkMeta.height}`
      : "-";

  els.metaType.textContent =
    state.artworkMeta.type === "image/jpeg" ? "JPG" :
    state.artworkMeta.type === "image/png" ? "PNG" :
    (state.artworkMeta.type || "-");

  return true;
}

function renderTargetState() {
  const hasTarget = !!(state.targetBase64 && state.targetMeta && state.targetMeta.placeholder === false);

  if (hasTarget) {
    els.downloadBtn.disabled = false;
    const sizeTxt = state.targetMeta.sizeBytes ? bytesToKB(state.targetMeta.sizeBytes) : "ready";
    setStatus(`Target ready: ${state.targetMeta.filename || "target.mind"} (${sizeTxt}).`);
  } else {
    els.downloadBtn.disabled = true;
  }

  els.continueBtn.disabled = false;
}

async function checkServerHealth() {
  const url = `${state.apiBase}/health`;
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!data?.ok;
  } catch {
    return false;
  }
}

function updateButtons() {
  const hasArtwork = !!(state.artworkDataUrl && state.artworkMeta);
  els.generateBtn.disabled = !(hasArtwork && state.serverOk);

  const hasTarget = !!(state.targetBase64 && state.targetMeta && state.targetMeta.placeholder === false);
  els.downloadBtn.disabled = !hasTarget;

  els.continueBtn.disabled = false;

  if (!hasArtwork) return;

  if (!state.serverOk) {
    if (!hasTarget) {
      setStatus(
        `Server not reachable at ${state.apiBase}. ` +
        `Start the backend (node server.js) and refresh.`
      );
    }
  } else {
    if (!hasTarget) setStatus("Server connected. Click Generate target file.");
  }
}

async function compileMindTargetViaBackend() {
  const endpoint = `${state.apiBase}/api/mindar/compile`;

  els.generateBtn.disabled = true;
  els.downloadBtn.disabled = true;
  els.continueBtn.disabled = false;

  setStatus("Generating target file… (this can take a bit)");

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        imageDataUrl: state.artworkDataUrl,
        imageName: state.artworkMeta?.name || "artwork.png",
      }),
    });

    if (!res.ok) {
      let details = "";
      try {
        const errJson = await res.json();
        details = errJson?.details || errJson?.error || "";
      } catch {
        details = await res.text().catch(() => "");
      }
      throw new Error(details || `Backend error (${res.status})`);
    }

    const data = await res.json();
    if (!data?.mindBase64) throw new Error("Invalid backend response. mindBase64 missing.");

    const filename = data.filename || "target.mind";
    const sizeBytes = Math.round((data.mindBase64.length * 3) / 4);

    const meta = {
      filename,
      sizeBytes,
      createdAt: new Date().toISOString(),
      placeholder: false,
      apiBase: state.apiBase
    };

    localStorage.setItem(STORAGE_KEYS.targetFileBase64, data.mindBase64);
    localStorage.setItem(STORAGE_KEYS.targetMeta, JSON.stringify(meta));

    state.targetBase64 = data.mindBase64;
    state.targetMeta = meta;

    setStatus(`Target generated: ${filename} (${bytesToKB(sizeBytes)}).`);
    els.downloadBtn.disabled = false;
  } catch (e) {
    setStatus(
      `Target generation failed. Server: ${state.apiBase}. ` +
      `Error: ${e.message}. ` +
      `Make sure server.js is running and not blocked by firewall.`
    );
  } finally {
    els.generateBtn.disabled = !(!!(state.artworkDataUrl && state.artworkMeta) && state.serverOk);
  }
}

function downloadTarget() {
  if (!state.targetBase64 || !state.targetMeta) return;

  const blob = base64ToBlob(state.targetBase64, "application/octet-stream");
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = state.targetMeta.filename || "target.mind";
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

/* Events */
els.backToStep1Btn.addEventListener("click", () => {
  window.location.href = "./builder.html";
});

els.generateBtn.addEventListener("click", async () => {
  await compileMindTargetViaBackend();
});

els.downloadBtn.addEventListener("click", () => {
  downloadTarget();
});

els.continueBtn.addEventListener("click", () => {
  window.location.href = "./step3page.html";
});

/* Init */
(async function init() {
  loadFromStorage();
  const ok = renderArtwork();
  if (!ok) return;

  renderTargetState();

  setStatus("Checking server…");
  state.serverOk = await checkServerHealth();

  updateButtons();
})();
