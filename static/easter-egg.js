// Shooting-star easter egg. Now and then a small star crosses the home page;
// it is a real button that leads to /surprise. No tracking, no dependency.
(() => {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const french = document.documentElement.lang === "fr";
  // Seconds before the first star, then between stars.
  const FIRST_DELAY = [20, 60];
  const COOLDOWN = [90, 240];
  const FLIGHT_MS = 4500;
  // With reduced motion the star does not fly; it stays still this long.
  const STILL_MS = 20000;

  const star = document.createElement("button");
  star.type = "button";
  star.className = "ee-star";
  star.hidden = true;
  star.setAttribute(
    "aria-label",
    french
      ? "Étoile filante : une surprise vous attend"
      : "Shooting star: a surprise awaits",
  );
  star.innerHTML =
    '<span class="ee-star-tail" aria-hidden="true"></span>' +
    '<span class="ee-star-head" aria-hidden="true"></span>';
  star.style.setProperty("--ee-duration", `${FLIGHT_MS}ms`);
  document.body.append(star);

  let expired = false;

  const randomMs = ([min, max]) => (min + Math.random() * (max - min)) * 1000;
  const schedule = (range) => window.setTimeout(show, randomMs(range));

  function show() {
    // Never fly in a background tab; try again later.
    if (document.hidden) return schedule(COOLDOWN);
    expired = false;
    const still = reducedMotion.matches;
    window.setTimeout(expire, still ? STILL_MS : FLIGHT_MS);
    if (!still) {
      // Cross the upper band from the right, down and left. The path stays
      // inside the viewport, so wherever the star is paused (focus, hover) it
      // is on screen.
      const width = window.innerWidth;
      const height = window.innerHeight;
      const x0 = width - 40;
      const y0 = height * (0.12 + Math.random() * 0.22);
      const dx = -(x0 - 32) * (0.6 + Math.random() * 0.35);
      const dy = Math.min(
        -dx * (0.25 + Math.random() * 0.15),
        height * 0.8 - y0,
      );
      // The tail points back along the path.
      const angle = (Math.atan2(-dy, -dx) * 180) / Math.PI;
      star.style.setProperty("--ee-x0", `${x0}px`);
      star.style.setProperty("--ee-y0", `${y0}px`);
      star.style.setProperty("--ee-x1", `${x0 + dx}px`);
      star.style.setProperty("--ee-y1", `${y0 + dy}px`);
      star.style.setProperty("--ee-tail-angle", `${angle}deg`);
    }
    // Leaving display: none restarts the CSS flight.
    star.hidden = false;
  }

  // Time is up, but a star that is focused or hovered waits for the visitor.
  function expire() {
    expired = true;
    if (document.activeElement === star || star.matches(":hover")) return;
    star.hidden = true;
    schedule(COOLDOWN);
  }
  const expireIfDue = () => {
    if (expired && !star.hidden) expire();
  };

  star.addEventListener("blur", expireIfDue);
  star.addEventListener("mouseleave", expireIfDue);
  // A native button: Enter, Space, click and tap all land here.
  star.addEventListener("click", () => {
    window.location.assign("/surprise");
  });

  schedule(FIRST_DELAY);
})();
