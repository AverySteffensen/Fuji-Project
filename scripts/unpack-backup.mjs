import {
  open,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
  lstat,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  ARCHIVE_MAGIC,
  ARCHIVE_SALT_BYTES,
  MAX_FRAME_BYTES,
  archiveKey,
  backupKeyBytes,
  frameParameters,
} from "../lib/purchasing/backup-archive.ts";

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const safeId = /^[0-9a-f-]{36}$/i;

// Extract to a new directory only after the signature, frame authentication,
// component checksums and end-of-file all pass.
export async function unpackBackup(input, destination, secret) {
  const target = resolve(destination);
  try {
    await lstat(target);
    throw new Error("Choose a destination directory that does not exist.");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const file = await open(input, "r");
  let staging;
  try {
    const read = async (length) => {
      const bytes = new Uint8Array(length);
      let offset = 0;
      while (offset < length) {
        const { bytesRead } = await file.read(
          bytes,
          offset,
          length - offset,
          null,
        );
        if (!bytesRead) throw new Error("The backup download is incomplete.");
        offset += bytesRead;
      }
      return bytes;
    };
    const magic = await read(ARCHIVE_MAGIC.length);
    if (!magic.every((byte, i) => byte === ARCHIVE_MAGIC[i]))
      throw new Error("Unsupported Fuji backup format.");
    const key = await archiveKey(secret, await read(ARCHIVE_SALT_BYTES));
    let index = 0;
    const frame = async () => {
      const header = await read(4);
      const length = new DataView(header.buffer).getUint32(0);
      if (length < 16 || length > MAX_FRAME_BYTES)
        throw new Error("Invalid backup frame.");
      return new Uint8Array(
        await crypto.subtle.decrypt(
          frameParameters(index++),
          key,
          await read(length),
        ),
      );
    };
    const signed = await frame();
    const { payload, signature } = JSON.parse(decoder.decode(signed));
    const verifyKey = await crypto.subtle.importKey(
      "raw",
      backupKeyBytes(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    if (
      typeof payload !== "string" ||
      !Array.isArray(signature) ||
      !(await crypto.subtle.verify(
        "HMAC",
        verifyKey,
        Uint8Array.from(signature),
        encoder.encode(payload),
      ))
    )
      throw new Error("Backup manifest signature verification failed.");
    const manifest = JSON.parse(payload);
    if (
      manifest.format !== 1 ||
      manifest.kind !== "backup" ||
      !safeId.test(manifest.id)
    )
      throw new Error("Invalid backup manifest.");

    staging = await mkdtemp(resolve(dirname(target), ".fuji-recovery-"));
    const store = async (name, bytes) => {
      const path = resolve(staging, name);
      await mkdir(dirname(path), { recursive: true, mode: 0o700 });
      await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
    };
    await store(`backup-manifests/${manifest.id}.json`, signed);
    const prefix = `backups/${manifest.id}/`;
    for (const part of [...manifest.parts, ...manifest.files]) {
      if (
        !part.key.startsWith(prefix) ||
        !/^[a-zA-Z0-9._/-]+$/.test(part.key) ||
        part.key
          .split("/")
          .some((segment) => !segment || segment === "." || segment === "..")
      )
        throw new Error("Unsafe component key in backup manifest.");
      const data = await frame();
      const digest = Buffer.from(
        await crypto.subtle.digest("SHA-256", data),
      ).toString("hex");
      if (
        digest !== part.sha256 ||
        (part.size !== undefined && data.length !== part.size)
      )
        throw new Error("Backup component checksum verification failed.");
      await store(part.key, data);
    }
    const trailing = await file.read(new Uint8Array(1), 0, 1, null);
    if (trailing.bytesRead)
      throw new Error("Unexpected data after the backup.");
    await rename(staging, target);
    staging = undefined;
    return {
      id: manifest.id,
      snapshotAt: manifest.at,
      expiresAt: manifest.expiresAt,
    };
  } finally {
    await file.close();
    if (staging) await rm(staging, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const [, , input, destination] = process.argv;
    const secret = process.env.FUJI_BACKUP_KEY;
    if (!input || !destination || !secret)
      throw new Error(
        "Usage: node --experimental-strip-types scripts/unpack-backup.mjs INPUT.fujibackup NEW_DIRECTORY with FUJI_BACKUP_KEY set securely.",
      );
    console.log(await unpackBackup(input, destination, secret));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
