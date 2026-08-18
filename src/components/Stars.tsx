import { useId } from "react";

/** Chubby 5-point star; round stroke makes the tips like the original app. */
const STAR =
  "M12 3.4 14.35 9.1 20.6 9.7 15.85 13.9 17.3 20.2 12 16.85 6.7 20.2 8.15 13.9 3.4 9.7 9.65 9.1 Z";

function Star({ fill }: { fill: number }) {
  const t = Math.max(0, Math.min(1, fill));
  const clip = useId().replace(/:/g, "");
  return (
    <span className="star-unit">
      <svg viewBox="0 0 24 24" overflow="visible">
        <path
          d={STAR}
          fill="none"
          stroke="currentColor"
          strokeWidth="3.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <defs>
          <clipPath id={clip}>
            <rect x="-2" y="-2" width={4 + 24 * t} height="28" />
          </clipPath>
        </defs>
        {t > 0 && (
          <g clipPath={`url(#${clip})`}>
            <path
              d={STAR}
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="3.2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
        )}
      </svg>
    </span>
  );
}

export function Stars({ value, count }: { value: number | null; count?: number }) {
  const v = value ?? 0;
  return (
    <span className="stars" aria-label={`${v} stars`}>
      {value != null && <b className="stars-n">{value.toFixed(1).replace(".", ",")}</b>}
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} fill={v - i} />
      ))}
      {count != null && <span className="muted">({count})</span>}
    </span>
  );
}
