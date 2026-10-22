import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = process.cwd();
const runtime = resolve(root, ".sites-runtime");
mkdirSync(runtime, { recursive: true });
const config = resolve(runtime, "local-migrations.json");
writeFileSync(
  config,
  JSON.stringify(
    {
      name: "fuji-purchasing-hub",
      compatibility_date: "2026-05-15",
      d1_databases: [
        {
          binding: "DB",
          database_name: "site-creator-d1",
          database_id: "00000000-0000-4000-8000-000000000000",
          migrations_dir: resolve(root, "drizzle"),
        },
      ],
    },
    null,
    2,
  ),
);
const result = spawnSync(
  process.execPath,
  [
    "--import",
    resolve(root, "scripts/sites-env.mjs"),
    resolve(root, "node_modules/wrangler/bin/wrangler.js"),
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--config",
    config,
    "--persist-to",
    resolve(root, process.argv[2] || ".wrangler/state"),
  ],
  { cwd: root, stdio: "inherit" },
);
process.exit(result.status ?? 1);
