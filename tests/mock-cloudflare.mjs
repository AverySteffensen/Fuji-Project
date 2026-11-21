export const env = new Proxy({}, {
  get: (_, key) => globalThis.__testEnv?.[key],
});
