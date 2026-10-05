export const PROFILE_VERSION = "Ribbon profile v1";
export const MAX_NAME_LENGTH = 32;
export const SIGNATURE_WINDOW_MS = 10 * 60 * 1000;
export const CLOCK_SKEW_MS = 60 * 1000;

const NAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} .'-]{0,31}$/u;

export function profileMessage(address: string, displayName: string, issuedAt: number): string {
  return `${PROFILE_VERSION}\n${address.toLowerCase()}\n${displayName}\n${issuedAt}`;
}

export function validDisplayName(name: string): boolean {
  return name.length <= MAX_NAME_LENGTH && NAME_PATTERN.test(name);
}

export function freshTimestamp(issuedAt: number, now: number): boolean {
  return Number.isInteger(issuedAt) && issuedAt <= now + CLOCK_SKEW_MS && now - issuedAt <= SIGNATURE_WINDOW_MS;
}
