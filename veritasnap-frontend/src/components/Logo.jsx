import React, { useId } from "react";

const SHIELD =
  "M32 3.5 54.5 11.5 V29.5 C54.5 43.5 45.5 53.5 32 59.5 C18.5 53.5 9.5 43.5 9.5 29.5 V11.5 Z";

/**
 * VeritaSnap mark: a provenance shield, camera focus brackets,
 * a certificate hash rule and a verification check.
 * `animated` runs the one-time draw-on sequence used by the boot screen.
 */
export default function Logo({ size = 40, animated = false, className = "", title = "VeritaSnap" }) {
  const uid = useId().replace(/[:]/g, "");
  const g = `url(#${uid}-grad)`;

  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <defs>
        <linearGradient id={`${uid}-grad`} x1="8" y1="4" x2="52" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7dffd4" />
          <stop offset="0.5" stopColor="#38e1ff" />
          <stop offset="1" stopColor="#a894ff" />
        </linearGradient>
        <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.8" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <path
        d={SHIELD}
        fill={g}
        fillOpacity="0.1"
        className={animated ? "logo-fill" : undefined}
      />

      <path
        d={SHIELD}
        fill="none"
        stroke={g}
        strokeWidth="2.4"
        strokeLinejoin="round"
        className={animated ? "logo-draw" : undefined}
      />

      <g
        stroke="#9be9ff"
        strokeOpacity="0.45"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        className={animated ? "logo-brackets" : undefined}
      >
        <path d="M17 27.5 V21.5 H23" />
        <path d="M41 21.5 H47 V27.5" />
        <path d="M17 41.5 V47.5 H23" />
        <path d="M41 47.5 H47 V41.5" />
      </g>

      <g fill="#7dffd4" className={animated ? "logo-grid" : undefined} opacity={animated ? undefined : 0.42}>
        <rect x="24" y="44.6" width="7" height="1.4" rx="0.7" />
        <rect x="33" y="44.6" width="7" height="1.4" rx="0.7" />
        <rect x="29" y="47.4" width="7" height="1.4" rx="0.7" />
      </g>

      <path
        d="M23 32.5 L30.5 40 L42 26.5"
        fill="none"
        stroke={g}
        strokeWidth="4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter={`url(#${uid}-glow)`}
        className={animated ? "logo-check" : undefined}
      />
    </svg>
  );
}
