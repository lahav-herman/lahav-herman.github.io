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
});
