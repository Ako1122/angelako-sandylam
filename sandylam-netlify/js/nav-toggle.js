(function () {
  function init() {
    var toggle = document.getElementById("menuToggle");
    var nav = document.getElementById("siteNav");
    if (!toggle || !nav) return;

    function closeNav() {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
    function openNav() {
      nav.classList.add("open");
      toggle.setAttribute("aria-expanded", "true");
    }

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      if (nav.classList.contains("open")) {
        closeNav();
      } else {
        openNav();
      }
    });

    nav.addEventListener("click", function (e) {
      if (e.target.classList.contains("nav-link")) closeNav();
    });

    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target) && !toggle.contains(e.target)) closeNav();
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 760) closeNav();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
