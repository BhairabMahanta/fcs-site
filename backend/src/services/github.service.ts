import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { IMAGE_EXTENSION, sniffImageType } from "../lib/image.js";

const ASSETS_REPO = "TheFreeCodeSubculture/fcs-assets";
const SITE_REPO = "TheFreeCodeSubculture/fcs-site";
const WORKFLOW = "pages.yml";
export const MAX_BLOG_IMAGE_BYTES = 2 * 1024 * 1024;

function assetPath(now: Date, id: string, extension: string): string {
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `blog/${now.getUTCFullYear()}/${month}/${id}.${extension}`;
}

function cdnURL(sha: string, path: string): string {
  return `https://cdn.jsdelivr.net/gh/${ASSETS_REPO}@${sha}/${path}`;
}

async function github(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
      "user-agent": "fcs-backend",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
}

export async function uploadBlogImage(
  file: { size: number; buffer: Buffer } | undefined,
) {
  if (!config.GITHUB_ASSETS_TOKEN) {
    throw new HttpError(
      501,
      "Blog image upload is not configured: set GITHUB_ASSETS_TOKEN.",
    );
  }

  if (!file) throw new HttpError(400, "Send an image in the `file` field.");
  if (file.size > MAX_BLOG_IMAGE_BYTES) {
    throw new HttpError(400, "That image is over 2 MB. Shrink it and try again.");
  }

  const type = sniffImageType(file.buffer);
  if (!type) {
    throw new HttpError(400, "Use a JPG, PNG or WebP image.");
  }

  const id = randomUUID();
  const path = assetPath(new Date(), id, IMAGE_EXTENSION[type]);

  const response = await github(
    `/repos/${ASSETS_REPO}/contents/${path}`,
    config.GITHUB_ASSETS_TOKEN,
    {
      method: "PUT",
      body: JSON.stringify({
        message: `Add ${path}`,
        content: file.buffer.toString("base64"),
      }),
    },
  );

  if (response.status !== 201) {
    const detail = (await response.text()).slice(0, 200);
    throw new HttpError(
      502,
      `GitHub refused the image (${response.status}). Try again in a moment. ${detail}`,
    );
  }

  const data = (await response.json()) as { commit: { sha: string } };
  return { url: cdnURL(data.commit.sha, path) };
}

export async function refreshSite() {
  if (!config.GITHUB_DISPATCH_TOKEN) {
    throw new HttpError(
      501,
      "Refreshing is not configured: set GITHUB_DISPATCH_TOKEN.",
    );
  }

  const response = await github(
    `/repos/${SITE_REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    config.GITHUB_DISPATCH_TOKEN,
    {
      method: "POST",
      body: JSON.stringify({ ref: "master" }),
    },
  );

  if (response.status !== 204) {
    const detail = (await response.text()).slice(0, 200);
    throw new HttpError(
      502,
      `GitHub refused the deploy (${response.status}): ${detail}`,
    );
  }

  return { ok: true };
}
