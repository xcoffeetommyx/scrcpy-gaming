import type { Profile } from "./types";

export interface ProfileOption {
  id: Profile;
  name: string;
  eyebrow: string;
  description: string;
  specs: readonly string[];
}

export const PROFILES: readonly ProfileOption[] = [
  {
    id: "competitive",
    name: "Competitive",
    eyebrow: "Lowest latency",
    description: "Built for fast reactions and controller-first play.",
    specs: ["120 FPS", "720 max", "2 Mbps", "Audio off"],
  },
  {
    id: "balanced",
    name: "Balanced",
    eyebrow: "Recommended",
    description: "Sharper motion without giving up the responsive feel.",
    specs: ["120 FPS", "720 max", "6 Mbps", "Audio off"],
  },
  {
    id: "quality",
    name: "Quality",
    eyebrow: "More detail",
    description: "A richer picture for games where detail matters most.",
    specs: ["120 FPS", "1080 max", "12 Mbps", "Audio on · 20 ms buffer"],
  },
] as const;

export function isProfile(value: string): value is Profile {
  return PROFILES.some((profile) => profile.id === value);
}
