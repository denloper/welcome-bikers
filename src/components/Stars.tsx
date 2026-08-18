import { IconStar } from "./Icons";

export function Stars({ value, count }: { value: number | null; count?: number }) {
  const v = value ?? 0;
  return (
    <span className="stars" aria-label={`${v} stars`}>
      {value != null && <b className="stars-n">{value.toFixed(1).replace(".", ",")}</b>}
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, v - i));
        return (
          <span key={i} className={fill > 0.35 ? "on" : "off"}>
            <IconStar />
          </span>
        );
      })}
      {count != null && <span className="muted">({count})</span>}
    </span>
  );
}
