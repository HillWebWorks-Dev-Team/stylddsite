/**
 * Home hero: mobile burger toggles nav panel (links + Book / Lookup).
 */
(function () {
  var toggle = document.getElementById("hero-nav-toggle");
  var panel = document.getElementById("hero-nav-panel");
  var nav = document.querySelector(".hero-nav");
  if (!toggle || !panel || !nav) return;

  var mq = window.matchMedia("(max-width: 767px)");

  function setOpen(open) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    panel.classList.toggle("hero-nav__panel--open", open);
    document.body.classList.toggle("hero-nav-open", open && mq.matches);
  }

  function closeIfDesktop() {
    if (!mq.matches) {
      setOpen(false);
      document.body.classList.remove("hero-nav-open");
    }
  }

  toggle.addEventListener("click", function (e) {
    e.stopPropagation();
    if (!mq.matches) return;
    var open = toggle.getAttribute("aria-expanded") === "true";
    setOpen(!open);
  });

  panel.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      setOpen(false);
    });
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") setOpen(false);
  });

  document.addEventListener("click", function (e) {
    if (!mq.matches || toggle.getAttribute("aria-expanded") !== "true") return;
    if (!nav.contains(e.target)) setOpen(false);
  });

  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", closeIfDesktop);
  } else if (typeof mq.addListener === "function") {
    mq.addListener(closeIfDesktop);
  }
})();
