import { asset } from "../lib/assets";

export function BrandLogo({ compact = false }: { compact?: boolean }) {
  return (
    <img
      className={compact ? "brand-logo sm" : "brand-logo"}
      src={asset("icons/logo.png")}
      alt="WelcomeBikers"
    />
  );
}
