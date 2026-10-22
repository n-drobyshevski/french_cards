// Copies sql.js's WebAssembly to public/vendor/, where the Anki import loads it in the browser
// (lib/anki/apkg.ts, SQL_WASM_URL). Runs before `next dev` and `next build`; skips an up-to-date copy.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const from = path.join(root, "node_modules/sql.js/dist/sql-wasm.wasm");
const to = path.join(root, "public/vendor/sql-wasm.wasm");

const wasm = await readFile(from);
const current = await readFile(to).catch(() => null);
if (!current?.equals(wasm)) {
  await mkdir(path.dirname(to), { recursive: true });
  await writeFile(to, wasm);
}
