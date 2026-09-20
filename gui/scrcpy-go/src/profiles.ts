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
    eyebrow: "Fastest",
    description: "Minimum overhead for reaction-first play.",
    specs: ["120 FPS", "720px cap", "2 Mbps", "Phone audio"],
  },
  {
    id: "balanced",
    name: "Balanced",
    eyebrow: "Recommended",
    description: "Responsive play with a cleaner image and PC audio.",
    specs: ["120 FPS", "720px cap", "6 Mbps", "PC audio"],
  },
  {
    id: "quality",
    name: "Quality",
    eyebrow: "Sharpest",
    description: "Maximum detail for games that reward clarity.",
    specs: ["120 FPS", "1080px cap", "12 Mbps", "PC audio"],
  },
] as const;

export function isProfile(value: string): value is Profile {
  return PROFILES.some((profile) => profile.id === value);
}
