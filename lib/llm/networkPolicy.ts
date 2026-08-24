import "server-only";
import { isIP } from "node:net";

function parseIpv4(address: string): [number, number, number, number] | null {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
    return null;
  }
  return octets as [number, number, number, number];
}

function isPublicIpv4(address: string): boolean {
  const parsed = parseIpv4(address);
  if (!parsed) return false;
  const [a, b, c] = parsed;
  return !(
    a === 0
    || a === 10
    || a === 127
    || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
    || (a === 192 && b === 88 && c === 99)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || (a === 198 && b === 51 && c === 100)
    || (a === 203 && b === 0 && c === 113)
  );
}

function ipv4Words(address: string): [number, number] | null {
  const parsed = parseIpv4(address);
  if (!parsed) return null;
  return [(parsed[0] << 8) | parsed[1], (parsed[2] << 8) | parsed[3]];
}

function parseIpv6(address: string): number[] | null {
  let normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized.includes("%")) return null;
  if (normalized.includes(".")) {
    const separator = normalized.lastIndexOf(":");
    const words = ipv4Words(normalized.slice(separator + 1));
    if (separator < 0 || !words) return null;
    normalized = `${normalized.slice(0, separator)}:${words[0].toString(16)}:${words[1].toString(16)}`;
  }
  const halves = normalized.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const zeros = 8 - left.length - right.length;
  if (zeros < 0 || (halves.length === 2 && zeros < 1)) return null;
  const words = [...left, ...Array.from({ length: zeros }, () => "0"), ...right]
    .map((word) => /^[0-9a-f]{1,4}$/.test(word) ? Number.parseInt(word, 16) : Number.NaN);
  return words.length === 8 && words.every(Number.isInteger) ? words : null;
}

function embeddedIpv4(words: number[]): string | null {
  const fromWords = (high: number, low: number) => [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
  const mapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
  const compatible = words.slice(0, 6).every((word) => word === 0);
  if (mapped || compatible) return fromWords(words[6], words[7]);
  if (words[0] === 0x2002) return fromWords(words[1], words[2]);
  const nat64 = words[0] === 0x0064 && words[1] === 0xff9b && words.slice(2, 6).every((word) => word === 0);
  return nat64 ? fromWords(words[6], words[7]) : null;
}

export function isPublicProviderIp(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(normalized) === 4) return isPublicIpv4(normalized);
  if (isIP(normalized) !== 6) return false;
  const words = parseIpv6(normalized);
  if (!words) return false;
  const embedded = embeddedIpv4(words);
  if (embedded) return isPublicIpv4(embedded);
  // IANA currently allocates ordinary global unicast from 2000::/3.
  if ((words[0] & 0xe000) !== 0x2000) return false;
  if (words[0] === 0x2001 && words[1] === 0x0000) return false;
  if (words[0] === 0x2001 && words[1] === 0x0db8) return false;
  if (words[0] === 0x2001 && words[1] === 0x0002) return false;
  if (words[0] === 0x3fff && (words[1] & 0xf000) === 0) return false;
  return true;
}

export function providerHostIsBlocked(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  return isIP(host) !== 0 && !isPublicProviderIp(host);
}
