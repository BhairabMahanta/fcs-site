/*
 * js/session-init.js
 * ------------------------------------------------------------------
 * Runs in <head>, before the stylesheet and before the module graph.
 * If a member session is already in localStorage, mark the document so
 * CSS can paint the profile circle immediately instead of flashing the
 * static Login button while auth.js loads.
 * ------------------------------------------------------------------
 */
(function () {
  const root = document.documentElement;
  const KEY = "fcs-api-session";
  const COLORS = ["#c78b1d", "#d9730d", "#448361", "#337ea9", "#9065b0", "#c14c8a", "#d44c47", "#9f6b53"];

  let session = null;
  try {
    session = JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    session = null;
  }

  const user = session && session.user;
  if (!user) {
    root.dataset.auth = "out";
    return;
  }

  const name = String(user.display_name || user.email || "Member").trim();
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

  root.dataset.auth = "in";
  root.style.setProperty("--auth-initials", JSON.stringify(initials));
  root.style.setProperty("--auth-color", COLORS[hash % COLORS.length]);
})();
