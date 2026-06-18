const html = document.documentElement;

const arboriumScript = document.querySelector(
  'script[src*="@arborium/arborium"]'
);

const CODE_THEMES = {
  light: "ayu-light",
  dark: "gruvbox-dark",
};

function updateArboriumTheme(theme) {
  if (!arboriumScript || !window.arborium?.highlightAll) {
    return;
  }

  arboriumScript.dataset.theme = CODE_THEMES[theme];
  window.arborium.highlightAll();
}

function setTheme(theme) {
  html.dataset.theme = theme;

  updateArboriumTheme(theme);
}

const systemTheme = matchMedia("(prefers-color-scheme: dark)");

systemTheme.addEventListener("change", (e) => {
  setTheme(e.matches ? "dark" : "light");
});

setTheme(systemTheme.matches ? "dark" : "light");
