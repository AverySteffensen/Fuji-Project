export const headers = async () =>
  globalThis.__testAuthHeaders ?? new Headers();
