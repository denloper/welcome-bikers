function Star({ fill, i }: { fill: number; i: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, fill)) * 100);
  const id = `starfill-${i}-${pct}`;
  return (
    <span className="star-unit">
      <svg viewBox="0 0 24 24">
        <defs>
          <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
            <stop offset={`${pct}%`} stopColor="currentColor" />
            <stop offset={`${pct}%`} stopColor="transparent" />
          </linearGradient>
        </defs>
        <path
          fill={`url(#${id})`}
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          d="m12 3.2 2.35 5.7 6.2.54-4.7 4.08 1.45 6.05L12 16.7 6.7 19.57l1.45-6.05-4.7-4.08 6.2-.54z"
        />
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
        <Star key={i} i={i} fill={v - i} />
      ))}
      {count != null && <span className="muted">({count})</span>}
    </span>
  );
}
