/*
 * js/lib/avatar.js
 * ------------------------------------------------------------------
 * Small avatar renderer shared by the nav, profile page and blog.
 * Kept separate from blog-pages.js so the login/profile modules do not
 * pull in Markdown, KaTeX and highlight.js just to draw a circle.
 * ------------------------------------------------------------------
 */

const AVATAR_COLORS = [
  "#c78b1d", "#d9730d", "#448361", "#337ea9",
  "#9065b0", "#c14c8a", "#d44c47", "#9f6b53",
];

const esc = (value) =>
  String(value).replace(/[&<>"']/g, (character) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character],
  );

/** A round avatar: the person's photo, or their initials on a colour picked from their name. */
export function avatarHTML(author, cls = "avatar") {
  const name = String(author.name || "?").trim();
  const avatar = String(author.avatar || "");

  // Production pages are HTTPS, so only HTTPS images are allowed there.
  // Local development is served over HTTP, where an HTTP upload is valid.
  const allowHttp = typeof location !== "undefined" && location.protocol === "http:";
  const avatarPattern = allowHttp ? /^https?:\/\/\S+$/i : /^https:\/\/\S+$/i;
  if (avatarPattern.test(avatar)) {
    return `<img class="${cls}" src="${esc(avatar)}" alt="" loading="lazy" />`;
  }

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => [...word][0])
    .join("")
    .toUpperCase() || "?";

  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }

  return `<span class="${cls} avatar-initials" style="background: ${AVATAR_COLORS[hash % AVATAR_COLORS.length]}" aria-hidden="true">${esc(initials)}</span>`;
}
