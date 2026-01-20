// nav.js - active + completed step highlighting for multi-page flow
(() => {
  const steps = Array.from(document.querySelectorAll(".stepBar a.step"));
  if (!steps.length) return;

  const getFile = (hrefOrPath) =>
    (hrefOrPath || "").split("?")[0].split("#")[0].split("/").pop();

  let currentFile = getFile(window.location.pathname) || "builder.html";
  if (currentFile === "index.html" || currentFile === "") currentFile = "builder.html";

  const normalize = (file) => {
    if (!file) return "builder.html";
    if (file === "step1page.html") return "builder.html";
    return file;
  };

  currentFile = normalize(currentFile);

  // Define the correct order of steps in your flow
  const order = [
    "builder.html",
    "step2page.html",
    "step3page.html",
    "step4page.html",
    "step5page.html",
    "step6page.html",
  ];

  const currentIndex = order.indexOf(currentFile);

  // Clear existing states
  steps.forEach((a) => {
    a.classList.remove("active", "completed");
    a.removeAttribute("aria-current");
  });

  // Apply state based on step order
  steps.forEach((a) => {
    const hrefFile = normalize(getFile(a.getAttribute("href")));
    const idx = order.indexOf(hrefFile);

    if (idx === -1 || currentIndex === -1) return;

    if (idx < currentIndex) {
      a.classList.add("completed");
    } else if (idx === currentIndex) {
      a.classList.add("active");
      a.setAttribute("aria-current", "step");
    }
  });
})();
