
const CODE_THEMES = {
  light: "ayu-light",
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

const headings = Array.from(document.querySelectorAll(".toc-entry"))
  .map((anchor) => ({
    anchor,
    li: anchor.closest("li"),
    target: document.getElementById(
      decodeURIComponent(anchor.getAttribute("href").slice(1))
    ),
  }))
  .filter((e) => e.target !== null && e.li !== null); 


function updateReading() {
  const midpoint = window.innerHeight / 2;
  let active = null;

  for (const entry of headings) {
    if (entry.target.getBoundingClientRect().top <= midpoint) {
      active = entry;
    } else {
      break;
    }
  }

  for (const entry of headings) {
    entry.li.classList.toggle("reading", entry === active);
  }
}

if (headings.length > 0) {
  const observer = new IntersectionObserver(updateReading, {
    rootMargin: "-50% 0px -50% 0px",
  });

  headings.forEach(({ target }) => observer.observe(target));
  window.addEventListener("scrollend", updateReading);
  updateReading();
}

function alignSidenotes() {
  const col = document.querySelector("aside.sidenotes");
  if (!col) return;

  const colTop = col.getBoundingClientRect().top + window.scrollY;
  const notes = col.querySelectorAll(".sidenote-body");

  // Pass 1: set position:absolute and natural top from call-out position
  const positions = [];
  document.querySelectorAll(".sidenote-number").forEach((label, i) => {
    const note = notes[i];
    if (!note) return;

    note.style.position = "absolute";
    note.style.top = "0px"; // temporary, just to get it into flow

    positions.push({
      note,
      natural: label.getBoundingClientRect().top + window.scrollY - colTop,
    });
  });

  // Pass 2: resolve collisions now that heights are known
  let floor = 0;
  for (const { note, natural } of positions) {
    const top = Math.max(natural, floor);
    note.style.top = `${top}px`;
    floor = top + note.offsetHeight + 12;
  }

  col.style.position = "relative";
  col.style.minHeight = `${floor}px`;
  col.style.visibility = "visible";
}

function alignSidenotes() {
  const col = document.querySelector("aside.sidenotes");
  if (!col) return;

  const notes = col.querySelectorAll(".sidenote-body");
  const labels = document.querySelectorAll(".sidenote-number");

  col.style.position = "relative";
  col.style.visibility = "visible";

  requestAnimationFrame(() => {
    const colTop = col.getBoundingClientRect().top + window.scrollY;

    const positions = Array.from(labels).map((label, i) => {
      const note = notes[i];
      if (!note) return null;

      note.style.position = "absolute";
      note.style.top = "0px";

      return {
        note,
        natural: label.getBoundingClientRect().top + window.scrollY - colTop,
      };
    }).filter(Boolean);

    requestAnimationFrame(() => {
      let floor = 0;

      for (const { note, natural } of positions) {
        const top = Math.max(natural, floor);
        note.style.top = `${top}px`;
        floor = top + note.offsetHeight + 12;
      }

      col.style.minHeight = `${floor}px`;
    });
  });
}
window.addEventListener("load", alignSidenotes);
window.addEventListener("resize", alignSidenotes);
