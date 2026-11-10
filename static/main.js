(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");
  const sceneColors = {
    signal: "#b9ff4a",
    flow: "#b9ff4a",
    capability: "#b9ff4a",
    work: "#b9ff4a",
    lab: "#4de4ff",
    timeline: "#4de4ff",
    contact: "#ff8c5a",
  };
  const stageColors = {
    peaksys: "#b9ff4a",
    hellowork: "#4de4ff",
    royalcanin: "#ff8c5a",
  };

  if (finePointer.matches && !reducedMotion.matches) {
    document.body.classList.add("has-pointer");
    let rafPending = false;
    window.addEventListener(
      "pointermove",
      (event) => {
        if (rafPending) return;
        rafPending = true;
        requestAnimationFrame(() => {
          root.style.setProperty("--pointer-x", `${event.clientX}px`);
          root.style.setProperty("--pointer-y", `${event.clientY}px`);
          rafPending = false;
        });
      },
      { passive: true },
    );
  }

  const sections = [...document.querySelectorAll("[data-scene]")];
  const sectionsInBand = new Set();
  let activeSection;
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) sectionsInBand.add(entry.target);
        else sectionsInBand.delete(entry.target);
      });
      if (!sectionsInBand.has(activeSection)) {
        activeSection = sections.find((section) => sectionsInBand.has(section));
      }
      if (!activeSection) return;
      const scene = activeSection.dataset.scene;
      document.body.dataset.activeScene = scene;
      root.style.setProperty(
        "--scene",
        sceneColors[scene] ?? sceneColors.signal,
      );
    },
    { rootMargin: "-30% 0px -45%", threshold: [0, 0.25, 0.5] },
  );
  sections.forEach((section) => sectionObserver.observe(section));

  const workScenes = [...document.querySelectorAll("[data-stage]")];
  const stageLinks = [...document.querySelectorAll("[data-stage-link]")];
  const meter = document.querySelector(".stage-meter i");
  const stagesInBand = new Set();
  let activeStage;
  const stageObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) stagesInBand.add(entry.target);
        else stagesInBand.delete(entry.target);
      });
      if (!stagesInBand.has(activeStage)) {
        activeStage = workScenes.find((scene) => stagesInBand.has(scene));
      }
      if (!activeStage) return;
      const key = activeStage.dataset.stage;
      const index = workScenes.indexOf(activeStage);
      stageLinks.forEach((link) => {
        const isActive = link.dataset.stageLink === key;
        link.classList.toggle("is-active", isActive);
        if (isActive) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });
      const color = stageColors[key] ?? sceneColors.signal;
      root.style.setProperty("--scene", color);
      activeStage
        .closest(".project-stage")
        ?.style.setProperty("--scene", color);
      meter?.style.setProperty(
        "--stage-progress",
        `${((index + 1) / workScenes.length) * 100}%`,
      );
    },
    { rootMargin: "-18% 0px -45%", threshold: [0, 0.2, 0.5] },
  );
  workScenes.forEach((scene) => stageObserver.observe(scene));

  const capabilityButtons = [...document.querySelectorAll("[data-capability]")];
  const relatedItems = [...document.querySelectorAll("[data-capabilities]")];
  capabilityButtons.forEach((button) =>
    button.addEventListener("click", () => {
      const capability = button.dataset.capability;
      const willActivate = button.getAttribute("aria-pressed") !== "true";
      capabilityButtons.forEach((candidate) =>
        candidate.setAttribute(
          "aria-pressed",
          String(willActivate && candidate === button),
        ),
      );
      relatedItems.forEach((item) => {
        const isRelated =
          willActivate &&
          item.dataset.capabilities.split(" ").includes(capability);
        item.classList.toggle("is-related", isRelated);
        item.classList.toggle("is-dimmed", willActivate && !isRelated);
      });
    }),
  );
})();
