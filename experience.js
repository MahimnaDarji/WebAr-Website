// experience.js

window.addEventListener("DOMContentLoaded", () => {
  const scene = document.querySelector("a-scene");
  const preview = document.getElementById("camPreview");
  const hint = document.getElementById("hint");
  const statusPill = document.getElementById("statusPill");

  const anchor = document.getElementById("anchor");
  const vPlane = document.getElementById("videoPlane");
  const adImg = document.getElementById("adImage");
  const video = document.getElementById("adVideo");

  const SCALE_FACTOR = 1.4;

  function setStatus(text) {
    if (!statusPill) return;
    statusPill.textContent = text;
  }

  function hideHint() {
    if (!hint) return;
    hint.classList.add("hidden");
  }

  function showHint() {
    if (!hint) return;
    hint.classList.remove("hidden");
  }

  // Attach MindAR stream to background preview and hide hint immediately
  function attachPreviewIfReady() {
    try {
      const ms = scene.systems["mindar-image-system"];
      const iv = ms && ms.video;

      if (iv && iv.srcObject) {
        preview.srcObject = iv.srcObject;

        // Your requirement: hide hint when camera is live
        hideHint();
        setStatus("Camera active. Point at the printed ad.");
        return true;
      }
    } catch (e) {}
    return false;
  }

  function waitForCamera() {
    if (!attachPreviewIfReady()) {
      setTimeout(waitForCamera, 150);
    }
  }

  // Aspect ratio from image
  function getTargetAspectRatio() {
    if (adImg && adImg.naturalWidth > 0 && adImg.naturalHeight > 0) {
      return adImg.naturalWidth / adImg.naturalHeight;
    }
    return 16 / 9;
  }

  // Size plane based on target image
  function setupVideoPlane() {
    if (!vPlane) return;

    const targetAspect = getTargetAspectRatio();

    const targetWidth = 1.0;
    const targetHeight = targetWidth / targetAspect;

    const planeWidth = targetWidth * SCALE_FACTOR;
    const planeHeight = targetHeight * SCALE_FACTOR;

    vPlane.setAttribute("width", planeWidth);
    vPlane.setAttribute("height", planeHeight);
    vPlane.setAttribute("position", "0 0 0.001");

    // Reduce flicker: disable frustum culling + reset texture mapping
    setTimeout(() => {
      const mesh = vPlane.getObject3D("mesh");
      if (mesh) {
        mesh.traverse((m) => {
          m.frustumCulled = false;
        });

        if (mesh.material && mesh.material.map) {
          const map = mesh.material.map;
          map.center.set(0.5, 0.5);
          map.repeat.set(1, 1);
          map.offset.set(0, 0);
          map.needsUpdate = true;
        }
      }
    }, 100);
  }

  function waitForImageLoad() {
    if (adImg && adImg.complete && adImg.naturalWidth > 0) {
      setupVideoPlane();
    } else {
      setTimeout(waitForImageLoad, 100);
    }
  }

  // Scene loaded -> wait for camera stream
  if (scene) {
    scene.addEventListener("loaded", () => {
      setStatus("Starting camera...");
      waitForCamera();
    });
  }

  // Image load -> size plane
  if (adImg) {
    adImg.addEventListener("load", () => {
      setupVideoPlane();
    });
    waitForImageLoad();
  }

  // Target found/lost behavior
  if (anchor) {
    anchor.addEventListener("targetFound", async () => {
      hideHint();
      setStatus("Target found. Playing video...");
      setTimeout(setupVideoPlane, 150);

      try {
        await video.play();
      } catch (e) {
        setStatus("Tap to play video");

        const resume = () => {
          video.play().catch(() => {});
          window.removeEventListener("touchend", resume);
          window.removeEventListener("click", resume);
        };

        window.addEventListener("touchend", resume, { once: true });
        window.addEventListener("click", resume, { once: true });
      }
    });

    anchor.addEventListener("targetLost", () => {
      showHint();
      setStatus("Target lost. Point at the printed ad.");
      if (video) video.pause();
    });
  }
});
