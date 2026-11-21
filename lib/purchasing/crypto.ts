const encoder = new TextEncoder();
export const randomToken = (bytes = 32) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
export const digest = async (s: string | Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        typeof s === "string"
          ? encoder.encode(s)
          : (s as Uint8Array<ArrayBuffer>),
      ),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
