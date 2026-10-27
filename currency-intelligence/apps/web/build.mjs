// Copies the compiled core (packages/core/dist/*.js) into apps/web/core so the
// static site has no build step at deploy time. Run after `npm run build` in packages/core.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "..", "packages", "core", "dist");
const dst = join(here, "core");
rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
for (const f of readdirSync(src)) {
  if (f.endsWith(".js")) cpSync(join(src, f), join(dst, f));
}
console.log(`copied core → ${dst}`);
