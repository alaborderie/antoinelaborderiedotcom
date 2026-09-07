(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");
  const orbitSystem = document.querySelector("[data-orbit-system]");
  const orbitLinks = [...document.querySelectorAll("[data-orbit-link]")];
  const dossierLinks = [...document.querySelectorAll("[data-dossier-link]")];
  const dossiers = [...document.querySelectorAll("[data-dossier]")];
  const capabilityButtons = [
    ...document.querySelectorAll("[data-space-capability]"),
  ];
  const relatedItems = [
    ...document.querySelectorAll("[data-space-capabilities]"),
  ];
  const sceneColors = {
    arrival: "#9b7bff",
    signal: "#78ddff",
    orbit: "#9b7bff",
    dossiers: "#9b7bff",
    satellites: "#78ddff",
    contact: "#ffbd66",
  };
  const projectColors = {
    peaksys: "#9b7bff",
    hellowork: "#78ddff",
    royalcanin: "#ffbd66",
  };
  let pointerFrame;

  if (finePointer.matches && !reducedMotion.matches) {
    document.body.classList.add("has-space-pointer");
    window.addEventListener(
      "pointermove",
      (event) => {
        if (pointerFrame) return;
        pointerFrame = requestAnimationFrame(() => {
          root.style.setProperty("--space-x", `${event.clientX}px`);
          root.style.setProperty("--space-y", `${event.clientY}px`);
          root.style.setProperty(
            "--tilt-x",
            `${(event.clientX / innerWidth - 0.5) * 5}deg`,
          );
          root.style.setProperty(
            "--tilt-y",
            `${(0.5 - event.clientY / innerHeight) * 5}deg`,
          );
          pointerFrame = undefined;
        });
      },
      { passive: true },
    );
  }

  const selectProject = (key, travel = false) => {
    const color = projectColors[key] ?? projectColors.peaksys;
    root.style.setProperty("--active", color);
    orbitLinks.forEach((link) => {
      const selected = link.dataset.orbitLink === key;
      if (selected) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
      document
        .querySelector(`[data-path="${link.dataset.orbitLink}"]`)
        ?.classList.toggle("is-active", selected);
    });
    dossierLinks.forEach((link) => {
      if (link.dataset.dossierLink === key)
        link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    });
    if (travel && orbitSystem && !reducedMotion.matches) {
      orbitSystem.style.setProperty(
        "--camera-x",
        key === "hellowork" ? "2rem" : key === "peaksys" ? "-2rem" : "0",
      );
      orbitSystem.style.setProperty(
        "--camera-y",
        key === "royalcanin" ? "-1.5rem" : "0",
      );
      orbitSystem.classList.remove("is-travelling");
      requestAnimationFrame(() => orbitSystem.classList.add("is-travelling"));
    }
  };

  orbitLinks.forEach((link) =>
    link.addEventListener("click", () =>
      selectProject(link.dataset.orbitLink, true),
    ),
  );
  selectProject("peaksys");

  const dossierObserver = new IntersectionObserver(
    (entries) => {
      const active = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (active) selectProject(active.target.dataset.dossier);
    },
    { rootMargin: "-20% 0px -50%", threshold: [0, 0.2, 0.5] },
  );
  dossiers.forEach((dossier) => dossierObserver.observe(dossier));

  const sceneObserver = new IntersectionObserver(
    (entries) => {
      const active = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (active && !active.target.closest(".dossier-section")) {
        root.style.setProperty(
          "--active",
          sceneColors[active.target.dataset.spaceScene] ?? sceneColors.arrival,
        );
      }
    },
    { rootMargin: "-35% 0px -45%", threshold: [0, 0.25] },
  );
  document
    .querySelectorAll("[data-space-scene]")
    .forEach((scene) => sceneObserver.observe(scene));

  capabilityButtons.forEach((button) =>
    button.addEventListener("click", () => {
      const capability = button.dataset.spaceCapability;
      const activate = button.getAttribute("aria-pressed") !== "true";
      capabilityButtons.forEach((candidate) =>
        candidate.setAttribute(
          "aria-pressed",
          String(activate && candidate === button),
        ),
      );
      relatedItems.forEach((item) => {
        const related =
          activate &&
          item.dataset.spaceCapabilities.split(" ").includes(capability);
        item.classList.toggle("is-related", related);
      });
    }),
  );
})();
