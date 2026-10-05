export function profileMessage(address: string, displayName: string, issuedAt: number): string {
  return `Ribbon profile v1\n${address.toLowerCase()}\n${displayName}\n${issuedAt}`;
}
