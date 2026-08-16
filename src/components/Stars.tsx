import { IconStar } from "./Icons";

export function Stars({ value, count }: { value: number | null; count?: number }) {
  const v = value ?? 0;
  return (
    <span className="stars" aria-label={`${v} stars`}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span key={i} style={{ opacity: fill > 0.25 ? 1 : 0.25 }}>
            <IconStar />
          </span>
        );
      })}
      {value != null && <b style={{ color: "#fff", marginLeft: 6 }}>{value.toFixed(1)}</b>}
      {count != null && <span className="muted" style={{ marginLeft: 6 }}>({count})</span>}
    </span>
  );
}
