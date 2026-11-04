// Builds the static site into ./docs so GitHub Pages can serve it from the main branch (/docs folder).
// Usage: npm run build:docs            (base path "/poker", the repository name)
//        npm run build:docs -- /name   (different repository name)
import { spawnSync } from "node:child_process";
import { cpSync, rmSync, writeFileSync } from "node:fs";

const repo = (process.argv[2] ?? "/poker").replace(/\/$/, "");
const basePath = repo === "" || repo === "/" ? "" : repo.startsWith("/") ? repo : `/${repo}`;

const build = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, PAGES_BASE_PATH: basePath },
});
if (build.status !== 0) process.exit(build.status ?? 1);

rmSync("docs", { recursive: true, force: true });
cpSync("out", "docs", { recursive: true });
writeFileSync("docs/.nojekyll", ""); // serve _next/ as-is
console.log(`\nStatic site written to ./docs with base path "${basePath || "/"}".`);
