/**
 * createServer({ apiKey, apiUrl }) — a transport-agnostic McpServer wrapping
 * the post.buzz SDK. The tool list mirrors the REST v1 surface 1:1 (the same
 * routes the postbuzz CLI drives): check_setup, describe_platform,
 * create_post, schedule_post, and so on.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PostBuzz, PostBuzzError } from "postbuzz";
import { PLATFORM_REFERENCE } from "./platform-reference.js";
import { guard } from "./tool-utils.js";
import { readFileSync } from "node:fs";

export interface CreateServerOptions {
  apiKey: string;
  apiUrl?: string;
  fetch?: typeof globalThis.fetch;
}

function sniffMime(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    mp4: "video/mp4",
    mov: "video/quicktime",
    webm: "video/webm",
    m4v: "video/x-m4v",
    pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

export function createServer(opts: CreateServerOptions): McpServer {
  const pb = new PostBuzz({
    apiKey: opts.apiKey,
    ...(opts.apiUrl ? { baseUrl: opts.apiUrl } : {}),
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  });
  const pkgVersion = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { version: string };

  const server = new McpServer(
    { name: "postbuzz", version: pkgVersion.version },
    { capabilities: { tools: {} } },
  );

  const t = server.registerTool.bind(server);
  const shape = z;

  // -----------------------------------------------------------------------
  // Diagnostics + reference
  // -----------------------------------------------------------------------

  t(
    "check_setup",
    {
      title: "Check setup",
      description:
        "Verify the API key, connectivity, connected accounts, and quota. Run this first before any other tool.",
      inputSchema: {},
    },
    guard(() => pb.organization.checkSetup()),
  );

  t(
    "describe_platform",
    {
      title: "Describe platform",
      description:
        "Per-platform publish field schemas and adapter capabilities. Call before create_post/create_comment to learn required fields. Offline — no API call.",
      inputSchema: {
        platform: z
          .string()
          .optional()
          .describe(
            `Platform key (${Object.keys(PLATFORM_REFERENCE).join(", ")}). Omit for a summary of all platforms.`,
          ),
      },
    },
    ({ platform }) =>
      guard(async () => {
        if (!platform) {
          return Object.fromEntries(
            Object.entries(PLATFORM_REFERENCE).map(([key, entry]) => [
              key,
              {
                capabilities: entry.capabilities,
                requiredFields: entry.fields
                  .filter((f) => f.required)
                  .map((f) => f.name),
              },
            ]),
          );
        }
        const entry = PLATFORM_REFERENCE[platform];
        if (!entry) {
          throw new PostBuzzError({
            status: 0,
            code: "UNKNOWN_PLATFORM",
            message: `Unknown platform: ${platform}`,
            details: { available: Object.keys(PLATFORM_REFERENCE) },
          });
        }
        return { platform, ...entry };
      })(),
  );

  // -----------------------------------------------------------------------
  // Organization + usage
  // -----------------------------------------------------------------------

  t(
    "get_organization",
    {
      title: "Get organization",
      description: "Plan, limits, and connected-account summary.",
      inputSchema: {},
    },
    guard(() => pb.organization.get()),
  );

  t(
    "get_usage",
    {
      title: "Get usage",
      description: "Monthly post usage, plan limit, and credit balance.",
      inputSchema: {},
    },
    guard(() => pb.organization.usage()),
  );

  // -----------------------------------------------------------------------
  // Accounts (integrations)
  // -----------------------------------------------------------------------

  t(
    "list_accounts",
    {
      title: "List accounts",
      description: "Connected social accounts (id, platform, username).",
      inputSchema: {
        platform: z.string().optional().describe("Filter by platform key"),
      },
    },
    guard(async ({ platform }) => {
      const items = await pb.accounts.list();
      return platform ? items.filter((a) => a.platform === platform) : items;
    }),
  );

  t(
    "get_account",
    {
      title: "Get account",
      description:
        "One connected account: profile, follower count, token health (disconnectedAt / tokenExpiresAt).",
      inputSchema: { accountId: z.string() },
    },
    ({ accountId }) => guard(() => pb.accounts.get(accountId))(),
  );

  t(
    "connect_account",
    {
      title: "Connect account",
      description:
        "Build the OAuth authorize URL for a platform; the user opens it in a browser to connect.",
      inputSchema: {
        platform: z.string().describe("Platform key (see describe_platform)"),
        client: z.enum(["web", "mobile"]).optional(),
      },
    },
    ({ platform, client }) =>
      guard(() =>
        pb.accounts.connectUrl(platform, { client: client ?? "web" }),
      )(),
  );

  t(
    "disconnect_account",
    {
      title: "Disconnect account",
      description:
        "Disconnect an account. Cascades pending schedules, comment automation, inbox, goals, and agents; published history is kept.",
      inputSchema: { accountId: z.string() },
    },
    ({ accountId }) => guard(() => pb.accounts.disconnect(accountId))(),
  );

  t(
    "refresh_account",
    {
      title: "Refresh account",
      description: "Refresh an account's OAuth access token server-side.",
      inputSchema: { accountId: z.string() },
    },
    ({ accountId }) => guard(() => pb.accounts.refresh(accountId))(),
  );

  t(
    "list_account_tools",
    {
      title: "List account tools",
      description:
        "Per-account live lookups available for the account's platform (e.g. Reddit flairs, Pinterest boards).",
      inputSchema: { accountId: z.string() },
    },
    ({ accountId }) => guard(() => pb.accounts.tools(accountId))(),
  );

  t(
    "run_account_tool",
    {
      title: "Run account tool",
      description:
        "Run a per-account lookup: reddit-flairs (input { subreddit }) or pinterest-boards (input {}). Use before creating posts that need a flair or board id.",
      inputSchema: {
        accountId: z.string(),
        tool: z.string().describe("Tool name from list_account_tools"),
        input: z.record(shape.string(), shape.unknown()).optional(),
      },
    },
    ({ accountId, tool, input }) =>
      guard(() =>
        pb.accounts.runTool(
          accountId,
          tool as "reddit-flairs" | "pinterest-boards",
          input ?? {},
        ),
      )(),
  );

  // -----------------------------------------------------------------------
  // Posts
  // -----------------------------------------------------------------------

  const postInput = {
    caption: z.string().optional().describe("Post caption text"),
    accountIds: z
      .array(z.string())
      .min(1)
      .describe("Target account ids (list_accounts)"),
    mediaIds: z.array(z.string()).optional().describe("Media ids to attach"),
    firstComment: z
      .string()
      .optional()
      .describe("Comment published right after the post"),
    postType: z
      .string()
      .optional()
      .describe("Format: post | story | reel | carousel | thread | poll …"),
    accountOverrides: z
      .array(
        z.object({
          accountId: z.string(),
          captionOverride: z.string().nullable().optional(),
          fields: z.record(shape.string(), shape.string()).optional(),
        }),
      )
      .optional()
      .describe("Per-channel caption/field overrides"),
    threadParts: z
      .record(shape.string(), z.array(z.string().min(1)))
      .nullish()
      .describe("Thread renditions keyed by accountId (postType 'thread')"),
  };

  t(
    "create_post",
    {
      title: "Create post",
      description:
        "Create a post (saved as a draft — no scheduledAt). Call describe_platform first for per-platform required fields.",
      inputSchema: postInput,
    },
    (args) =>
      guard(() =>
        pb.posts.create({
          caption: args.caption,
          accountIds: args.accountIds,
          mediaIds: args.mediaIds,
          firstComment: args.firstComment,
          postType: args.postType,
          accountOverrides: args.accountOverrides,
          threadParts: args.threadParts ?? undefined,
        }),
      )(),
  );

  t(
    "schedule_post",
    {
      title: "Schedule post",
      description:
        "Create a post scheduled for an ISO 8601 time (e.g. 2026-10-01T09:00:00Z).",
      inputSchema: {
        ...postInput,
        scheduledAt: z
          .string()
          .describe("ISO 8601 datetime (UTC recommended)"),
      },
    },
    (args) =>
      guard(() =>
        pb.posts.create({
          caption: args.caption,
          accountIds: args.accountIds,
          mediaIds: args.mediaIds,
          firstComment: args.firstComment,
          postType: args.postType,
          accountOverrides: args.accountOverrides,
          threadParts: args.threadParts ?? undefined,
          scheduledAt: args.scheduledAt,
        }),
      )(),
  );

  t(
    "list_posts",
    {
      title: "List posts",
      description: "List posts with optional filters and pagination.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
        status: z
          .enum(["draft", "scheduled", "publishing", "published", "failed"])
          .optional(),
        q: z.string().optional().describe("Caption substring filter"),
      },
    },
    (args) => guard(() => pb.posts.list(args))(),
  );

  t(
    "get_post",
    {
      title: "Get post",
      description:
        "Fetch one post with its accounts (permalinks, overrides) and media.",
      inputSchema: { postId: z.string() },
    },
    ({ postId }) => guard(() => pb.posts.get(postId))(),
  );

  t(
    "update_post",
    {
      title: "Update post",
      description:
        "Partially update a post: caption, media, schedule (scheduledAt; null clears it → draft), status, poll, thread.",
      inputSchema: {
        postId: z.string(),
        caption: z.string().optional(),
        firstComment: z.string().nullable().optional(),
        postType: z.string().optional(),
        status: z.enum(["draft", "scheduled", "published", "failed"]).optional(),
        scheduledAt: z
          .string()
          .nullable()
          .optional()
          .describe("New ISO 8601 time; null clears the schedule"),
        delayMinutes: z.number().int().min(0).nullable().optional(),
        accountIds: z.array(z.string()).optional(),
        accountOverrides: z
          .array(
            z.object({
              accountId: z.string(),
              captionOverride: z.string().nullable().optional(),
              fields: z.record(shape.string(), shape.string()).optional(),
            }),
          )
          .optional(),
        mediaIds: z.array(z.string()).optional(),
        poll: z
          .object({
            question: z.string(),
            options: z.array(z.string()),
            durationDays: z.number().int().min(1),
          })
          .nullable()
          .optional(),
        threadParts: z
          .record(shape.string(), z.array(z.string().min(1)))
          .nullish(),
      },
    },
    ({ postId, ...input }) => guard(() => pb.posts.update(postId, input))(),
  );

  t(
    "delete_post",
    {
      title: "Delete post",
      description: "Delete a draft/scheduled post (published posts are kept).",
      inputSchema: { postId: z.string() },
    },
    ({ postId }) => guard(() => pb.posts.delete(postId))(),
  );

  t(
    "retry_post",
    {
      title: "Retry post",
      description: "Re-queue a post's failed schedules for another attempt.",
      inputSchema: { postId: z.string() },
    },
    ({ postId }) => guard(() => pb.posts.retry(postId))(),
  );

  t(
    "reschedule_post",
    {
      title: "Reschedule post",
      description: "Move a post's target time (ISO 8601).",
      inputSchema: {
        postId: z.string(),
        scheduledAt: z.string().describe("New ISO 8601 datetime"),
      },
    },
    ({ postId, scheduledAt }) =>
      guard(() => pb.posts.reschedule(postId, scheduledAt))(),
  );

  // -----------------------------------------------------------------------
  // Comments
  // -----------------------------------------------------------------------

  t(
    "create_comment",
    {
      title: "Create comment",
      description:
        "Create a comment on a post by the given account. Omit scheduledAt to publish immediately; pass parentCommentId to reply to another scheduled comment.",
      inputSchema: {
        postId: z.string(),
        accountId: z.string().describe("Account that will comment"),
        text: z.string().min(1),
        scheduledAt: z.string().optional().describe("ISO 8601; omit for now"),
        parentCommentId: z.string().optional(),
      },
    },
    (args) => guard(() => pb.comments.create(args))(),
  );

  t(
    "list_comments",
    {
      title: "List comments",
      description: "Scheduled comments for a post.",
      inputSchema: {
        postId: z.string(),
        status: z.enum(["pending", "published", "failed"]).optional(),
      },
    },
    (args) => guard(() => pb.comments.list(args))(),
  );

  t(
    "get_comment",
    {
      title: "Get comment",
      description: "Fetch one scheduled comment.",
      inputSchema: { commentId: z.string() },
    },
    ({ commentId }) => guard(() => pb.comments.get(commentId))(),
  );

  t(
    "update_comment",
    {
      title: "Update comment",
      description: "Edit a pending comment's text and/or due time.",
      inputSchema: {
        commentId: z.string(),
        text: z.string().min(1).optional(),
        scheduledAt: z.string().optional(),
      },
    },
    ({ commentId, ...input }) =>
      guard(() => pb.comments.update(commentId, input))(),
  );

  t(
    "delete_comment",
    {
      title: "Delete comment",
      description: "Delete a pending comment.",
      inputSchema: { commentId: z.string() },
    },
    ({ commentId }) => guard(() => pb.comments.delete(commentId))(),
  );

  t(
    "retry_comment",
    {
      title: "Retry comment",
      description: "Publish a pending/failed comment now.",
      inputSchema: { commentId: z.string() },
    },
    ({ commentId }) => guard(() => pb.comments.retry(commentId))(),
  );

  // -----------------------------------------------------------------------
  // Inbox (engagement)
  // -----------------------------------------------------------------------

  t(
    "list_inbox",
    {
      title: "List inbox",
      description:
        "Incoming comments, mentions, and DMs across accessible accounts.",
      inputSchema: {
        status: z.enum(["unread", "read", "replied"]).optional(),
        sourceType: z.enum(["comment", "mention", "dm"]).optional(),
        platform: z.string().optional(),
        accountId: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    (args) => guard(() => pb.inbox.list(args))(),
  );

  t(
    "reply_to_inbox_item",
    {
      title: "Reply to inbox item",
      description: "Reply to a comment/mention/DM.",
      inputSchema: { itemId: z.string(), message: z.string().min(1) },
    },
    ({ itemId, message }) => guard(() => pb.inbox.reply(itemId, message))(),
  );

  t(
    "edit_inbox_reply",
    {
      title: "Edit inbox reply",
      description:
        "Edit a reply already sent (currently Facebook only — others return a platform error).",
      inputSchema: {
        itemId: z.string(),
        replyId: z.string(),
        message: z.string().min(1),
      },
    },
    ({ itemId, replyId, message }) =>
      guard(() => pb.inbox.editReply(itemId, replyId, message))(),
  );

  // -----------------------------------------------------------------------
  // Media
  // -----------------------------------------------------------------------

  t(
    "upload_media",
    {
      title: "Upload media",
      description:
        "Upload media from a public URL or a local file path. Returns the media row whose id posts reference via mediaIds.",
      inputSchema: {
        url: z.string().optional().describe("Public media URL"),
        path: z.string().optional().describe("Local file path"),
        mediaType: z.enum(["image", "video", "document"]).optional(),
      },
    },
    guard(async ({ url, path, mediaType }) => {
      if (url) {
        return pb.media.createFromUrl({ url, mediaType });
      }
      if (path) {
        const bytes = readFileSync(path);
        const name = path.split("/").pop() ?? "upload";
        return pb.media.uploadFile({
          file: new File([new Uint8Array(bytes)], name, {
            type: sniffMime(path),
          }),
          mediaType,
        });
      }
      throw new PostBuzzError({
        status: 0,
        code: "MISSING_PARAMS",
        message: "Pass either url or path.",
      });
    }),
  );

  t(
    "list_media",
    {
      title: "List media",
      description: "List uploaded media.",
      inputSchema: {
        type: z.enum(["image", "video"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    (args) => guard(() => pb.media.list(args))(),
  );

  t(
    "get_media",
    {
      title: "Get media",
      description: "Fetch one media item.",
      inputSchema: { mediaId: z.string() },
    },
    ({ mediaId }) => guard(() => pb.media.get(mediaId))(),
  );

  t(
    "delete_media",
    {
      title: "Delete media",
      description: "Delete one media item.",
      inputSchema: { mediaId: z.string() },
    },
    ({ mediaId }) => guard(() => pb.media.delete(mediaId))(),
  );

  t(
    "delete_media_many",
    {
      title: "Delete media many",
      description: "Delete several media items; reports per-id outcomes.",
      inputSchema: { mediaIds: z.array(z.string()).min(1) },
    },
    guard(async ({ mediaIds }) => {
      const results = [];
      for (const id of mediaIds) {
        try {
          await pb.media.delete(id);
          results.push({ id, deleted: true });
        } catch (err) {
          results.push({
            id,
            deleted: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return results;
    }),
  );

  // -----------------------------------------------------------------------
  // Analytics
  // -----------------------------------------------------------------------

  t(
    "get_post_analytics",
    {
      title: "Get post analytics",
      description: "One post's metrics (likes, comments, reach, …).",
      inputSchema: { postId: z.string() },
    },
    ({ postId }) => guard(() => pb.posts.analytics(postId))(),
  );

  t(
    "get_account_analytics",
    {
      title: "Get account analytics",
      description: "An account's engagement summary over a window.",
      inputSchema: {
        accountId: z.string(),
        windowDays: z.number().int().min(1).optional(),
      },
    },
    ({ accountId, windowDays }) =>
      guard(() => pb.accounts.analytics(accountId, { windowDays }))(),
  );

  t(
    "get_bulk_post_analytics",
    {
      title: "Get bulk post analytics",
      description: "Analytics for up to 60 posts; per-post errors included.",
      inputSchema: {
        postIds: z.array(z.string()).min(1).max(60),
      },
    },
    guard(async ({ postIds }) => {
      return Promise.all(
        postIds.map(async (id) => {
          try {
            return { postId: id, insight: await pb.posts.analytics(id) };
          } catch (err) {
            if (err instanceof PostBuzzError) {
              return { postId: id, error: { code: err.code, message: err.message } };
            }
            throw err;
          }
        }),
      );
    }),
  );

  t(
    "refresh_analytics",
    {
      title: "Refresh analytics",
      description:
        "Enqueue an async analytics backfill for a post or account (job id returned).",
      inputSchema: {
        postId: z.string().optional(),
        accountId: z.string().optional(),
        windowDays: z.number().int().min(1).optional(),
        limit: z.number().int().min(1).optional(),
      },
    },
    guard(async ({ postId, accountId, windowDays, limit }) => {
      if (!postId && !accountId) {
        throw new PostBuzzError({
          status: 0,
          code: "MISSING_PARAMS",
          message: "Pass either postId or accountId.",
        });
      }
      const input = { windowDays, limit };
      return postId
        ? pb.posts.refreshAnalytics(postId, input)
        : pb.accounts.refreshAnalytics(accountId!, input);
    }),
  );

  t(
    "get_analytics_summary",
    {
      title: "Get analytics summary",
      description: "Latest analytics row per accessible account in the window.",
      inputSchema: { windowDays: z.number().int().min(1).optional() },
    },
    ({ windowDays }) =>
      guard(() => pb.analytics.summary({ windowDays }))(),
  );

  t(
    "get_best_times",
    {
      title: "Get best times",
      description:
        "Recommended posting times from engagement history (optionally per account).",
      inputSchema: { accountId: z.string().optional() },
    },
    ({ accountId }) =>
      guard(() => pb.analytics.bestTimes({ accountId }))(),
  );

  // -----------------------------------------------------------------------
  // Teams
  // -----------------------------------------------------------------------

  t(
    "list_teams",
    { title: "List teams", description: "Teams with their member accounts.", inputSchema: {} },
    guard(() => pb.teams.list()),
  );

  t(
    "get_team",
    { title: "Get team", description: "One team with its member accounts.", inputSchema: { teamId: z.string() } },
    ({ teamId }) => guard(() => pb.teams.get(teamId))(),
  );

  t(
    "create_team",
    {
      title: "Create team",
      description: "Create a team (optionally assigning accounts).",
      inputSchema: {
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(40).optional(),
        description: z.string().max(280).optional(),
        avatarUrl: z.string().url().optional(),
        accountIds: z.array(z.string()).optional(),
      },
    },
    (args) => guard(() => pb.teams.create(args))(),
  );

  t(
    "update_team",
    {
      title: "Update team",
      description: "Rename/re-describe a team or reassign its accounts.",
      inputSchema: {
        teamId: z.string(),
        name: z.string().min(1).max(100).optional(),
        slug: z.string().min(1).max(40).optional(),
        description: z.string().max(280).nullable().optional(),
        avatarUrl: z.string().url().nullable().optional(),
        accountIds: z.array(z.string()).optional(),
      },
    },
    ({ teamId, ...input }) => guard(() => pb.teams.update(teamId, input))(),
  );

  t(
    "delete_team",
    {
      title: "Delete team",
      description: "Delete a team that no longer owns accounts.",
      inputSchema: { teamId: z.string() },
    },
    ({ teamId }) => guard(() => pb.teams.delete(teamId))(),
  );

  t(
    "add_team_account",
    {
      title: "Add team account",
      description: "Assign an account to a team.",
      inputSchema: { teamId: z.string(), accountId: z.string() },
    },
    ({ teamId, accountId }) =>
      guard(() => pb.teams.addAccount(teamId, accountId))(),
  );

  t(
    "remove_team_account",
    {
      title: "Remove team account",
      description: "Remove an account from a team (reassigned to the default team).",
      inputSchema: { teamId: z.string(), accountId: z.string() },
    },
    ({ teamId, accountId }) =>
      guard(() => pb.teams.removeAccount(teamId, accountId))(),
  );

  // -----------------------------------------------------------------------
  // CSV import
  // -----------------------------------------------------------------------

  t(
    "create_post_csv_import",
    {
      title: "Create post CSV import",
      description:
        "Bulk-create posts from CSV text or a public CSV URL. Columns include caption and accountId.",
      inputSchema: {
        csv: z.string().optional().describe("Raw CSV text"),
        url: z.string().optional().describe("Public CSV URL"),
      },
    },
    (args) => guard(() => pb.imports.createPostCsv(args))(),
  );

  t(
    "list_post_csv_imports",
    {
      title: "List post CSV imports",
      description: "The caller's CSV import jobs with counts.",
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    (args) => guard(() => pb.imports.listPostCsv(args))(),
  );

  t(
    "get_post_csv_import",
    {
      title: "Get post CSV import",
      description: "One import job's summary.",
      inputSchema: { jobId: z.string() },
    },
    ({ jobId }) => guard(() => pb.imports.getPostCsv(jobId))(),
  );

  t(
    "get_post_csv_import_rows",
    {
      title: "Get post CSV import rows",
      description: "Per-row SUCCESS/FAILED results for an import job.",
      inputSchema: {
        jobId: z.string(),
        status: z.enum(["SUCCESS", "FAILED"]).optional(),
        limit: z.number().int().min(1).max(500).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    ({ jobId, ...rest }) =>
      guard(() => pb.imports.listPostCsvRows(jobId, rest))(),
  );

  t(
    "retry_post_csv_import",
    {
      title: "Retry post CSV import",
      description: "Re-run an import job's failed rows.",
      inputSchema: { jobId: z.string() },
    },
    ({ jobId }) => guard(() => pb.imports.retryPostCsv(jobId))(),
  );

  return server;
}
