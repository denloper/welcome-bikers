import type { CategoryId } from "../types";

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
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
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

function wrap(path: string, accent?: boolean) {
  return (
    <svg viewBox="0 0 64 64" className={`cat-icon ${accent ? "red" : ""}`}>
      <path d={path} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CategoryGlyph({ id }: { id: CategoryId }) {
  switch (id) {
    case "hotels":
      return wrap("M10 40V28l22-12 22 12v12M18 40v-8h12v8M38 28h8v12");
    case "shops":
      return wrap("M22 38c6 8 14 8 20 0M20 28a12 12 0 0 1 24 0v4H20zM24 24h4M36 24h4");
    case "bars":
      return wrap("M20 18h8l-2 22h-4zm16 0h8l-2 22h-4zM18 20h12M34 20h12");
    case "restaurants":
      return wrap("M22 16v28M20 16c4 0 4 8 0 8M42 16c0 8-6 8-6 16v12M36 16v8");
    case "services":
      return wrap("M18 40V28l14-10 14 10v12H18zM32 22v-4");
    case "rent":
      return wrap("M20 40a8 8 0 0 0 8-8V20h6l6 8h-6M28 20h-4");
    case "festivals":
      return wrap("M20 28v8h8l16-16-8-8-16 16zM36 12l8 8");
    case "routes":
      return wrap("M18 42h8v-8h-8zm10-12h8v-8h-8zm10-12h8V10h-8z");
    case "viewpoints":
      return wrap("M18 30a14 10 0 0 0 28 0 14 10 0 0 0-28 0zm8 0a6 6 0 1 0 12 0 6 6 0 0 0-12 0z");
    case "add":
      return (
        <svg viewBox="0 0 64 64" className="cat-icon red filled">
          <path fill="currentColor" d="M32 8c-9 0-16 7-16 16 0 12 16 28 16 28s16-16 16-28c0-9-7-16-16-16zm0 22a6 6 0 1 1 0-12 6 6 0 0 1 0 12z" />
          <path fill="#fff" d="M30 20h4v12h-4zM26 24h12v4H26z" />
        </svg>
      );
    case "help":
      return (
        <svg viewBox="0 0 64 64" className="cat-icon red filled">
          <path fill="currentColor" d="M32 8 38 18l12 2-8 9 2 12-12-6-12 6 2-12-8-9 12-2z" />
          <path fill="#fff" d="M30 22h4v10h-4zm0 14h4v4h-4z" />
        </svg>
      );
    case "historical":
      return wrap("M14 42h36M18 42V26l14-10 14 10v16M24 42V30h6v12M34 42V30h6v12");
  }
}
