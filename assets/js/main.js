// Shared site behavior: active-nav highlighting.
document.addEventListener("DOMContentLoaded", () => {
  const here = window.location.pathname.replace(/\/index\.html$/, "/");
  document.querySelectorAll(".nav-links a").forEach((link) => {
    const target = new URL(link.href, window.location.href).pathname.replace(/\/index\.html$/, "/");
    if (target === here) {
      link.classList.add("active");
    }
  });

  // Hero mark: each hover of the back word's exposed corner toggles the swap,
  // and it stays in that state until the next hover (not just while hovering).
  // The hover target is a static zone (not the moving images themselves), so
  // the swap doesn't un-trigger itself mid-transition.
  const heroMark = document.querySelector(".hero-mark");
  const hitZone = document.querySelector(".mark-hit-zone");
  if (heroMark && hitZone) {
    hitZone.addEventListener("mouseenter", () => heroMark.classList.toggle("swapped"));
  }

  // Hero mark words: LAHAV (#LAHAV) and HERMAN (#HERMAN). Whichever one is in
  // front (LAHAV by default, HERMAN when swapped) is the "focused" word.
  // Clicking it zooms it up, large and centred, so it can be studied/read;
  // clicking anywhere or pressing Esc shrinks it back into place.
  const LAHAV = document.getElementById("LAHAV");
  const HERMAN = document.getElementById("HERMAN");
  if (heroMark && LAHAV && HERMAN) {
    const focused = () => (heroMark.classList.contains("swapped") ? HERMAN : LAHAV);

    const zoom = document.createElement("div");
    zoom.className = "mark-zoom";
    zoom.setAttribute("role", "dialog");
    zoom.setAttribute("aria-modal", "true");
    zoom.setAttribute("aria-hidden", "true");
    zoom.tabIndex = -1;
    const zoomImg = document.createElement("img");
    zoom.appendChild(zoomImg);
    document.body.appendChild(zoom);

    let source = null; // the hero word currently shown in the zoom view

    // Transform that makes the big zoomed image sit exactly over the small one.
    const shrinkTo = (el) => {
      const from = el.getBoundingClientRect();
      const to = zoomImg.getBoundingClientRect();
      return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})`;
    };

    const open = async (word) => {
      if (source) return;
      source = word;
      zoomImg.src = word.src;
      zoomImg.alt = word.alt;
      zoom.setAttribute("aria-label", word.alt);
      try { await zoomImg.decode(); } catch (e) { /* render anyway */ }
      zoomImg.style.transition = "none";
      zoomImg.style.transform = shrinkTo(word);
      word.style.visibility = "hidden";
      zoom.classList.add("open");
      zoom.setAttribute("aria-hidden", "false");
      void zoomImg.offsetWidth;
      zoomImg.style.transition = "";
      zoomImg.style.transform = "";
      zoom.focus();
    };

    const close = () => {
      if (!source || !zoom.classList.contains("open")) return;
      const word = source;
      zoomImg.style.transform = shrinkTo(word);
      zoom.classList.remove("open");
      zoom.setAttribute("aria-hidden", "true");
      const done = () => {
        word.style.visibility = "";
        zoomImg.style.transform = "";
        source = null;
      };
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) done();
      else zoomImg.addEventListener("transitionend", done, { once: true });
    };

    [LAHAV, HERMAN].forEach((word) => {
      word.addEventListener("click", () => {
        if (word === focused()) open(word);
      });
    });
    zoom.addEventListener("click", close);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }
});
