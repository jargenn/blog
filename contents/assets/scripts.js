
const CODE_THEMES = {
  light: "gruvbox-light",
  // light: "ayu-light",
  dark: "gruvbox-dark",
};

const html = document.documentElement;
const arboriumScript = document.querySelector('script[src*="@arborium/arborium"]');

function setTheme(theme) {
  html.dataset.theme = theme;

  if (arboriumScript && window.arborium?.highlightAll) {
    arboriumScript.dataset.theme = CODE_THEMES[theme];
    window.arborium.highlightAll();
  }
}

const systemTheme = matchMedia("(prefers-color-scheme: dark)");
systemTheme.addEventListener("change", (e) => setTheme(e.matches ? "dark" : "light"));
setTheme(systemTheme.matches ? "dark" : "light");
