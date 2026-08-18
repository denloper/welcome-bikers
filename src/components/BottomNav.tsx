import { NavLink, useLocation } from "react-router-dom";
import { IconChat, IconGlobe, IconHome, IconUser } from "./Icons";

const items = [
  { to: "/", label: "Main", icon: IconHome, end: true },
  { to: "/chat", label: "Chat", icon: IconChat },
  { to: "/map", label: "Map", icon: IconGlobe },
  { to: "/account", label: "Account", icon: IconUser },
];

export function BottomNav() {
  const path = useLocation().pathname;
  const accountOn = path === "/login" || path === "/register" || path.startsWith("/account");

  return (
    <nav className="bottom-nav">
      {items.map((it) => (
        <NavLink
          key={it.to}
          to={it.to}
          end={it.end}
          className={({ isActive }) => (it.to === "/account" ? (accountOn ? "active" : "") : isActive ? "active" : "")}
        >
          <it.icon />
          {it.label}
        </NavLink>
      ))}
    </nav>
  );
}
