import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // `postbuzz` stays an external npm dependency. The shebang in
  // src/index.ts is hoisted by esbuild.
  sourcemap: true,
  clean: true,
  target: "node20",
});
