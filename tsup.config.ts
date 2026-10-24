import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("./package.json", "utf8")) as {
  version: string;
};

export default defineConfig({
  // index: the stdio binary. server: createServer() for hosting the same
  // tools over another transport (e.g. Streamable HTTP) — no side effects.
  // `postbuzz` stays an external npm dependency; the shebang in
  // src/index.ts is hoisted by esbuild.
  entry: ["src/index.ts", "src/server.ts"],
  format: ["esm"],
  dts: { entry: "src/server.ts" },
  sourcemap: true,
  clean: true,
  target: "node20",
  define: { __MCP_VERSION__: JSON.stringify(version) },
});
