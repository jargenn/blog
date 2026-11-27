/// <reference lib="dom" />

type Theme = "light" | "dark";

type ReadingPreference = {
  default: string;
  values?: string[];
  validate?: (value: string) => boolean;
  property?: string;
  attribute?: string;
};

const CODE_THEMES: Record<Theme, string> = {
  light: "gruvbox-light",
  dark: "gruvbox-dark",
};

const html = document.documentElement;
const arboriumScript = document.querySelector<HTMLScriptElement>(
  'script[src*="@arborium/arborium"]',
);
const arboriumApi = (globalThis as typeof globalThis & {
  arborium?: { highlightAll?: () => void };
}).arborium;

for (
  const placeholder of document.querySelectorAll<HTMLElement>(
    ".email-address[data-address]",
  )
) {
  const email = [...(placeholder.dataset.address ?? "")].reverse().join("");
  const link = document.createElement("a");
  link.href = `mailto:${email}`;
  link.textContent = email;
  placeholder.replaceChildren(link);
}

function setTheme(theme: Theme) {
  html.dataset.theme = theme;

  if (arboriumScript && arboriumApi?.highlightAll) {
    arboriumScript.dataset.theme = CODE_THEMES[theme];
    arboriumApi.highlightAll();
    applyCodeLineHighlights();
  }
}

const readingPreferences: Record<string, ReadingPreference> = {
  lineHeight: {
    default: "1.8",
    validate: (value) => {
      const lineHeight = Number(value);
      return Number.isFinite(lineHeight) && lineHeight >= 1 && lineHeight <= 3;
    },
    property: "--reading-line-height",
  },
  font: {
    default: "et-book",
    values: ["et-book", "cabin", "atkinson", "system"],
    attribute: "data-reading-font",
  },
  contrast: {
    default: "off",
    values: ["off", "on"],
    attribute: "data-heavy-contrast",
  },
};
const preferenceKey = "reading-preferences";
const preferenceControls = document.querySelectorAll<
  HTMLInputElement | HTMLSelectElement | HTMLButtonElement
>(
  "[data-reading-preference]",
);

function applyReadingPreference(name: string, value: string) {
  const preference = readingPreferences[name];
  if (!preference) return;
  if (preference.values && !preference.values.includes(value)) return;
  if (preference.validate && !preference.validate(value)) return;

  if (preference.property) {
    html.style.setProperty(preference.property, value);
  }
  if (preference.attribute) {
    html.setAttribute(preference.attribute, value);
  }
  for (const control of preferenceControls) {
    if (control.dataset.readingPreference !== name) continue;
    if (control instanceof HTMLButtonElement) {
      control.setAttribute("aria-pressed", value === "on" ? "true" : "false");
    } else if (
      control instanceof HTMLInputElement && control.type === "checkbox"
    ) {
      control.checked = value === "on";
    } else {
      control.value = value;
    }
  }
}

let savedPreferences: Record<string, string> = {};
try {
  const stored = JSON.parse(localStorage.getItem(preferenceKey) ?? "{}");
  if (stored && typeof stored === "object" && !Array.isArray(stored)) {
    savedPreferences = stored as Record<string, string>;
  }
} catch {
  // Ignore unavailable storage or invalid saved data and use site defaults.
}
for (const [name, preference] of Object.entries(readingPreferences)) {
  const saved = savedPreferences[name];
  const isValid = preference.values
    ? saved !== undefined && preference.values.includes(saved)
    : saved !== undefined && (preference.validate?.(saved) ?? true);
  const value = isValid ? saved : preference.default;
  applyReadingPreference(name, value);
}

for (const control of preferenceControls) {
  const savePreference = (name: string | undefined, value: string) => {
    if (!name) return;
    const preference = readingPreferences[name];
    if (!preference) return;
    if (preference.values && !preference.values.includes(value)) return;
    if (preference.validate && !preference.validate(value)) return;
    applyReadingPreference(name, value);
    try {
      savedPreferences[name] = value;
      localStorage.setItem(preferenceKey, JSON.stringify(savedPreferences));
    } catch {
      // The controls still work for this page when storage is unavailable.
    }
  };

  const name = control.dataset.readingPreference;
  if (control instanceof HTMLButtonElement) {
    control.addEventListener("click", () => {
      const value = control.getAttribute("aria-pressed") === "true"
        ? "off"
        : "on";
      savePreference(name, value);
    });
  } else {
    control.addEventListener("change", () => {
      savePreference(name, control.value);
    });
  }
}

document.querySelector(".reading-preferences-reset")?.addEventListener(
  "click",
  () => {
    savedPreferences = {};
    for (const [name, preference] of Object.entries(readingPreferences)) {
      applyReadingPreference(name, preference.default);
    }
    try {
      localStorage.removeItem(preferenceKey);
    } catch {
      // The defaults still apply for this page when storage is unavailable.
    }
  },
);

function applyCodeLineHighlights() {
  for (
    const figure of document.querySelectorAll<HTMLElement>(
      ".code-block[data-highlight-lines]",
    )
  ) {
    const code = figure.querySelector<HTMLElement>("pre code");
    if (!code) continue;
    const ranges: [number, number][] = (figure.dataset.highlightLines ?? "")
      .split(",")
      .map((part) => {
        const [start, end = start] = part.split("-").map(Number);
        return [start, end];
      });
    const lineHeight = Number.parseFloat(getComputedStyle(code).lineHeight) ||
      19.2;
    const lineCount = Math.max(
      1,
      code.textContent.replace(/\n$/, "").split("\n").length,
    );
    const stops = [];
    for (let index = 0; index < lineCount; index++) {
      const color = ranges.some(([start, end]) =>
          index + 1 >= start && index + 1 <= end
        )
        ? "color-mix(in srgb, #FFD54F 28%, transparent)"
        : "transparent";
      stops.push(
        `${color} ${index * lineHeight}px`,
        `${color} ${(index + 1) * lineHeight}px`,
      );
    }
    code.style.backgroundImage = `linear-gradient(to bottom, ${
      stops.join(", ")
    })`;
    code.style.backgroundSize = `100% ${lineCount * lineHeight}px`;
    code.style.backgroundRepeat = "no-repeat";
  }
}

// Arborium may finish replacing the code contents after highlightAll returns.
// Reapply the marker when its line spans are inserted or replaced.
new MutationObserver(applyCodeLineHighlights).observe(document.body, {
  childList: true,
  subtree: true,
});

const systemTheme = matchMedia("(prefers-color-scheme: dark)");
systemTheme.addEventListener(
  "change",
  (e) => setTheme(e.matches ? "dark" : "light"),
);
setTheme(systemTheme.matches ? "dark" : "light");

// :active is not guaranteed to repaint before a link navigates. Load the
// cursor up front and own the pressed state for the whole pointer gesture.
const currentScript = document.currentScript;
const assetBase = new URL(
  ".",
  currentScript instanceof HTMLScriptElement
    ? currentScript.src
    : location.href,
);
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
const lightboxImg = lightbox.querySelector<HTMLImageElement>("img")!;
const lightboxCaption = lightbox.querySelector<HTMLElement>(
  ".lightbox-caption",
)!;
document.body.appendChild(lightbox);

function openLightbox(img: HTMLImageElement) {
  lightboxImg.src = img.currentSrc || img.src;
  lightboxImg.alt = img.alt;
  const caption = img.closest("figure")?.querySelector("figcaption");
  lightboxCaption.textContent = caption?.textContent?.trim() ?? "";
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

  const copyButton = target.closest(".code-copy");
  if (copyButton) {
    const code = copyButton.closest(".code-block")?.querySelector("pre code");
    if (code) {
      navigator.clipboard.writeText(code.textContent ?? "").then(() => {
        copyButton.textContent = "Copied!";
        copyButton.setAttribute("aria-label", "Code copied");
        setTimeout(() => {
          copyButton.textContent = "Copy";
          copyButton.setAttribute("aria-label", "Copy code");
        }, 1500);
      });
    }
    return;
  }

  if (!lightbox.hidden) {
    closeLightbox();
    return;
  }
  const img = target.closest<HTMLImageElement>("img[data-kind='media']");
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
