import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
const root = process.cwd();
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "next/server")
      return nextResolve("next/server.js", context);
    if (specifier === "cloudflare:workers")
      return {
        url: pathToFileURL(root + "/tests/mock-cloudflare.mjs").href,
        shortCircuit: true,
      };
    if (specifier === "next/headers")
      return {
        url: pathToFileURL(root + "/tests/mock-headers.mjs").href,
        shortCircuit: true,
      };
    if (specifier === "next/navigation")
      return {
        url: pathToFileURL(root + "/tests/mock-navigation.mjs").href,
        shortCircuit: true,
      };
    if (specifier.startsWith("@/"))
      return nextResolve(
        pathToFileURL(
          root +
            "/" +
            specifier.slice(2) +
            (specifier.endsWith(".ts") ? "" : ".ts"),
        ).href,
        context,
      );
    try {
      return nextResolve(specifier, context);
    } catch (e) {
      if (specifier.startsWith(".") && !/\.\w+$/.test(specifier))
        return nextResolve(specifier + ".ts", context);
      throw e;
    }
  },
});
