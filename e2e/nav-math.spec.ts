import { expect, test } from "@playwright/test";
import { remainingAlong, tripTooShort } from "../src/lib/nav";
import { formatDriveTime, formatMeters, type DriveRoute } from "../src/lib/osrm";

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
