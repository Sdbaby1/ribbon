import { describe, expect, it } from "vitest";
import { explainError, explainRevert } from "./errors";
import { formatInvite, parseInvite } from "./invite";
import { profileMessage } from "./messages";
import { equalSplit, netsAfterSplit } from "./split";
import { formatUsdc, parseUsdc } from "./usdc";

describe("USDC units", () => {
  it("parses and formats the 6-decimal interface", () => {
    expect(parseUsdc("1.5")).toBe(1_500_000n);
    expect(parseUsdc("0.000001")).toBe(1n);
    expect(formatUsdc(-1_500_000n)).toBe("-1.50");
    expect(formatUsdc(66n, 6)).toBe("0.000066");
    expect(() => parseUsdc("1.1234567")).toThrow(/6 decimal/);
  });
});

describe("equal split", () => {
  it("matches the contract remainder rule", () => {
    expect(equalSplit(100n, 3)).toEqual([34n, 33n, 33n]);
    expect(equalSplit(10n, 3)).toEqual([4n, 3n, 3n]);
    expect(equalSplit(8n, 8)).toEqual([1n, 1n, 1n, 1n, 1n, 1n, 1n, 1n]);
    expect(() => equalSplit(2n, 3)).toThrow();
  });

  it("nets the payer against their own share", () => {
    const payer = "0xabc";
    const people = ["0xabc", "0xdef", "0x123"];
    const shares = equalSplit(100n, 3);
    const nets = netsAfterSplit(payer, people, shares, 100n);
    expect(nets.get(payer)).toBe(66n);
    expect(nets.get("0xdef")).toBe(-33n);
    expect(nets.get("0x123")).toBe(-33n);
    expect([...nets.values()].reduce((sum, net) => sum + net, 0n)).toBe(0n);
  });
});

describe("invites", () => {
  it("round-trips a circle id and code", () => {
    const code = `0x${"ab".repeat(32)}` as `0x${string}`;
    const text = formatInvite(12n, code);
    expect(parseInvite(text)).toEqual({ circleId: 12n, code });
    expect(parseInvite("ribbon:0:0x" + "ab".repeat(32))).toBeNull();
    expect(parseInvite("nope")).toBeNull();
  });
});

describe("profile signatures", () => {
  it("builds the message the API verifies", () => {
    expect(profileMessage("0xABC", "Ada", 10)).toBe("Ribbon profile v1\n0xabc\nAda\n10");
  });
});

describe("revert copy", () => {
  it("names the debtor who still has to approve", () => {
    const text = explainRevert("AllowanceTooLow", ["0x1111111111111111111111111111111111111111", 5_000_000n, 0n]);
    expect(text).toContain("5.00");
    expect(text).toContain("approve");
  });

  it("turns a wallet rejection into a sentence", () => {
    expect(explainError(new Error("user rejected the request"))).toMatch(/wallet closed/i);
  });
});
