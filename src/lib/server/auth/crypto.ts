import { randomBytes, createHash, scrypt, timingSafeEqual } from "node:crypto";

// OWASP가 제시한 scrypt 조합: N=2^15, r=8, p=3. 비밀번호마다 다른 salt를 사용합니다.
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, 64, SCRYPT, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt-v1:${salt.toString("hex")}:${hash.toString("hex")}`;
}
export async function verifyPassword(password: string, stored?: string) {
  // 없는 계정도 같은 비용으로 검사해 아이디 존재 여부에 따른 시간 차이를 줄입니다.
  const dummy = `scrypt-v1:${"00".repeat(16)}:${"00".repeat(64)}`;
  const parts = (stored || dummy).split(":");
  if (
    parts[0] !== "scrypt-v1" ||
    !/^[a-f0-9]{32}$/.test(parts[1] || "") ||
    !/^[a-f0-9]{128}$/.test(parts[2] || "")
  )
    return false;
  const actual = await derive(password, Buffer.from(parts[1], "hex"));
  return (
    timingSafeEqual(actual, Buffer.from(parts[2], "hex")) && Boolean(stored)
  );
}
export function secretHash(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}
export function makeSession() {
  const token = randomBytes(32).toString("hex");
  return { token, hash: secretHash(token) };
}
export function makeRecoveryCode() {
  return (
    "FYN-" +
    randomBytes(24).toString("hex").toUpperCase().match(/.{8}/g)!.join("-")
  );
}
export function recoveryHash(code: string) {
  return secretHash(code.trim().toUpperCase().replace(/-/g, ""));
}
export function matchesRecovery(code: string, expected: string) {
  if (!/^[a-f0-9]{64}$/.test(expected)) return false;
  return timingSafeEqual(
    Buffer.from(recoveryHash(code), "hex"),
    Buffer.from(expected, "hex"),
  );
}
