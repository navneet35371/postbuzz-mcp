import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // Inline the SDK (dev-time file: dependency) so the published package is
  // self-contained. The shebang in src/index.ts is hoisted by esbuild.
  sourcemap: true,
  clean: true,
  target: "node20",
  dts: true,
});
