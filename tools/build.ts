//
// The two things `tsc` will not do for us.
//
// The source shebang carries the type stripping flags, because in this repository the
// command runs straight off the TypeScript. The published build is plain JavaScript and
// must not ask for those flags, so it gets a plain shebang and the executable bit.
//
// Run after `tsc -p tsconfig.build.json`, never on its own.
//

import fs from "node:fs";
import path from "node:path";

const ENTRY = path.join(import.meta.dirname, "..", "dist", "cli.js");
const SHEBANG = "#!/usr/bin/env node";

function main(): void {
  if (!fs.existsSync(ENTRY)) {
    throw new Error(`No build at ${ENTRY}. Run tsc -p tsconfig.build.json first.`);
  }

  const source = fs.readFileSync(ENTRY, "utf8");
  const lines = source.split("\n");
  const body = lines[0]?.startsWith("#!") ? lines.slice(1) : lines;
  fs.writeFileSync(ENTRY, [SHEBANG, ...body].join("\n"), "utf8");
  fs.chmodSync(ENTRY, 0o755);

  process.stdout.write(`built ${path.relative(process.cwd(), ENTRY)}\n`);
}

main();
