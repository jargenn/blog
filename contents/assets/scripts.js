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

// Lightbox for content images: click to view at full size, with caption.
const lightbox = document.createElement("div");
lightbox.className = "lightbox";
lightbox.hidden = true;
lightbox.innerHTML =
  '<img alt=""><figcaption class="lightbox-caption"></figcaption>';
const lightboxImg = lightbox.querySelector("img");
const lightboxCaption = lightbox.querySelector(".lightbox-caption");
document.body.appendChild(lightbox);

function openLightbox(img) {
  lightboxImg.src = img.currentSrc || img.src;
  lightboxImg.alt = img.alt;
  const caption = img.closest("figure")?.querySelector("figcaption");
  lightboxCaption.textContent = caption?.textContent.trim() ?? "";
  lightboxCaption.hidden = !caption;
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.src = "";
  document.body.style.overflow = "";
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (!lightbox.hidden) {
    closeLightbox();
    return;
  }
  const img = target.closest("img[data-kind='media']");
  if (img) {
    event.preventDefault();
    openLightbox(img);
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !lightbox.hidden) closeLightbox();
});

document.addEventListener("pointerup", clearPressedCursor);
document.addEventListener("pointercancel", clearPressedCursor);
globalThis.addEventListener("blur", clearPressedCursor);
document.addEventListener("visibilitychange", clearPressedCursor);
