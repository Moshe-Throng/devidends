"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "devidends_tour_seen_v1";

type Step = {
  selector: string;
  title: string;
  body: string;
  align?: "above" | "below" | "center";
};

const STEPS: Step[] = [
  {
    selector: "[data-tour='welcome']",
    title: "Welcome to Devidends",
    body: "30-second tour. You can skip anytime.",
    align: "center",
  },
  {
    selector: "[data-tour='opportunities']",
    title: "Today's opportunities",
    body: "Filtered to your sectors and experience level. New ones land daily at 5 AM.",
    align: "below",
  },
  {
    selector: "[data-tour='cv']",
    title: "Your CV — donor-ready",
    body: "Build, edit, score, and download in 6 standard donor formats. Updates sync everywhere.",
    align: "below",
  },
  {
    selector: "[data-tour='score']",
    title: "Score your CV",
    body: "Against donor standards or a specific job. Personalized fit report in 30 seconds.",
    align: "below",
  },
  {
    selector: "[data-tour='alerts']",
    title: "Daily briefs",
    body: "Adjust which sectors to follow and which channel (Telegram or email) anytime.",
    align: "above",
  },
];

interface Props {
  /** Force the tour to run regardless of localStorage. Useful for ?tour=1. */
  force?: boolean;
}

export function MiniAppTour({ force = false }: Props) {
  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Decide whether to start the tour
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (force || !localStorage.getItem(STORAGE_KEY)) {
      // Wait one frame so target elements are mounted
      const t = setTimeout(() => setActive(true), 400);
      return () => clearTimeout(t);
    }
  }, [force]);

  // Update rect for the current step
  useEffect(() => {
    if (!active) return;
    const step = STEPS[stepIdx];
    if (!step) return;
    function update() {
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Slight delay so the scroll lands before measurement
        setTimeout(() => {
          const r = el.getBoundingClientRect();
          setRect(r);
        }, 350);
      } else {
        setRect(null);
      }
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [active, stepIdx]);

  function next() {
    if (stepIdx < STEPS.length - 1) setStepIdx(stepIdx + 1);
    else end();
  }
  function back() { if (stepIdx > 0) setStepIdx(stepIdx - 1); }
  function end() {
    localStorage.setItem(STORAGE_KEY, "1");
    setActive(false);
  }

  if (!active) return null;
  const step = STEPS[stepIdx];
  const total = STEPS.length;
  const isCenter = step.align === "center" || !rect;

  // Compute popover position
  let popStyle: React.CSSProperties = {};
  if (isCenter) {
    popStyle = { top: "50%", left: "50%", transform: "translate(-50%,-50%)" };
  } else if (rect) {
    const align = step.align === "above" ? "above" : "below";
    if (align === "below") {
      popStyle = { top: rect.bottom + 12, left: 12, right: 12 };
    } else {
      popStyle = { bottom: window.innerHeight - rect.top + 12, left: 12, right: 12 };
    }
  }

  return (
    <>
      {/* Dim overlay with cutout for the highlighted element */}
      <div
        className="fixed inset-0 z-[9990] pointer-events-auto"
        style={{
          background: "rgba(15, 17, 23, 0.72)",
          // Cutout via inset clip if we have a rect
          clipPath: rect && !isCenter
            ? `polygon(
                0 0, 100% 0, 100% 100%, 0 100%, 0 0,
                ${rect.left - 6}px ${rect.top - 6}px,
                ${rect.left - 6}px ${rect.bottom + 6}px,
                ${rect.right + 6}px ${rect.bottom + 6}px,
                ${rect.right + 6}px ${rect.top - 6}px,
                ${rect.left - 6}px ${rect.top - 6}px
              )`
            : undefined,
          transition: "clip-path 250ms ease",
        }}
        onClick={end}
      />

      {/* Highlighted element ring (subtle outline) */}
      {rect && !isCenter && (
        <div
          className="fixed z-[9991] pointer-events-none rounded-2xl"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            boxShadow: "0 0 0 2px rgb(39, 171, 210), 0 0 0 8px rgba(39, 171, 210, 0.15)",
            transition: "all 250ms ease",
          }}
        />
      )}

      {/* Popover */}
      <div
        ref={popoverRef}
        className="fixed z-[9992] bg-white rounded-2xl shadow-2xl shadow-dark-900/30 p-5 max-w-sm mx-auto animate-fadeInUp"
        style={popStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-bold tracking-wider uppercase text-cyan-600">
            Step {stepIdx + 1} of {total}
          </span>
          <button
            onClick={end}
            className="text-[11px] text-dark-400 hover:text-dark-700"
          >
            Skip tour
          </button>
        </div>
        <h3 className="text-base font-bold text-dark-900 mb-1.5">{step.title}</h3>
        <p className="text-sm text-dark-500 leading-relaxed mb-4">{step.body}</p>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-4">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all ${
                i === stepIdx ? "w-6 bg-cyan-500" : "w-1.5 bg-dark-100"
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {stepIdx > 0 && (
            <button
              onClick={back}
              className="px-4 py-2 text-sm font-semibold text-dark-500 rounded-lg hover:bg-dark-50"
            >
              Back
            </button>
          )}
          <button
            onClick={next}
            className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-sm font-bold active:scale-[0.98] transition-transform"
          >
            {stepIdx === STEPS.length - 1 ? "Got it →" : "Next →"}
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(8px) ${isCenter ? "translate(-50%, -50%)" : ""}; }
          to { opacity: 1; transform: translateY(0) ${isCenter ? "translate(-50%, -50%)" : ""}; }
        }
        .animate-fadeInUp { animation: fadeInUp 250ms ease-out; }
      `}</style>
    </>
  );
}
