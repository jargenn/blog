const CODE_THEMES = {
  light: "alabaster",
  dark: "gruvbox-dark",
};

const html = document.documentElement;
const arboriumScript = document.querySelector(
  'script[src*="@arborium/arborium"]',
);

function setTheme(theme) {
  html.dataset.theme = theme;

  if (arboriumScript && globalThis.arborium?.highlightAll) {
    arboriumScript.dataset.theme = CODE_THEMES[theme];
    globalThis.arborium.highlightAll();
  }
}

const systemTheme = matchMedia("(prefers-color-scheme: dark)");
systemTheme.addEventListener(
  "change",
  (e) => setTheme(e.matches ? "dark" : "light"),
);
setTheme(systemTheme.matches ? "dark" : "light");

// :active is not guaranteed to repaint before a link navigates. Load the
// cursor up front and own the pressed state for the whole pointer gesture.
const assetBase = new URL(".", document.currentScript?.src ?? location.href);
for (const name of ["Cursor.cur", "Hand.cur", "Hand-pressed.cur"]) {
  const cursor = new Image();
  cursor.src = new URL(name, assetBase).href;
}

function clearPressedCursor() {
  html.classList.remove("is-pressing");
}

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  const target = event.target;
  if (target instanceof Element && target.closest("a[href]")) {
    html.classList.add("is-pressing");
  }
});

document.addEventListener("pointerup", clearPressedCursor);
document.addEventListener("pointercancel", clearPressedCursor);
globalThis.addEventListener("blur", clearPressedCursor);
document.addEventListener("visibilitychange", clearPressedCursor);
