import React, { useEffect, useRef, useState } from "react";
import Logo from "./Logo";

const BOOT_LINES = [
  { at: 250, text: "loading EBCH(64,48) error-correcting codec", status: "ok" },
  { at: 700, text: "arming tiled STDM watermark engine", status: "ok" },
  { at: 1150, text: "calibrating 16×16 spatial x-ray grid", status: "ok" },
  { at: 1550, text: "linking Ed25519 + Schnorr NIZK layer", status: "ok" },
  { at: 1950, text: "provenance registry online", status: "ready" },
];

export default function BootScreen({ onDone }) {
  const [visibleLines, setVisibleLines] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const finishedRef = useRef(false);
  const timers = useRef([]);

  const finish = (delay = 0) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const start = () => {
      setVisibleLines(BOOT_LINES.length);
      setLeaving(true);
      setTimeout(onDone, 560);
    };
    if (delay > 0) {
      setTimeout(start, delay);
    } else {
      start();
    }
  };

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      const t = setTimeout(() => finish(0), 400);
      return () => clearTimeout(t);
    }

    BOOT_LINES.forEach((line, index) => {
      timers.current.push(
        setTimeout(() => setVisibleLines((n) => Math.max(n, index + 1)), line.at)
      );
    });

    const end = setTimeout(() => finish(0), 2850);
    timers.current.push(end);

    return () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      clearTimeout(end);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`boot-screen ${leaving ? "is-leaving" : ""}`}
      onClick={() => finish(0)}
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") finish(0);
      }}
      role="button"
      tabIndex={0}
      aria-label="Skip intro animation"
    >
      <div className="absolute inset-0 bg-grid opacity-40" />
      <div className="absolute inset-0 bg-aurora" />
      <div className="boot-glow" />

      <div className="relative z-10 flex flex-col items-center px-6">
        <div className="boot-logo">
          <div className="boot-halo" />
          <div className="boot-era" />
          <div className="boot-era delay" />
          <Logo size={148} animated />
          <div className="boot-sweep" />
        </div>

        <h1 className="boot-word mt-7">VERITASNAP</h1>
        <p className="boot-sub">PROOF THAT SURVIVES THE SCREENSHOT</p>

        <div className="boot-bar">
          <span />
        </div>

        <div className="boot-log">
          {BOOT_LINES.slice(0, visibleLines).map((line) => (
            <div className="boot-log-line" key={line.text}>
              <span className={line.status === "ready" ? "text-emerald-400" : "text-slate-600"}>
                {line.status === "ready" ? "◆" : "›"}
              </span>
              <span className={line.status === "ready" ? "text-emerald-300/90" : ""}>
                {line.text}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="boot-skip">CLICK TO SKIP</div>
    </div>
  );
}
