import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { IconBack } from "./Icons";

export function TopBar({
  title,
  right,
}: {
  title: string;
  right?: ReactNode;
}) {
  const nav = useNavigate();
  return (
    <header className="topbar">
      <button className="icon-btn" onClick={() => nav(-1)} aria-label="Back">
        <IconBack />
      </button>
      <h1>{title}</h1>
      <div>{right}</div>
    </header>
  );
}
