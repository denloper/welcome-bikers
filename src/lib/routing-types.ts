export type LatLon = { lat: number; lon: number };

export type RouteProfile = "fastest" | "scenic" | "no-highways";
export type RouteProvider = "google" | "osrm" | "valhalla";

export type RoutingOptions = {
  profile: RouteProfile;
  allowTolls: boolean;
  allowFerries: boolean;
  pavedOnly: boolean;
  alternatives?: boolean;
};

export const DEFAULT_ROUTING_OPTIONS: RoutingOptions = {
  profile: "fastest",
  allowTolls: false,
  allowFerries: true,
  pavedOnly: true,
  alternatives: true,
};

export type NavStep = {
  name: string;
  distance: number;
  duration: number;
  type: string;
  modifier: string;
  location: [number, number];
};

export type DriveRoute = {
  id: string;
  provider: RouteProvider;
  profile: RouteProfile;
  trafficAware: boolean;
  summary: string;
  geometry: [number, number][];
  distance: number;
  duration: number;
  steps: NavStep[];
};

export type ManeuverPreview = {
  step: NavStep;
  label: string;
  distance: number;
};
