(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(pointer: fine)");
  const motionAllowed = !reducedMotion.matches;
  const sceneColors = {
    signal: "var(--signal)",
    flow: "var(--signal)",
    capability: "var(--signal)",
    work: "var(--signal)",
    lab: "var(--cyan)",
    timeline: "var(--cyan)",
    contact: "var(--orange)",
  };
  const stageColors = {
    peaksys: "var(--signal)",
    hellowork: "var(--cyan)",
    royalcanin: "var(--orange)",
  };
  const revealSelector = [
    ".concept-section > .scene-number",
    ".services-heading",
    ".services-grid > article",
    ".service-process",
    ".manifesto-grid > *",
    ".flow-map",
    ".capability-core",
    ".capability-nodes > button",
    ".work-scene",
    ".lab-heading",
    ".lab-grid > *",
    ".timeline-pulse > h2",
    ".timeline-pulse li",
    ".final-signal h2",
    ".final-grid > *",
  ].join(",");
  const maxStagger = 5;

  if (finePointer.matches && motionAllowed) {
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

  if (motionAllowed && "IntersectionObserver" in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry, order) => {
            entry.target.style.setProperty("--i", Math.min(order, maxStagger));
            entry.target.classList.add("is-revealed");
            revealObserver.unobserve(entry.target);
          });
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll(revealSelector).forEach((element) => {
      element.classList.add("will-reveal");
      revealObserver.observe(element);
    });
  }

  const sections = [...document.querySelectorAll("[data-scene]")];
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const scene = visible.target.dataset.scene;
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
  const stageObserver = new IntersectionObserver(
    (entries) => {
      const active = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!active) return;
      const key = active.target.dataset.stage;
      const index = workScenes.indexOf(active.target);
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
      active.target
        .closest(".project-stage")
        ?.style.setProperty("--scene", color);
      meter?.style.setProperty(
        "--stage-progress",
        String((index + 1) / workScenes.length),
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
