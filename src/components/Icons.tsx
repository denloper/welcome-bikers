import type { ReactNode } from "react";
import type { CategoryId } from "../types";
import { asset } from "../lib/assets";

type P = { className?: string };

export function IconHome({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />
    </svg>
  );
}
export function IconChat({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5V12a3.5 3.5 0 0 1-3.5 3.5H11l-4 3v-3H8.5A3.5 3.5 0 0 1 5 12z" />
    </svg>
  );
}
export function IconGlobe({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3z" />
    </svg>
  );
}
export function IconUser({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5 19.2c1.4-3 3.8-4.5 7-4.5s5.6 1.5 7 4.5" />
    </svg>
  );
}
export function IconBack({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}
export function IconShare({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="18" cy="5" r="2.4" />
      <circle cx="6" cy="12" r="2.4" />
      <circle cx="18" cy="19" r="2.4" />
      <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
    </svg>
  );
}
export function IconFilter({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="8" cy="6" r="2.1" fill="currentColor" />
      <circle cx="15" cy="12" r="2.1" fill="currentColor" />
      <circle cx="10" cy="18" r="2.1" fill="currentColor" />
    </svg>
  );
}
export function IconPhone({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M8 3.5h8A1.5 1.5 0 0 1 17.5 5v14A1.5 1.5 0 0 1 16 20.5H8A1.5 1.5 0 0 1 6.5 19V5A1.5 1.5 0 0 1 8 3.5z" />
      <path d="M10 18h4" />
    </svg>
  );
}
export function IconCal({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </svg>
  );
}
export function IconInfo({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 8h.01" />
    </svg>
  );
}
export function IconSun({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}
export function IconLocate({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    </svg>
  );
}

function strokeIco(d: string) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" width="22" height="22">
      <path d={d} />
    </svg>
  );
}

const AMENITY_ICON: Record<string, () => ReactNode> = {
  "Card payment": () =>
    strokeIco("M3.5 7.5h17v10h-17zM3.5 11h17M6 16h4"),
  "Wi-Fi": () =>
    strokeIco("M5 10.5c4-4 10-4 14 0M7.5 13c2.6-2.4 6.4-2.4 9 0M12 16.8h.01"),
  "Motorcycle Parking": () =>
    strokeIco("M6 6.5h12v12H6zM9.2 9v7M9.2 9h4.2c1.4 0 2.4 1 2.4 2.3S14.8 13.5 13.4 13.5H9.2"),
  Laundry: () =>
    strokeIco("M5 4.5h14v15H5zM8 7h.01M16 7h.01M12 14.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"),
  "Food & Beverages": () =>
    strokeIco("M8 4v8M6 4v5.5a2 2 0 0 0 4 0V4M16 4v16M14 4h4"),
  "Food & Beverages 24/7": () =>
    strokeIco("M8 4v8M6 4v5.5a2 2 0 0 0 4 0V4M16 4v16M14 4h4"),
  "Food 24/7": () =>
    strokeIco("M8 4v8M6 4v5.5a2 2 0 0 0 4 0V4M16 4v16M14 4h4"),
  "Motorcycle wash": () =>
    strokeIco("M5 16.5h4l2-5h5l3 5h0M7 16.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"),
  Sauna: () =>
    strokeIco("M6 18h12M8 18V9h8v9M10 7c0-1 .8-2 2-2s2 1 2 2"),
  Pool: () =>
    strokeIco("M5 17c1.5-1 3.5-1 5 0s3.5 1 5 0 3.5-1 5 0M8 8v9M8 8h6v3"),
  "Bikers friendly": () =>
    strokeIco("M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"),
  "Eco village": () =>
    strokeIco("M4 20V10l8-6 8 6v10H4z"),
};

export function AmenityIcon({ name }: { name: string }) {
  const fn = AMENITY_ICON[name];
  return fn ? fn() : strokeIco("M12 4v16M4 12h16");
}
export function IconSearch({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}
export function IconPin({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
    </svg>
  );
}
export function IconStar({ className }: P) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="m12 3 2.6 6.3 6.9.6-5.2 4.5 1.6 6.7L12 17.8 6.1 21.1l1.6-6.7-5.2-4.5 6.9-.6z" />
    </svg>
  );
}

export function CategoryGlyph({ id }: { id: CategoryId }) {
  return <img className="cat-icon" src={asset(`icons/${id}.png`)} alt="" />;
}
