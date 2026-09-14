import type { ProcessStateEvent, Profile } from "./types";

export function applyProcessState(
  current: ReadonlyMap<string, number>,
  event: ProcessStateEvent,
): Map<string, number> {
  const next = new Map(current);
  if (event.running) {
    next.set(event.serial, event.pid);
  } else if (next.get(event.serial) === event.pid) {
    next.delete(event.serial);
  }
  return next;
}

export function setSerialMembership(
  current: ReadonlySet<string>,
  serial: string,
  present: boolean,
): Set<string> {
  const next = new Set(current);
  if (present) {
    next.add(serial);
  } else {
    next.delete(serial);
  }
  return next;
}

export function setDeviceProfile(
  current: ReadonlyMap<string, Profile>,
  serial: string,
  profile: Profile,
): Map<string, Profile> {
  const next = new Map(current);
  next.set(serial, profile);
  return next;
}
