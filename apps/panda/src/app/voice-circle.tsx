"use client";
import { useEffect, useRef } from "react";
import type { Phase } from "./use-companion";
import styles from "./panda.module.css";

/** The shape follows analysed playback/input; quiet states only breathe gently. */
export function VoiceCircle({
  phase,
  readLevels,
}: {
  phase: Phase | "idle";
  readLevels: () => Float32Array;
}) {
  const shape = useRef<SVGPathElement>(null),
    halo = useRef<SVGCircleElement>(null);
  const latest = useRef({ phase, readLevels });
  latest.current = { phase, readLevels };
  useEffect(() => {
    let frame = 0;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    function draw(time: number) {
      const { phase, readLevels } = latest.current;
      const listening = phase === "listening",
        speaking = phase === "speaking";
      const levels = reduced ? new Float32Array(48) : readLevels();
      let energy = 0;
      for (const value of levels) energy += value;
      energy /= levels.length || 1;
      const points = Array.from({ length: 96 }, (_, i) => {
        const angle = (i / 96) * Math.PI * 2;
        const sample = levels[Math.floor(i / 2)] || 0;
        const breath = reduced ? 0 : Math.sin(time / 1700) * 1.5;
        const radius =
          66 +
          breath +
          (speaking || listening ? energy * 12 + sample * 14 : 0) +
          Math.sin(angle * 3 + (reduced ? 0 : time / 2200)) * 3;
        return `${(120 + Math.cos(angle) * radius).toFixed(2)},${(120 + Math.sin(angle) * radius).toFixed(2)}`;
      });
      shape.current?.setAttribute("d", "M" + points.join(" L") + " Z");
      halo.current?.setAttribute("r", String(90 + energy * 7));
      if (!reduced) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <span className={styles.voiceCircle} data-phase={phase} aria-hidden="true">
      <svg viewBox="0 0 240 240" fill="none">
        <circle
          cx="120"
          cy="120"
          r="105"
          stroke="currentColor"
          strokeOpacity=".09"
          strokeDasharray="1 7"
          strokeLinecap="round"
        />
        <circle
          ref={halo}
          cx="120"
          cy="120"
          r="90"
          stroke="currentColor"
          strokeOpacity=".22"
          strokeWidth=".75"
        />
        <path
          ref={shape}
          d="M186,120 A66,66 0 1,1 54,120 A66,66 0 1,1 186,120Z"
          fill="currentColor"
          fillOpacity=".13"
          stroke="currentColor"
          strokeOpacity=".5"
          strokeWidth=".8"
        />
        <path
          className={styles.voiceSpark}
          d="M83 121c22 0 18-24 25-24s5 47 13 47 4-58 12-58 3 35 24 35c-21 0-16 14-23 14s-5-12-12-12-7 9-13 9-8-11-26-11Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}
