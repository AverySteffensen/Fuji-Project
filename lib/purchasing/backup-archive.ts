export const ARCHIVE_MAGIC = new TextEncoder().encode("FUJIBK1\n");
export const ARCHIVE_SALT_BYTES = 16;
export const MAX_FRAME_BYTES = 32 * 1024 * 1024;
const encoder = new TextEncoder();

export function backupKeyBytes(key: string) {
  if (!/^[0-9a-f]{64}$/i.test(key))
    throw new Error("A 32-byte backup key is required.");
  return new Uint8Array(key.match(/../g)!.map((byte) => parseInt(byte, 16)));
}

export async function archiveKey(
  secret: string,
  salt: Uint8Array<ArrayBuffer>,
) {
  const material = await crypto.subtle.importKey(
    "raw",
    backupKeyBytes(secret),
    "HKDF",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt,
      info: encoder.encode("fuji-backup-archive-v1"),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export function frameParameters(index: number) {
  // A fresh archive key is derived from a random salt. Each frame under that
  // key uses a distinct counter, which also binds the frame to its position.
  if (!Number.isSafeInteger(index) || index < 0 || index > 0xffffffff)
    throw new Error("Backup archive contains too many frames.");
  const iv = new Uint8Array(12);
  new DataView(iv.buffer).setUint32(8, index);
  return { name: "AES-GCM", iv, additionalData: ARCHIVE_MAGIC };
}

export function frameLength(size: number) {
  if (size < 16 || size > MAX_FRAME_BYTES)
    throw new Error("A backup component is too large or invalid.");
  const length = new Uint8Array(4);
  new DataView(length.buffer).setUint32(0, size);
  return length;
}
