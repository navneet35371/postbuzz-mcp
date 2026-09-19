/**
 * Live MCP integration: spawns the built postbuzz-mcp binary over stdio
 * (the exact path Claude Desktop / Cursor use) and drives representative
 * tools against a real post.buzz API.
 *
 * Usage: POSTBUZZ_API_KEY=… POSTBUZZ_API_URL=http://localhost:8787/api node test/live-stdio.mjs
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const apiKey = process.env.POSTBUZZ_API_KEY;
const apiUrl = process.env.POSTBUZZ_API_URL;
if (!apiKey) {
  console.error("POSTBUZZ_API_KEY is required");
  process.exit(1);
}

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["dist/index.js", "--api-key", apiKey, ...(apiUrl ? ["--api-url", apiUrl] : [])],
});
const client = new Client({ name: "live-integration", version: "1.0.0" });
await client.connect(transport);

let pass = 0;
let fail = 0;

async function call(name, args, check) {
  try {
    const res = await client.callTool({ name, arguments: args });
    const text = res.content?.[0]?.text ?? "";
    const body = JSON.parse(text);
    if (check(body, res)) {
      pass++;
      console.log(`ok   ${name}`);
    } else {
      fail++;
      console.log(`FAIL ${name}: unexpected body ${text.slice(0, 200)}`);
      process.exit(1);
    }
  } catch (e) {
    fail++;
    console.log(`FAIL ${name}: threw ${e.message}`);
    process.exit(1);
  }
}

const { tools } = await client.callTool ? await client.listTools() : { tools: [] };
console.log(`tool manifest: ${tools.length} tools`);
if (tools.length < 50) {
  console.log("FAIL manifest too small");
  process.exit(1);
}
pass++;

await call("check_setup", {}, (b) => b.ok === true || Array.isArray(b.checks));
await call("list_accounts", {}, (b) => Array.isArray(b));
await call("get_usage", {}, (b) => typeof b.postsThisMonth === "number");
await call("describe_platform", { platform: "instagram" }, (b) => b.platform === "instagram");

const created = await client.callTool({
  name: "create_post",
  arguments: { caption: "mcp live integration post", accountIds: [process.env.POSTBUZZ_ACCOUNT_ID ?? "sac_test_pbcli_x"] },
});
const post = JSON.parse(created.content[0].text);
pass++;
console.log(`ok   create_post (${post.id})`);

await call("schedule_post", { caption: "mcp scheduled", accountIds: [process.env.POSTBUZZ_ACCOUNT_ID ?? "sac_test_pbcli_x"], scheduledAt: "2026-12-05T09:00:00Z" }, (b) => b.status === "scheduled");
await call("get_post", { postId: post.id }, (b) => b.id === post.id);
await call("delete_post", { postId: post.id }, (b) => b.success === true);
await call("get_post", { postId: "no-such-post" }, (_b, res) => res.isError === true, true);

await client.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
