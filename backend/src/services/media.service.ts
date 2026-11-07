import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import { IMAGE_EXTENSION, sniffImageType } from "../lib/image.js";

const mediaRoot = join(config.MEDIA_DIR, "members");
const avatarRoot = join(mediaRoot, "avatars");

function publicURL(file: string): string {
  return `${config.PUBLIC_API_URL.replace(/\/$/, "")}/media/members/${file}`;
}

function avatarURL(file: string): string {
  return `${config.PUBLIC_API_URL.replace(/\/$/, "")}/media/members/avatars/${file}`;
}

export async function saveMemberAvatar(image: Buffer) {
  const type = sniffImageType(image);
  if (!type) {
    throw new HttpError(400, "Use a JPG, PNG or WebP image.");
  }

  await mkdir(avatarRoot, { recursive: true });

  const file = `${randomUUID()}.${IMAGE_EXTENSION[type]}`;
  await writeFile(join(avatarRoot, file), image, { mode: 0o644 });

  return { file, url: avatarURL(file) };
}

export async function deleteMemberAvatarFile(url: string | null | undefined) {
  if (!url) return;
  const prefix = `${config.PUBLIC_API_URL.replace(/\/$/, "")}/media/members/avatars/`;
  if (!url.startsWith(prefix)) return;

  const file = basename(decodeURIComponent(url.slice(prefix.length)));
  await unlink(join(avatarRoot, file)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function saveMemberPhotos(full: Buffer, thumb: Buffer) {
  const fullType = sniffImageType(full);
  if (!fullType) {
    throw new HttpError(400, "Use a JPG, PNG or WebP image.");
  }
  if (sniffImageType(thumb) !== "image/png") {
    throw new HttpError(400, "The thumbnail must be a PNG image.");
  }

  await mkdir(mediaRoot, { recursive: true });

  const id = randomUUID();
  const fullName = `${id}.${IMAGE_EXTENSION[fullType]}`;
  const thumbName = `${id}-24.png`;

  await writeFile(join(mediaRoot, fullName), full, { mode: 0o644 });
  try {
    await writeFile(join(mediaRoot, thumbName), thumb, { mode: 0o644 });
  } catch (error) {
    await unlink(join(mediaRoot, fullName)).catch(() => undefined);
    throw error;
  }

  return {
    photo_url: publicURL(fullName),
    photo_thumb_url: publicURL(thumbName),
  };
}

export async function deleteMemberPhotos(urls: unknown[]) {
  const prefix = `${config.PUBLIC_API_URL.replace(/\/$/, "")}/media/members/`;

  for (const url of urls) {
    if (typeof url !== "string" || !url.startsWith(prefix)) continue;
    const file = basename(decodeURIComponent(url.slice(prefix.length)));
    await unlink(join(mediaRoot, file)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
