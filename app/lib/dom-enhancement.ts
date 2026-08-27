export type DomEnhancementOptions = {
  observer?: MutationObserverInit | false;
  shouldSchedule?: (mutations: MutationRecord[]) => boolean;
  runImmediately?: boolean;
};

export type DomEnhancementController = {
  schedule: () => void;
  stop: () => void;
};

/**
 * Runs a DOM enhancement immediately and then re-runs it at most once per
 * animation frame when relevant mutations occur. This is the compatibility
 * mechanism used by the small DOM adapters that sit on top of the React UI.
 *
 * New product behaviour should live in the owning React component. Use this
 * helper only for compatibility/enhancement code that genuinely needs to
 * observe DOM produced elsewhere.
 */
export function startDomEnhancement(
  enhance: () => void,
  options: DomEnhancementOptions = {},
): DomEnhancementController {
  let frame = 0;
  let stopped = false;

  const run = () => {
    frame = 0;
    if (!stopped) enhance();
  };

  const schedule = () => {
    if (stopped || frame) return;
    frame = window.requestAnimationFrame(run);
  };

  if (options.runImmediately !== false) enhance();

  let observer: MutationObserver | null = null;
  if (options.observer !== false) {
    observer = new MutationObserver(mutations => {
      if (!options.shouldSchedule || options.shouldSchedule(mutations)) schedule();
    });
    observer.observe(
      document.body,
      options.observer || { childList: true, subtree: true },
    );
  }

  return {
    schedule,
    stop: () => {
      stopped = true;
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
