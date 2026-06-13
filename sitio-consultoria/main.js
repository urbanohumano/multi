/* Guía de campo Nº 01 — interacciones discretas.
   Todo es progresivo: sin JS, el sitio sigue siendo legible y navegable. */

(function () {
  "use strict";

  /* ---------- Navegación móvil ---------- */
  const toggle = document.querySelector(".nav__toggle");
  const menu = document.getElementById("nav-menu");

  if (toggle && menu) {
    const setOpen = (open) => {
      toggle.setAttribute("aria-expanded", String(open));
      menu.classList.toggle("is-open", open);
    };

    toggle.addEventListener("click", () => {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });

    // Cerrar al elegir un destino o con Escape
    menu.addEventListener("click", (e) => {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });
  }

  /* ---------- Año dinámico (en cifras romanas para el colofón) ---------- */
  const toRoman = (n) => {
    const map = [[1000,"M"],[900,"CM"],[500,"D"],[400,"CD"],[100,"C"],
      [90,"XC"],[50,"L"],[40,"XL"],[10,"X"],[9,"IX"],[5,"V"],[4,"IV"],[1,"I"]];
    let out = "";
    for (const [v, s] of map) { while (n >= v) { out += s; n -= v; } }
    return out;
  };
  const year = new Date().getFullYear();
  document.querySelectorAll("[data-issue-year]").forEach((el) => {
    el.textContent = toRoman(year);
  });

  /* ---------- Revelado al hacer scroll ---------- */
  const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const targets = document.querySelectorAll(
    ".section__head, .service, .case, .step, .plate, .hero__text > *, .quote__text, .about__portrait, .about__text, .contact > *"
  );

  if (prefersReduced || !("IntersectionObserver" in window)) {
    // Sin animación: visible de inmediato.
    targets.forEach((el) => el.classList.add("is-in"));
  } else {
    targets.forEach((el) => el.classList.add("reveal"));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          // Pequeño escalonado por grupo para un ritmo editorial.
          const delay = Math.min(i % 4, 3) * 60;
          entry.target.style.transitionDelay = delay + "ms";
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });

    targets.forEach((el) => io.observe(el));
  }
})();
