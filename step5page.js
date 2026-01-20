const els = {
  urlState: document.getElementById("urlState"),
  modeState: document.getElementById("modeState"),
  status: document.getElementById("status"),

  qrData: document.getElementById("qrData"),
  downloadQrBtn: document.getElementById("downloadQrBtn"),
  openLinkBtn: document.getElementById("openLinkBtn"),

  backToStep4Btn: document.getElementById("backToStep4Btn"),
  continueBtn: document.getElementById("continueBtn"),

  qrcodeEl: document.getElementById("qrcode"),
};

const STORAGE_KEYS = {
  artwork: "webar_builder_artwork",
  videoMeta: "webar_builder_video_meta",
  experienceUrl: "webar_builder_experience_url",
};

let state = {
  url: null,
  qrReady: false,
};

function setStatus(msg) {
  els.status.textContent = msg;
}

function safeParseJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

function validateInputs() {
  const artwork = localStorage.getItem(STORAGE_KEYS.artwork);
  const videoMeta = safeParseJson(localStorage.getItem(STORAGE_KEYS.videoMeta));
  return !!artwork && !!videoMeta;
}

function buildExperienceUrl() {
  // Must be served over http(s). QR should never be generated in file:// mode.
  if (window.location.protocol === "file:") return null;

  const base = window.location.origin + window.location.pathname.replace(/\/[^/]*$/, "/");
  return `${base}experience.html`;
}

function setButtonsEnabled(enabled) {
  els.downloadQrBtn.disabled = !enabled;
  els.openLinkBtn.disabled = !enabled;
  els.continueBtn.disabled = !enabled;
}

function clearQrDom() {
  while (els.qrcodeEl.firstChild) {
    els.qrcodeEl.removeChild(els.qrcodeEl.firstChild);
  }
}

function generateQr(url) {
  if (typeof QRCode === "undefined") {
    throw new Error("QRCode.js not loaded. Check script tag in step5page.html.");
  }

  clearQrDom();

  new QRCode(els.qrcodeEl, {
    text: url,
    width: 320,
    height: 320,
    colorDark: "#111111",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });

  state.qrReady = true;
  setButtonsEnabled(true);
}

function getQrImageDataUrl() {
  const img = els.qrcodeEl.querySelector("img");
  if (img && img.src) return img.src;

  const canvas = els.qrcodeEl.querySelector("canvas");
  if (canvas) return canvas.toDataURL("image/png");

  return null;
}

function downloadQrPng() {
  const dataUrl = getQrImageDataUrl();
  if (!dataUrl) {
    setStatus("QR download failed. QR image not found.");
    return;
  }

  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = "webar-qr.png";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* events */
els.backToStep4Btn.addEventListener("click", () => {
  window.location.href = "./step4page.html";
});

els.downloadQrBtn.addEventListener("click", () => {
  if (!state.qrReady) return;
  downloadQrPng();
});

els.openLinkBtn.addEventListener("click", () => {
  if (!state.qrReady || !state.url) return;
  window.open(state.url, "_blank", "noopener,noreferrer");
});

els.continueBtn.addEventListener("click", () => {
  window.location.href = "./step6page.html";
});

/* init */
(function init() {
  els.modeState.textContent = "Publishable";
  setButtonsEnabled(false);

  if (window.location.protocol === "file:") {
    els.urlState.textContent = "Open using Live Server";
    els.qrData.textContent = "-";
    setStatus("Open this page using Live Server (http://). QR requires a real URL.");
    return;
  }

  if (!validateInputs()) {
    els.urlState.textContent = "Missing inputs";
    els.qrData.textContent = "-";
    setStatus("Missing artwork or video. Complete Step 1 and Step 3 first.");
    return;
  }

  state.url = buildExperienceUrl();
  if (!state.url) {
    els.urlState.textContent = "Invalid URL";
    els.qrData.textContent = "-";
    setStatus("Failed to build experience URL.");
    return;
  }

  localStorage.setItem(STORAGE_KEYS.experienceUrl, state.url);

  els.urlState.textContent = state.url;
  els.qrData.textContent = "experience.html";

  try {
    setStatus("Generating QR code...");
    generateQr(state.url);
    setStatus("QR code ready. Scan it to open the experience.");
  } catch (e) {
    setButtonsEnabled(false);
    setStatus(`QR generation failed: ${e.message}`);
  }
})();