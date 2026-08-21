import type { ManeuverPreview, NavStep } from "../lib/routing-types";
import { formatDriveTime, formatMeters } from "../lib/osrm";

export type NavRouteState = "following" | "off-route" | "rerouting";

type ManeuverKind =
  | "straight"
  | "left"
  | "right"
  | "slight-left"
  | "slight-right"
  | "sharp-left"
  | "sharp-right"
  | "uturn"
  | "roundabout"
  | "merge"
  | "fork-left"
  | "fork-right"
  | "arrive";

export function maneuverKind(step?: NavStep): ManeuverKind {
  const type = `${step?.type || ""}`.toLowerCase();
  const modifier = `${step?.modifier || ""}`.toLowerCase();
  const value = `${type} ${modifier}`;
  if (type === "arrive") return "arrive";
  if (value.includes("roundabout") || value.includes("rotary")) return "roundabout";
  if (value.includes("uturn") || value.includes("u-turn")) return "uturn";
  if (type.includes("merge")) return "merge";
  if (type.includes("fork") || type.includes("off ramp") || type.includes("exit")) {
    return value.includes("left") ? "fork-left" : "fork-right";
  }
  if (modifier.includes("sharp left")) return "sharp-left";
  if (modifier.includes("sharp right")) return "sharp-right";
  if (modifier.includes("slight left")) return "slight-left";
  if (modifier.includes("slight right")) return "slight-right";
  if (modifier.includes("left")) return "left";
  if (modifier.includes("right")) return "right";
  return "straight";
}

export function displayedManeuverKind(step?: NavStep, arrived = false): ManeuverKind {
  return arrived ? "arrive" : maneuverKind(step);
}

export function NavManeuverIcon({
  step,
  compact = false,
  arrived = false,
}: {
  step?: NavStep;
  compact?: boolean;
  arrived?: boolean;
}) {
  const kind = displayedManeuverKind(step, arrived);
  const right = kind === "right" || kind === "slight-right" || kind === "sharp-right" || kind === "fork-right";
  const base = right ? kind.replace("right", "left") : kind;
  const path =
    base === "left"
      ? "M35 40V27c0-7-4-11-11-11H9m8-8-8 8 8 8"
      : base === "slight-left"
        ? "M33 41V30c0-9-5-14-16-19l-6-3m7-2-7 2 3 7"
        : base === "sharp-left"
          ? "M35 41V23c0-6-4-10-10-10H10m8-8-8 8 8 8"
          : base === "fork-left"
            ? "M30 41V25m0 0L17 12m13 13 9-9M16 6l1 6 6-1"
            : kind === "uturn"
              ? "M35 41V21a11 11 0 0 0-22 0v7m-7-7 7 7 7-7"
              : kind === "merge"
                ? "M28 41V25L14 11m14 14 9-9M10 7l4 4-4 4"
                : kind === "roundabout"
                  ? "M31 35a12 12 0 1 1 4-18m0 0V8m0 9h-9M24 36v7m-5-3 5 3 5-3"
                  : kind === "arrive"
                    ? "M24 42s11-12 11-22a11 11 0 1 0-22 0c0 10 11 22 11 22Zm0-17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
                    : "M24 42V8m-9 9 9-9 9 9";
  return (
    <span className={`nav-maneuver-icon${compact ? " compact" : ""}`} data-maneuver={kind}>
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <g transform={right ? "translate(48 0) scale(-1 1)" : undefined}>
          <path d={path} />
        </g>
      </svg>
    </span>
  );
}

function SpeakerIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 10v4h4l5 4V6L8 10H4Z" />
      {muted ? <path d="m17 9 4 6m0-6-4 6" /> : <path d="M16 9c1.7 1.6 1.7 4.4 0 6m2-9c3.4 3.3 3.4 8.7 0 12" />}
    </svg>
  );
}

function RecenterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
    </svg>
  );
}

function compactArrival(seconds: number): string {
  if (seconds <= 0) return "Arrived";
  return new Date(Date.now() + seconds * 1000).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function NavHud({
  primary,
  upcoming,
  routeState,
  following,
  muted,
  arrived,
  remainingTime,
  remainingDistance,
  progress,
  onToggleMute,
  onRecenter,
  onExit,
}: {
  primary?: ManeuverPreview;
  upcoming: ManeuverPreview[];
  routeState: NavRouteState;
  following: boolean;
  muted: boolean;
  arrived: boolean;
  remainingTime: number;
  remainingDistance: number;
  progress: number;
  onToggleMute: () => void;
  onRecenter: () => void;
  onExit: () => void;
}) {
  const instruction = arrived ? "You have arrived" : primary?.label || "Follow the highlighted route";
  const road = !arrived && primary?.step.name?.trim() ? primary.step.name.trim() : "";
  const stateText =
    routeState === "rerouting"
      ? "Rebuilding route…"
      : routeState === "off-route"
        ? "Return to the highlighted route"
        : !following
          ? "Free look · tap recenter"
          : "";
  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);

  return (
    <div className="nav-ui" data-route-state={routeState} data-following={following ? "1" : "0"}>
      <div className="nav-top-stack">
        <section className="nav-banner" data-testid="nav-primary">
          <NavManeuverIcon step={primary?.step} arrived={arrived} />
          <div className="nav-primary-copy">
            <b>{arrived ? "Now" : formatMeters(primary?.distance ?? remainingDistance)}</b>
            <span>{instruction}</span>
            {road && <small>{road}</small>}
          </div>
        </section>

        {stateText && (
          <div className="nav-status" role="status">
            <i />
            {stateText}
          </div>
        )}

        {upcoming.length > 0 && (
          <div className="nav-next-list" aria-label="Upcoming maneuvers">
            {upcoming.slice(0, 2).map((item, index) => (
              <div className="nav-then" key={`${item.step.location.join(",")}-${index}`}>
                <span>{index === 0 ? "Then" : "Next"}</span>
                <NavManeuverIcon step={item.step} compact />
                <b>{item.label}</b>
                <small>{formatMeters(item.distance)}</small>
              </div>
            ))}
          </div>
        )}
      </div>

      <section className="nav-hud">
        <div className="nav-progress" aria-label={`Trip ${percent}% complete`} data-testid="nav-route-progress">
          <i style={{ width: `${percent}%` }} />
        </div>
        <div className="nav-hud-main">
          <div className="nav-hud-stats">
            <p className="nav-hud-time">{arrived ? "Arrived" : formatDriveTime(remainingTime)}</p>
            <p className="nav-hud-meta">
              <span className="nav-hud-arrival">{compactArrival(remainingTime)}</span>
              <span className="nav-hud-km">{formatMeters(remainingDistance)}</span>
            </p>
          </div>
          <div className="nav-hud-actions">
            <button
              type="button"
              className={`nav-control${muted ? " is-muted" : ""}`}
              data-testid="nav-mute"
              aria-label={muted ? "Unmute navigation" : "Mute navigation"}
              aria-pressed={muted}
              onClick={onToggleMute}
            >
              <SpeakerIcon muted={muted} />
            </button>
            <button
              type="button"
              className={`nav-control nav-recenter${following ? " is-following" : ""}`}
              data-testid="nav-recenter"
              aria-label="Recenter navigation"
              aria-pressed={following}
              onClick={onRecenter}
            >
              <RecenterIcon />
            </button>
            <button type="button" className="nav-exit" data-testid="nav-exit" onClick={onExit}>
              Exit
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
