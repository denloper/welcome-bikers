import { expect, test } from "@playwright/test";
import { closestOnPolyline } from "../src/lib/geo";
import { remainingAlong, tripTooShort } from "../src/lib/nav";
import { formatDriveTime, formatMeters, type DriveRoute } from "../src/lib/osrm";
import { nextVoice, voiceLine } from "../src/lib/voice";

const route: DriveRoute = {
  geometry: [
    [42.441, 19.2626],
    [42.436, 19.271],
    [42.43, 19.28],
  ],
  distance: 2400,
  duration: 360,
  steps: [
    {
      name: "Bulevar",
      distance: 1400,
      duration: 200,
      type: "depart",
      modifier: "straight",
      location: [42.441, 19.2626],
    },
    {
      name: "Destination",
      distance: 1000,
      duration: 160,
      type: "arrive",
      modifier: "right",
      location: [42.43, 19.28],
    },
  ],
};

test("formatDriveTime never says Now", () => {
  expect(formatDriveTime(0)).toBe("1 min.");
  expect(formatDriveTime(10)).toBe("1 min.");
  expect(formatDriveTime(360)).toBe("6 min.");
});

test("formatMeters keeps remaining distance readable", () => {
  expect(formatMeters(2400)).toBe("2.40 km");
  expect(formatMeters(0)).toBe("0 m");
});

test("start and dest a few metres apart is too short to GO", () => {
  expect(tripTooShort([{ lat: 42.43, lon: 19.28 }, { lat: 42.43, lon: 19.28 }])).toBe(true);
  expect(tripTooShort([{ lat: 42.441, lon: 19.2626 }, { lat: 42.43, lon: 19.28 }])).toBe(false);
});

test("remainingAlong does not mark arrival at the start of a 2 km route", () => {
  const live = remainingAlong(route, { lat: 42.441, lon: 19.2626 });
  expect(live.arrived).toBe(false);
  expect(live.distance).toBeGreaterThan(200);
  expect(formatDriveTime(live.duration)).not.toBe("Now");
});

test("remainingAlong marks arrival only near the destination", () => {
  const live = remainingAlong(route, { lat: 42.43, lon: 19.28 });
  expect(live.arrived).toBe(true);
  expect(live.distance).toBe(0);
});

test("closestOnPolyline snaps a nearby point onto the line", () => {
  const snap = closestOnPolyline(
    [
      [42.441, 19.2626],
      [42.436, 19.271],
      [42.43, 19.28],
    ],
    { lat: 42.4362, lon: 19.2712 },
  );
  expect(snap.distKm).toBeLessThan(0.05);
  expect(snap.lat).toBeGreaterThan(42.43);
  expect(snap.lat).toBeLessThan(42.441);
});

test("voice says the turn once on approach and once at the corner", () => {
  const step = {
    name: "Bulevar",
    distance: 400,
    duration: 40,
    type: "turn",
    modifier: "right",
    location: [42.436, 19.271] as [number, number],
  };
  expect(voiceLine("approach", step, 210)).toBe("In 200 meters, turn right onto Bulevar");
  expect(voiceLine("now", step)).toBe("Turn right onto Bulevar");
  expect(voiceLine("arrived")).toBe("You have arrived");
  let st = { stepI: -1, approach: false, now: false, arrived: false };
  const a = nextVoice(st, { arrived: false, stepI: 0, stepRemain: 210, next: step });
  expect(a.line).toMatch(/In 200 meters/i);
  const b = nextVoice(a.state, { arrived: false, stepI: 0, stepRemain: 180, next: step });
  expect(b.line).toBeNull();
  const c = nextVoice(b.state, { arrived: false, stepI: 0, stepRemain: 30, next: step });
  expect(c.line).toMatch(/^Turn right/i);
  const d = nextVoice(c.state, { arrived: false, stepI: 0, stepRemain: 20, next: step });
  expect(d.line).toBeNull();
  const e = nextVoice(d.state, { arrived: true, stepI: 1, stepRemain: 0, next: step });
  expect(e.line).toBe("You have arrived");
  const f = nextVoice(e.state, { arrived: true, stepI: 1, stepRemain: 0, next: step });
  expect(f.line).toBeNull();
});
