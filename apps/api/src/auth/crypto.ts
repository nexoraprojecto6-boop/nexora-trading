import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError, err, ok, type Result } from "@nexora/shared";

/** Token aleatório (base64url, sem caracteres especiais). 32 bytes → 43 caracteres. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Comparação em tempo constante de dois hashes hexadecimais. */
export function safeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export interface Pkce {
  readonly verifier: string;
  readonly challenge: string;
}

/** PKCE com S256: verifier de 43 caracteres e challenge = BASE64URL(SHA256(verifier)). */
export function createPkce(): Pkce {
  const verifier = randomToken(32);
  const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
  return { verifier, challenge };
}

/** A chave de cifra é base64 de exatamente 32 bytes. A mensagem de erro nunca repete o valor. */
export function parseEncryptionKey(value: string): Result<Buffer> {
  const key = Buffer.from(value.trim(), "base64");
  if (key.length !== 32) {
    return err(new AppError("CONFIG", "APP_ENCRYPTION_KEY inválida: tem de ser base64 de exatamente 32 bytes."));
  }
  return ok(key);
}

const FORMAT_VERSION = "v1";

/**
 * Cifra com AES-256-GCM. `context` entra como dados autenticados (AAD): um valor cifrado
 * para um contexto não pode ser decifrado noutro. Formato: v1.<iv>.<cifrado>.<tag>.
 */
export function encryptSecret(key: Buffer, plaintext: string, context: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_VERSION, iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(".");
}

export function decryptSecret(key: Buffer, payload: string, context: string): Result<string> {
  const parts = payload.split(".");
  const [version, ivPart, dataPart, tagPart] = parts;
  if (parts.length !== 4 || version !== FORMAT_VERSION || !ivPart || !dataPart || !tagPart) {
    return err(new AppError("INTERNAL", "Segredo cifrado com formato inválido."));
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivPart, "base64url"));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
    const plain = Buffer.concat([decipher.update(Buffer.from(dataPart, "base64url")), decipher.final()]);
    return ok(plain.toString("utf8"));
  } catch (cause) {
    return err(new AppError("INTERNAL", "Não foi possível decifrar o segredo.", { cause }));
  }
}
