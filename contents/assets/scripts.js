const html = document.documentElement;
const modeButtons = document.querySelectorAll(".mode-btn");

const arboriumScript = document.querySelector(
  'script[src*="@arborium/arborium"]'
);

const CODE_THEMES = {
  light: "ayu-light",
  dark: "ayu-dark",
};

function updateArboriumTheme(theme) {
  if (!arboriumScript || !window.arborium?.highlightAll) {
    return;
  }

  arboriumScript.dataset.theme = CODE_THEMES[theme];
  window.arborium.highlightAll();
}

function updateButtons(theme) {
  const nextTheme = theme === "dark" ? "light" : "dark";

  modeButtons.forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.mode === nextTheme
    );
  });
}

function setTheme(theme) {
  html.dataset.theme = theme;
  localStorage.setItem("theme", theme);

  updateButtons(theme);
  updateArboriumTheme(theme);
}

function getCurrentTheme() {
  if (html.dataset.theme) {
    return html.dataset.theme;
  }

  return matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

setTheme(localStorage.getItem("theme") ?? getCurrentTheme());

modeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setTheme(button.dataset.mode);
  });
});
