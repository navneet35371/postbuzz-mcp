#!/usr/bin/env node
/**
 * postbuzz-mcp — MCP server for the post.buzz API (stdio transport).
 *
 * Configure with a post.buzz API key (Settings → API Keys):
 *   env POSTBUZZ_API_KEY=sx_live_… npx postbuzz-mcp
 * or pass --api-key / --api-url flags.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

function parseArgs(argv: string[]): { apiKey?: string; apiUrl?: string } {
  const out: { apiKey?: string; apiUrl?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--api-key" && argv[i + 1]) out.apiKey = argv[++i];
    if (argv[i] === "--api-url" && argv[i + 1]) out.apiUrl = argv[++i];
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = args.apiKey ?? process.env.POSTBUZZ_API_KEY ?? "";
  const apiUrl = args.apiUrl ?? process.env.POSTBUZZ_API_URL;

  if (!apiKey) {
    // Fail loudly on stderr (stdout belongs to the MCP protocol) and exit —
    // a server that starts without credentials would only produce confusing
    // MISSING_API_KEY tool errors.
    process.stderr.write(
      "postbuzz-mcp: POSTBUZZ_API_KEY is required (or pass --api-key). " +
        "Create a key at https://post.buzz in Settings → API Keys.\n",
    );
    process.exit(1);
  }

  const server = createServer({ apiKey, ...(apiUrl ? { apiUrl } : {}) });
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(
    `postbuzz-mcp: fatal: ${err instanceof Error ? err.stack : String(err)}\n`,
  );
  process.exit(1);
});
