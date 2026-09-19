/**
 * Offline copy of the post.buzz platform reference (capabilities + publish
 * field schemas), sourced from apps/api/lib/platform-reference.ts. Backs
 * `platforms:describe`, which needs no API key. Re-sync when the API copy
 * changes.
 */


/** One field in a platform's publish schema, as surfaced to describe_platform. */
export interface PlatformField {
  /** Field key the publish path reads (a `PlatformPublishInput` member or a
   *  key read out of its `fields` record). */
  name: string;
  /** JSON primitive the field accepts — kept narrow so the MCP can hint it. */
  type: "string" | "number" | "boolean";
  /** `true` only when the platform client throws if the field is absent. */
  required: boolean;
  /** Accepted values, default behaviour, and an example, where useful. */
  notes?: string;
}

/** A platform's adapter capabilities + publish field schema. */
export interface PlatformReferenceEntry {
  /** Adapter operations implemented for this platform, sourced from
   *  `./platforms/capabilities.ts` (reply / dm / listen). */
  capabilities: string[];
  /** Publish inputs the platform consumes, curated from its client. */
  fields: PlatformField[];
}

export const PLATFORM_REFERENCE: Record<string, PlatformReferenceEntry> = {
  instagram: {
    // capabilities.ts: instagram { reply, dm, listen }
    capabilities: ["reply", "dm", "listen"],
    fields: [
      {
        name: "postType",
        type: "string",
        required: false,
        notes:
          "Container format: post | story | reel | carousel. Drives the media container's media_type; defaults to a single image post when omitted.",
      },
      {
        name: "media",
        type: "string",
        required: true,
        notes:
          "Image or video URL (mediaUrls[0]). Text-only posts are not supported — the client throws when no media is supplied.",
      },
      {
        name: "caption",
        type: "string",
        required: false,
        notes: "Caption text (IG limit 2200).",
      },
      {
        name: "collaborators",
        type: "string",
        required: false,
        notes:
          "Comma-separated Instagram usernames to invite as collaborators (up to 3).",
      },
    ],
  },
  "instagram-business": {
    // capabilities.ts: instagram-business { reply, dm, listen } (same factory client as instagram)
    capabilities: ["reply", "dm", "listen"],
    fields: [
      {
        name: "postType",
        type: "string",
        required: false,
        notes:
          "Container format: post | story | reel | carousel. Drives the media container's media_type; defaults to a single image post when omitted.",
      },
      {
        name: "media",
        type: "string",
        required: true,
        notes:
          "Image or video URL (mediaUrls[0]). Text-only posts are not supported — the client throws when no media is supplied.",
      },
      {
        name: "caption",
        type: "string",
        required: false,
        notes: "Caption text (IG limit 2200).",
      },
      {
        name: "collaborators",
        type: "string",
        required: false,
        notes:
          "Comma-separated Instagram usernames to invite as collaborators (up to 3).",
      },
    ],
  },

  facebook: {
    // capabilities.ts: facebook { reply, dm, listen }
    capabilities: ["reply", "dm", "listen"],
    fields: [
      {
        name: "caption",
        type: "string",
        required: false,
        notes: "Post message (photo) or video description.",
      },
      {
        name: "media",
        type: "string",
        required: false,
        notes:
          "Image URL (posted to /photos) or video URL (posted to /videos; detected by extension). Text-only status posts are supported when omitted.",
      },
      {
        name: "postType",
        type: "string",
        required: false,
        notes:
          "Declared formats: post | story | reel. Stories publish via /photo_stories & /video_stories; reels via /video_reels; posts via /photos, /videos, and /feed.",
      },
    ],
  },

  x: {
    // capabilities.ts: x { reply, dm, listen }
    capabilities: ["reply", "dm", "listen"],
    fields: [
      {
        name: "caption",
        type: "string",
        required: false,
        notes: "Tweet text; required for a text-only tweet.",
      },
      {
        name: "media",
        type: "string",
        required: false,
        notes:
          "Media URL appended to the tweet text as a fallback (native v1.1 media/upload is not wired in this path).",
      },
    ],
  },

  threads: {
    // capabilities.ts: threads { reply, listen }
    capabilities: ["reply", "listen"],
    fields: [
      {
        name: "caption",
        type: "string",
        required: false,
        notes:
          "Optional text for media posts; required for a text-only thread (media_type TEXT).",
      },
      {
        name: "media",
        type: "string",
        required: false,
        notes:
          "Image or video URL (media_type IMAGE/VIDEO detected by extension). Text-only threads are supported when omitted. Two or more URLs publish as a carousel (CAROUSEL container referencing one child container per item).",
      },
      {
        name: "postType",
        type: "string",
        required: false,
        notes:
          "Declared formats: post | reel. firstComment, when set, is published as a TEXT reply container (reply_to_id) on the new post — best-effort.",
      },
    ],
  },

  linkedin: {
    // capabilities.ts: linkedin { reply, listen }
    capabilities: ["reply", "listen"],
    fields: [
      {
        name: "caption",
        type: "string",
        required: false,
        notes:
          "Sent as `commentary`, which the Posts API requires to be present (an empty string is sent when caption is absent).",
      },
      {
        name: "postType",
        type: "string",
        required: false,
        notes:
          "post | poll (content.poll from the poll input) | document (media PDF).",
      },
      {
        name: "visibility",
        type: "string",
        required: false,
        notes:
          "Read from fields.visibility and mapped to a LinkedIn visibility code, e.g. PUBLIC | CONNECTIONS | LOGGED_IN_MEMBERS.",
      },
    ],
  },

  youtube: {
    // capabilities.ts: youtube { reply, listen }
    capabilities: ["reply", "listen"],
    fields: [
      {
        name: "media",
        type: "string",
        required: true,
        notes:
          "Video file URL (mediaUrls[0]). Text-only uploads are not supported — the client throws when no media is supplied.",
      },
      {
        name: "postType",
        type: "string",
        required: false,
        notes: "Declared formats: reel (Short) | longForm.",
      },
      {
        name: "title",
        type: "string",
        required: false,
        notes:
          "Read from fields.title; defaults to the caption truncated to 100 chars (example: 'Q3 Product Update').",
      },
      {
        name: "privacyStatus",
        type: "string",
        required: false,
        notes:
          "Read from fields.privacyStatus; one of public | unlisted | private; defaults to public.",
      },
    ],
  },

  tiktok: {
    // capabilities.ts: tiktok { reply }
    capabilities: ["reply"],
    fields: [
      {
        name: "media",
        type: "string",
        required: true,
        notes:
          "Video URL or image URL(s) (mediaUrls[0]); photo vs video mode is inferred from the extension. Text-only posts are not supported — the client throws when no media is supplied.",
      },
      {
        name: "postType",
        type: "string",
        required: false,
        notes: "Declared formats: post | reel.",
      },
      {
        name: "privacyStatus",
        type: "string",
        required: false,
        notes:
          "Read from fields.privacyStatus and resolved against the creator's allowed options, e.g. PUBLIC | PRIVATE | FRIENDS.",
      },
    ],
  },

  reddit: {
    // capabilities.ts: reddit { reply, dm, listen }
    capabilities: ["reply", "dm", "listen"],
    fields: [
      {
        name: "caption",
        type: "string",
        required: false,
        notes:
          "Used as the post title (max 300) and self-post body; defaults to 'Untitled'.",
      },
      {
        name: "postType",
        type: "string",
        required: false,
        notes:
          "post (self/text or link) | carousel (image gallery via submit_gallery_post). Polls are declared but cannot be created via the API.",
      },
      {
        name: "media",
        type: "string",
        required: false,
        notes:
          "Link URL (mediaUrls[0]) for a link post; omit for a self/text post.",
      },
      {
        name: "subreddit",
        type: "string",
        required: false,
        notes:
          "Target subreddit name via fields.subreddit (a leading r/ is stripped). Omit to submit to the authenticated user's profile (u_<username>).",
      },
    ],
  },

  pinterest: {
    // capabilities.ts: pinterest {} (no adapter ops)
    capabilities: [],
    fields: [
      {
        name: "media",
        type: "string",
        required: true,
        notes:
          "Image URL (mediaUrls[0]); text-only pins are not supported — the client throws when no media is supplied.",
      },
      {
        name: "title",
        type: "string",
        required: false,
        notes:
          "Read from fields.title; defaults to the caption truncated to 100 chars.",
      },
    ],
  },

  discord: {
    // capabilities.ts: discord { reply, dm }
    capabilities: ["reply", "dm"],
    fields: [
      {
        name: "caption",
        type: "string",
        required: false,
        notes:
          "Message content; posted to the channel stored on the account (platformId = channel id).",
      },
    ],
  },

  slack: {
    // capabilities.ts: slack { reply, dm, listen }
    capabilities: ["reply", "dm", "listen"],
    fields: [
      {
        name: "caption",
        type: "string",
        required: false,
        notes:
          "Message text; posted to the channel stored on the account (platformId = channel id).",
      },
      {
        name: "media",
        type: "string",
        required: false,
        notes: "Image URL rendered as an image block.",
      },
    ],
  },

  telegram: {
    // capabilities.ts: telegram { reply, dm }
    capabilities: ["reply", "dm"],
    fields: [
      {
        name: "caption",
        type: "string",
        required: false,
        notes:
          "Message text (HTML parse_mode) or photo caption (max 1024); sent to the chat stored on the account (platformId = chat id).",
      },
      {
        name: "media",
        type: "string",
        required: false,
        notes: "Photo URL (mediaUrls[0]); sent via sendPhoto when present.",
      },
    ],
  },

  mastodon: {
    // capabilities.ts: mastodon { reply, dm, listen, delete, edit }
    capabilities: ["reply", "dm", "listen"],
    fields: [
      {
        name: "caption",
        type: "string",
        required: false,
        notes:
          "Status text. firstComment, when set, is published as a self-reply (in_reply_to_id) — best-effort.",
      },
      {
        name: "media",
        type: "string",
        required: false,
        notes:
          "Up to 4 media attachment URLs (uploaded then attached as media_ids).",
      },
    ],
  },

  bluesky: {
    // capabilities.ts: bluesky { reply, listen, delete }
    capabilities: ["reply", "listen"],
    fields: [
      {
        name: "caption",
        type: "string",
        required: false,
        notes:
          "Post record text. firstComment, when set, is published as a reply whose root and parent are the new post — best-effort.",
      },
      {
        name: "media",
        type: "string",
        required: false,
        notes:
          "Up to 4 image URLs; embedded as images with the caption reused as alt text.",
      },
    ],
  },

  dribbble: {
    // capabilities.ts: dribbble {} (no adapter ops)
    capabilities: [],
    fields: [
      {
        name: "media",
        type: "string",
        required: true,
        notes:
          "Image URL (mediaUrls[0]); text-only shots are not supported — the client throws when no media is supplied.",
      },
      {
        name: "caption",
        type: "string",
        required: false,
        notes: "Used as the shot title (max 100) and description.",
      },
    ],
  },

  "google-my-business": {
    // capabilities.ts: google-my-business {} (no adapter ops)
    capabilities: [],
    fields: [
      {
        name: "caption",
        type: "string",
        required: false,
        notes: "Local post summary text.",
      },
      {
        name: "media",
        type: "string",
        required: false,
        notes:
          "Photo URL; also reused as the call-to-action (LEARN_MORE) URL when present.",
      },
    ],
  },
};
