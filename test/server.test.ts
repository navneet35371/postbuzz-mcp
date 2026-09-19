import { createServer } from "../src/server.js";
import { createServer as createHttpServer, type Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  InMemoryTransport,
} from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * End-to-end MCP tests: a real MCP Client talks to createServer() over an
 * in-memory transport, which talks to a stub post.buzz REST server. Asserts
 * the full tool manifest (the parity surface) and representative flows.
 */

let http: Server;
let apiUrl = "";
const requests: Array<{ method: string; path: string; auth?: string; body?: string }> = [];
const responses: Array<{ status: number; body: string }> = [];

beforeAll(async () => {
  http = createHttpServer((req, res) => {
    let body = "";
    req.on("data", (c: Buffer) => {
      body += c.toString();
    });
    req.on("end", () => {
      requests.push({
        method: req.method ?? "",
        // Strip the /api mount prefix — the SDK composes baseUrl + "/v1/...".
        path: (req.url ?? "").replace(/^\/api/, ""),
        auth: req.headers.authorization,
        body: body || undefined,
      });
      const next = responses.shift() ?? { status: 200, body: "{}" };
      res.statusCode = next.status;
      res.setHeader("content-type", "application/json");
      res.end(next.body);
    });
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  const addr = http.address();
  if (!addr || typeof addr === "string") throw new Error("no address");
  apiUrl = `http://127.0.0.1:${addr.port}/api`;
});

afterAll(async () => {
  await new Promise<void>((r) => http.close(() => r()));
});

beforeEach(() => {
  requests.length = 0;
});

let client: Client;

beforeAll(async () => {
  const server = createServer({ apiKey: "sx_live_test", apiUrl });
  client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
});

function ok(data: unknown) {
  responses.push({ status: 200, body: JSON.stringify({ data }) });
}

function fail(status: number, body: unknown) {
  responses.push({ status, body: JSON.stringify(body) });
}

/** The full tool manifest — the parity contract. */
const EXPECTED_TOOLS = [
  // Diagnostics + reference
  "check_setup",
  "describe_platform",
  // Organization
  "get_organization",
  "get_usage",
  // Accounts
  "list_accounts",
  "get_account",
  "connect_account",
  "disconnect_account",
  "refresh_account",
  "list_account_tools",
  "run_account_tool",
  // Posts
  "create_post",
  "schedule_post",
  "list_posts",
  "get_post",
  "update_post",
  "delete_post",
  "retry_post",
  "reschedule_post",
  // Comments
  "create_comment",
  "list_comments",
  "get_comment",
  "update_comment",
  "delete_comment",
  "retry_comment",
  // Inbox
  "list_inbox",
  "reply_to_inbox_item",
  "edit_inbox_reply",
  // Media
  "upload_media",
  "list_media",
  "get_media",
  "delete_media",
  "delete_media_many",
  // Analytics
  "get_post_analytics",
  "get_account_analytics",
  "get_bulk_post_analytics",
  "refresh_analytics",
  "get_analytics_summary",
  "get_best_times",
  // Teams
  "list_teams",
  "get_team",
  "create_team",
  "update_team",
  "delete_team",
  "add_team_account",
  "remove_team_account",
  // CSV import
  "create_post_csv_import",
  "list_post_csv_imports",
  "get_post_csv_import",
  "get_post_csv_import_rows",
  "retry_post_csv_import",
];

describe("tool manifest", () => {
  it("exposes the full parity surface", async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  });

  it("describes required inputs (create_post needs accountIds)", async () => {
    const { tools } = await client.listTools();
    const create = tools.find((t) => t.name === "create_post");
    expect(create).toBeDefined();
    const schema = create!.inputSchema as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(schema.required).toContain("accountIds");
    expect(schema.properties!.caption).toBeDefined();
  });
});

describe("representative flows", () => {
  it("check_setup hits diagnostics and returns the checks", async () => {
    ok({
      ok: true,
      checks: [{ name: "api_key", ok: true, detail: "validated" }],
    });
    const res = await client.callTool({ name: "check_setup", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse((res.content as Array<{ text: string }>)[0]!.text)).toEqual({
      ok: true,
      checks: [{ name: "api_key", ok: true, detail: "validated" }],
    });
    expect(requests[0]!.path).toBe("/v1/diagnostics/setup");
    expect(requests[0]!.auth).toBe("Bearer sx_live_test");
  });

  it("create_post posts the payload", async () => {
    ok({ id: "p1", status: "draft" });
    const res = await client.callTool({
      name: "create_post",
      arguments: { caption: "hello", accountIds: ["a1"] },
    });
    expect(res.isError).toBeFalsy();
    expect(requests[0]!.method).toBe("POST");
    expect(requests[0]!.path).toBe("/v1/posts");
    expect(JSON.parse(requests[0]!.body!)).toEqual({
      caption: "hello",
      accountIds: ["a1"],
    });
  });

  it("schedule_post carries scheduledAt", async () => {
    ok({ id: "p2", status: "scheduled" });
    await client.callTool({
      name: "schedule_post",
      arguments: {
        caption: "later",
        accountIds: ["a1"],
        scheduledAt: "2026-10-01T09:00:00Z",
      },
    });
    expect(JSON.parse(requests[0]!.body!).scheduledAt).toBe(
      "2026-10-01T09:00:00Z",
    );
  });

  it("upload_media with url hits URL ingest", async () => {
    ok({ id: "m1", mediaType: "image" });
    const res = await client.callTool({
      name: "upload_media",
      arguments: { url: "https://cdn.example/x.png" },
    });
    expect(res.isError).toBeFalsy();
    expect(requests[0]!.path).toBe("/v1/media");
  });

  it("API errors map to isError + the error envelope", async () => {
    fail(404, { error: { code: "not_found", message: "Post not found" } });
    const res = await client.callTool({
      name: "get_post",
      arguments: { postId: "missing" },
    });
    expect(res.isError).toBe(true);
    expect(
      JSON.parse((res.content as Array<{ text: string }>)[0]!.text),
    ).toEqual({ error: { code: "not_found", message: "Post not found" } });
  });

  it("describe_platform is offline (no HTTP) and schema'd", async () => {
    const res = await client.callTool({
      name: "describe_platform",
      arguments: { platform: "reddit" },
    });
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(
      (res.content as Array<{ text: string }>)[0]!.text,
    ) as { platform: string; fields: unknown[] };
    expect(data.platform).toBe("reddit");
    expect(data.fields.length).toBeGreaterThan(0);
    expect(requests.length).toBe(0);
  });

  it("describe_platform rejects unknown platforms via isError", async () => {
    const res = await client.callTool({
      name: "describe_platform",
      arguments: { platform: "myspace" },
    });
    expect(res.isError).toBe(true);
    const body = JSON.parse(
      (res.content as Array<{ text: string }>)[0]!.text,
    ) as { error: { code: string } };
    expect(body.error.code).toBe("UNKNOWN_PLATFORM");
  });

  it("refresh_analytics requires a target", async () => {
    const res = await client.callTool({
      name: "refresh_analytics",
      arguments: {},
    });
    expect(res.isError).toBe(true);
    const body = JSON.parse(
      (res.content as Array<{ text: string }>)[0]!.text,
    ) as { error: { code: string } };
    expect(body.error.code).toBe("MISSING_PARAMS");
  });

  it("get_bulk_post_analytics collects per-post errors", async () => {
    ok({ id: "i1", likes: 5 });
    fail(404, { error: { code: "not_found", message: "no insight" } });
    const res = await client.callTool({
      name: "get_bulk_post_analytics",
      arguments: { postIds: ["p1", "p2"] },
    });
    expect(res.isError).toBeFalsy();
    const data = JSON.parse(
      (res.content as Array<{ text: string }>)[0]!.text,
    ) as Array<{ postId: string; insight?: unknown; error?: { code: string } }>;
    expect(data[0]!.insight).toEqual({ id: "i1", likes: 5 });
    expect(data[1]!.error!.code).toBe("not_found");
  });

  it("comment + inbox + team tools hit their routes", async () => {
    ok({ id: "c1", status: "pending" });
    await client.callTool({
      name: "create_comment",
      arguments: { postId: "p1", accountId: "a1", text: "nice" },
    });
    expect(requests[0]!.path).toBe("/v1/comments");

    ok({ items: [], total: 0 });
    await client.callTool({ name: "list_inbox", arguments: {} });
    expect(requests[1]!.path).toBe("/v1/inbox");

    ok({ id: "t1" });
    await client.callTool({
      name: "create_team",
      arguments: { name: "Growth" },
    });
    expect(requests[2]!.path).toBe("/v1/teams");

    ok({ jobId: "j1", status: "completed" });
    await client.callTool({
      name: "create_post_csv_import",
      arguments: { csv: "caption,accountId\nhi,a1" },
    });
    expect(requests[3]!.path).toBe("/v1/imports/posts/csv");
  });
});
