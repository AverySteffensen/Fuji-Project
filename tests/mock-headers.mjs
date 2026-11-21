import { AsyncLocalStorage } from "node:async_hooks";
export const requestIdentity = new AsyncLocalStorage();
export const headers = async () =>
  requestIdentity.getStore() ?? globalThis.__testAuthHeaders ?? new Headers();
