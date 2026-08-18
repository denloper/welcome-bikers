import { useId } from "react";

const STAR =
  "M12 3.1 14.7 9.4 21.5 10.1 16.4 14.7 18 21.5 12 18.1 6 21.5 7.6 14.7 2.5 10.1 9.3 9.4 Z";

function Star({ fill }: { fill: number }) {
  const t = Math.max(0, Math.min(1, fill));
  const clip = useId().replace(/:/g, "");
  return (
    <span className="star-unit">
      <svg viewBox="0 0 24 24">
        <path
          d={STAR}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <defs>
          <clipPath id={clip}>
            <rect x="0" y="0" width={24 * t} height="24" />
          </clipPath>
        </defs>
        {t > 0 && (
          <path
            d={STAR}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
            clipPath={`url(#${clip})`}
          />
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
