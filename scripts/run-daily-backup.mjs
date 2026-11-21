import { createHash, createHmac } from "node:crypto";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

const origin = "https://fuji-purchasing-complete.averysteffensen.chatgpt.site";
const proofScope = "fuji-purchasing/daily-backup/v1";

export function backupProof(siteToken) {
  return createHmac("sha256", siteToken).update(proofScope).digest("hex");
}

async function main() {
  // Service credentials are supplied on private stdin. Never put them in
  // arguments, files, output, or a redirect to another origin.
  const input = createInterface({ input: process.stdin, terminal: false });
  let credentials;
  try {
    for await (const line of input) {
      credentials = JSON.parse(line);
      break;
    }
  } catch {
    throw new Error("Expected one JSON object on private standard input.");
  } finally {
    input.close();
    process.stdin.pause();
  }
  const { siteUrl, accessToken } = credentials ?? {};
  if (
    new URL(siteUrl).origin !== origin ||
    typeof accessToken !== "string" ||
    !accessToken
  )
    throw new Error(
      "Expected service access for the Fuji Purchasing Register.",
    );
  const proof = backupProof(accessToken);
  if (process.argv[2] === "--verifier") {
    console.log(createHash("sha256").update(proof).digest("hex"));
    return;
  }
  if (process.argv.length !== 2) throw new Error("Unexpected argument.");

  const deadline = Date.now() + 20 * 60_000;
  let lastStatus = "waiting";
  while (Date.now() < deadline) {
    let response;
    try {
      response = await fetch(new URL("/api/operations/daily-backup", origin), {
        method: "POST",
        redirect: "error",
        headers: {
          "OAI-Sites-Authorization": "Bearer " + accessToken,
          "X-Fuji-Backup-Proof": proof,
        },
        signal: AbortSignal.timeout(50_000),
      });
    } catch {
      lastStatus = "service unreachable";
      await delay(10_000);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      lastStatus = "HTTP " + response.status;
      await delay(15_000);
      continue;
    }
    if (!response.ok)
      throw new Error(
        "Daily backup request returned HTTP " + response.status + ".",
      );
    const result = await response.json();
    if (
      result.status === "complete" &&
      result.id &&
      result.day &&
      result.expiresAt
    ) {
      console.log(
        JSON.stringify({
          id: result.id,
          day: result.day,
          status: result.status,
          expiresAt: result.expiresAt,
        }),
      );
      return;
    }
    if (result.status !== "working" && result.status !== "failed")
      throw new Error(
        "The daily backup service returned an unexpected status.",
      );
    lastStatus = result.status;
    const wait = Number(result.retryAfterSeconds);
    await delay(
      1000 * (Number.isFinite(wait) ? Math.min(300, Math.max(1, wait)) : 5),
    );
  }
  throw new Error(
    "Daily backup did not finish within 20 minutes. Last status: " +
      lastStatus +
      ".",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
