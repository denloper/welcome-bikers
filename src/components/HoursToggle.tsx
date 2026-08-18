import { useState } from "react";
import { todayHours, weekSchedule } from "../lib/hours";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function HoursToggle({ hours }: { hours?: string }) {
  const [open, setOpen] = useState(false);
  const today = DAYS[(new Date().getDay() + 6) % 7];
  const label = todayHours(hours);
  const rows = weekSchedule(hours);

  return (
    <div className="hours">
      <button type="button" className="hours-btn" onClick={() => setOpen((v) => !v)}>
        <span className="open">{label.open}</span>
        {label.detail && (
          <>
            <span className="hours-dot">•</span>
            <span>{label.detail}</span>
          </>
        )}
        <span className="hours-caret">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="hours-pop">
          {rows.map((row) => (
            <div key={row.day} className={row.day === today ? "on" : ""}>
              <span>{row.day}</span>
              <span>{row.hours}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
