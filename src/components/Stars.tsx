import { useId } from "react";

/** Short-point star; thick round stroke + slight blur matches the original app. */
const STAR =
  "M12 3.6 14.12 8.9 19.9 9.42 15.7 13.18 16.92 18.9 12 16.05 7.08 18.9 8.3 13.18 4.1 9.42 9.88 8.9 Z";

function Star({ fill }: { fill: number }) {
  const t = Math.max(0, Math.min(1, fill));
  const uid = useId().replace(/:/g, "");
  const clip = `${uid}-c`;
  const round = `${uid}-r`;
  return (
    <span className="star-unit">
      <svg viewBox="0 0 24 24" overflow="visible">
        <defs>
          <filter id={round} x="-35%" y="-35%" width="170%" height="170%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.85" result="b" />
            <feColorMatrix
              in="b"
              type="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -8"
            />
          </filter>
          <clipPath id={clip}>
            <rect x="-4" y="-4" width={8 + 24 * t} height="32" />
          </clipPath>
        </defs>
        <g filter={`url(#${round})`}>
          <path
            d={STAR}
            fill="none"
            stroke="currentColor"
            strokeWidth="4.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {t > 0 && (
            <g clipPath={`url(#${clip})`}>
              <path
                d={STAR}
                fill="currentColor"
                stroke="currentColor"
                strokeWidth="4.4"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          )}
        </g>
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
