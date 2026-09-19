# postbuzz-mcp

MCP (Model Context Protocol) server for the [post.buzz](https://post.buzz) social media API — post, schedule, and analyze across 16+ platforms from Claude Desktop, Claude Code, Cursor, or any MCP client.

A thin, transport-agnostic wrapper over the official [`postbuzz` SDK](https://github.com/navneet35371/postbuzz-sdk), mirroring [`postbuzz-cli`](https://github.com/navneet35371/postbuzz-cli). Requires Node.js 20+.

## Setup

Create an API key at **post.buzz → Settings → API Keys** (`sx_live_…`), then configure your client:

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "postbuzz": {
      "command": "npx",
      "args": ["-y", "postbuzz-mcp"],
      "env": { "POSTBUZZ_API_KEY": "sx_live_..." }
    }
  }
}
```

### Claude Code

```bash
claude mcp add postbuzz -e POSTBUZZ_API_KEY=sx_live_... -- npx -y postbuzz-mcp
```

### Cursor

`~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "postbuzz": {
      "command": "npx",
      "args": ["-y", "postbuzz-mcp"],
      "env": { "POSTBUZZ_API_KEY": "sx_live_..." }
    }
  }
}
```

### Configuration

| Env var | Flag | Required | Purpose |
|---|---|---|---|
| `POSTBUZZ_API_KEY` | `--api-key` | yes | API key |
| `POSTBUZZ_API_URL` | `--api-url` | no | API base URL (default `https://post.buzz/api`) |

Test interactively with the [MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Tools (51)

**Diagnostics** — `check_setup` (run it first), `describe_platform` (per-platform field schemas; call before `create_post`).

**Organization** — `get_organization`, `get_usage`.

**Accounts** — `list_accounts`, `get_account`, `connect_account` (OAuth URL), `disconnect_account`, `refresh_account`, `list_account_tools`, `run_account_tool` (Reddit flairs / Pinterest boards).

**Posts** — `create_post`, `schedule_post`, `list_posts`, `get_post`, `update_post`, `delete_post`, `retry_post`, `reschedule_post`.

**Comments** — `create_comment` (immediate or scheduled; `parentCommentId` chains replies), `list_comments`, `get_comment`, `update_comment`, `delete_comment`, `retry_comment`.

**Inbox** — `list_inbox` (comments/mentions/DMs), `reply_to_inbox_item`, `edit_inbox_reply`.

**Media** — `upload_media` (public URL or local path), `list_media`, `get_media`, `delete_media`, `delete_media_many`.

**Analytics** — `get_post_analytics`, `get_account_analytics`, `get_bulk_post_analytics` (≤ 60 posts), `refresh_analytics`, `get_analytics_summary`, `get_best_times`.

**Teams** — `list_teams`, `get_team`, `create_team`, `update_team`, `delete_team`, `add_team_account`, `remove_team_account`.

**CSV import** — `create_post_csv_import`, `list_post_csv_imports`, `get_post_csv_import`, `get_post_csv_import_rows`, `retry_post_csv_import`.

### Targeting & per-platform fields

Posts target accounts by id (`list_accounts`); per-platform required fields (Reddit `sr`-style lookups, Pinterest boards, TikTok privacy, YouTube `madeForKids`…) are discovered via `describe_platform` + `run_account_tool` and passed through `accountOverrides[{ accountId, fields }]`.

### Errors

Tool failures return `{ "error": { "code", "message", "details"? } }` as text content with `isError: true` — the same envelope the REST API and CLI emit.

## Development

```bash
bun install
bun run build       # tsup → dist/index.js (SDK inlined)
bun test            # vitest: MCP client over in-memory transport (manifest + flows)
node test/live-stdio.mjs   # live integration over real stdio (needs POSTBUZZ_API_KEY)
```

`createServer({ apiKey, apiUrl? })` (exported from `dist/index.js`) builds the transport-agnostic `McpServer`.

## License

MIT
