/**
 * Tool plumbing shared by every registerTool call: result rendering and the
 * error contract. Errors return `{ error: { code, message, details? } }` as
 * text content with `isError: true` — the same envelope the REST API and CLI
 * emit, so a client (or model) reads failures identically everywhere.
 */

import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { PostBuzzError } from "postbuzz";

export function ok(data: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function fail(err: {
  code: string;
  message: string;
  details?: unknown;
}): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: {
            code: err.code,
            message: err.message,
            ...(err.details !== undefined ? { details: err.details } : {}),
          },
        }),
      },
    ],
    isError: true,
  };
}

/** Wrap a tool handler: PostBuzzError → fail envelope; anything else rethrows
 *  (transport-level failures are the runtime's business). Zero-arg handlers
 *  infer A = void (a `() => …` is assignable to `(args: void) => …`). */
export function guard<A = void>(
  handler: (args: A) => Promise<unknown>,
): (args: A) => Promise<CallToolResult> {
  return async (args: A) => {
    try {
      return ok(await handler(args));
    } catch (err) {
      if (err instanceof PostBuzzError) {
        return fail({
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        });
      }
      throw err;
    }
  };
}
