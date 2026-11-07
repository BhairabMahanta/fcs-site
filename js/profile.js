/*
 * js/profile.js
 * ------------------------------------------------------------------
 * The member profile page. Reads the signed-in member from the API,
 * lets them update their details and avatar, and signs them out.
 * No public directory, badges or leaderboards here.
 * ------------------------------------------------------------------
 */

import {
  getProfile,
  getSession,
  removeMyAvatar,
  signOut,
  updateProfile,
  uploadMyAvatar,
} from "./api.js";
import { avatarHTML } from "./lib/avatar.js";
import { escapeAttr, escapeHTML } from "./render.js";

const root = document.getElementById("profile-root");

let profile = null;
let pageNotice = "";
let pageTone = "ok";

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if (!root) return;

  const params = new URLSearchParams(location.search);
  if (params.get("verified") === "1") {
    pageNotice = "Email verified. Welcome to the club.";
  } else if (params.get("reset") === "1") {
    pageNotice = "Password changed. You are signed in.";
  }
  if (pageNotice) {
    history.replaceState(null, "", location.pathname);
  }

  try {
    const session = await getSession();
    if (!session?.user) {
      renderSignedOut();
      return;
    }

    profile = await getProfile();
    document.title = `${profile.display_name || profile.email} | The Free Code Subculture`;
    renderProfile();
  } catch (error) {
    if (error.status === 401) {
      await signOut().catch(() => {});
      renderSignedOut("Your session expired. Sign in again.");
      return;
    }
    renderSignedOut(error.message || "Could not load your profile.");
  }
}

function renderSignedOut(message = "") {
  root.innerHTML = `
    <section class="profile-gate">
      <p class="auth-kicker">// PROFILE</p>
      <h1>Sign in to view your profile</h1>
      <p class="auth-intro">${escapeHTML(message || "Your profile photo and details live here.")}</p>
      <a class="btn-subscribe auth-submit" href="./#login"><span>Sign in</span></a>
      <p class="auth-foot"><a href="./">Back to the RFC</a></p>
    </section>`;
}

function renderProfile() {
  const name = profile.display_name || profile.email || "Member";
  const role = roleLabel(profile.role);
  const joined = formatJoined(profile.created_at);
  const website = safeLink(profile.website_url);
  const github = profile.github_username
    ? `https://github.com/${encodeURIComponent(profile.github_username)}`
    : "";
  const adminLink = profile.role === "admin" || profile.role === "editor"
    ? `<a class="btn-subscribe" href="admin.html"><span>Admin panel</span></a>`
    : "";

  root.innerHTML = `
    ${pageNotice ? `<p class="profile-page-status" data-tone="${pageTone}" role="status">${escapeHTML(pageNotice)}</p>` : ""}
    <section class="profile-card profile-identity">
      <div class="profile-avatar-slot" id="profile-avatar-slot">
        ${avatarHTML({ name, avatar: profile.avatar_url || "" }, "avatar profile-avatar")}
      </div>
      <h1>${escapeHTML(name)}</h1>
      <p class="auth-email">${escapeHTML(profile.email || "")}</p>
      <span class="auth-role">${escapeHTML(role)}</span>

      <dl class="auth-facts">
        <div><dt>Member since</dt><dd>${escapeHTML(joined)}</dd></div>
        ${website ? `<div><dt>Website</dt><dd><a href="${escapeAttr(website)}" target="_blank" rel="noopener">${escapeHTML(website.replace(/^https?:\/\//i, ""))}</a></dd></div>` : ""}
        ${github ? `<div><dt>GitHub</dt><dd><a href="${escapeAttr(github)}" target="_blank" rel="noopener">${escapeHTML(profile.github_username)}</a></dd></div>` : ""}
      </dl>

      <div class="profile-avatar-actions">
        <input id="avatar-file" type="file" accept="image/png,image/jpeg,image/webp" hidden />
        <button type="button" class="btn-subscribe" id="avatar-change"><span>Change photo</span></button>
        ${profile.avatar_url ? `<button type="button" class="link-button" id="avatar-remove">Remove photo</button>` : ""}
      </div>
      <p class="auth-status" id="avatar-status" role="status"></p>
      <p class="auth-foot">JPG, PNG or WebP, up to 2 MB. Square images look best.</p>

      <div class="profile-session-actions">
        ${adminLink}
        <button type="button" class="link-button" id="profile-signout">Sign out</button>
      </div>
    </section>

    <section class="profile-card profile-edit">
      <div class="profile-card-heading">
        <p class="auth-kicker">// EDIT</p>
        <h2>Profile details</h2>
      </div>
      <form class="profile-form" id="profile-form" novalidate>
        <label class="auth-field">
          <span>Display name</span>
          <input name="display_name" type="text" autocomplete="name" maxlength="80"
            value="${escapeAttr(profile.display_name || "")}" required />
        </label>
        <label class="auth-field">
          <span>Website</span>
          <input name="website_url" type="url" autocomplete="url" maxlength="500"
            placeholder="https://example.com" value="${escapeAttr(profile.website_url || "")}" />
        </label>
        <label class="auth-field">
          <span>GitHub username</span>
          <input name="github_username" type="text" autocomplete="off" maxlength="40"
            placeholder="octocat" value="${escapeAttr(profile.github_username || "")}" />
        </label>
        <label class="auth-field profile-field-wide">
          <span>Bio</span>
          <textarea name="bio" maxlength="1200" rows="5" placeholder="What are you learning or building?">${escapeHTML(profile.bio || "")}</textarea>
        </label>
        <p class="auth-error" role="alert"></p>
        <p class="auth-status" role="status"></p>
        <div class="profile-form-actions">
          <button type="submit" class="auth-submit btn-subscribe"><span>Save profile</span></button>
          <a class="link-button" href="./">Back to the RFC</a>
        </div>
      </form>
    </section>`;

  bindAvatar();
  bindForm();
  bindSignOut();
}

function bindAvatar() {
  const input = root.querySelector("#avatar-file");
  const change = root.querySelector("#avatar-change");
  const remove = root.querySelector("#avatar-remove");
  const status = root.querySelector("#avatar-status");

  change.addEventListener("click", () => input.click());

  input.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setStatus(status, "Use a JPG, PNG or WebP image.", "error");
      input.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setStatus(status, "That image is over 2 MB. Shrink it and try again.", "error");
      input.value = "";
      return;
    }

    const preview = URL.createObjectURL(file);
    const slot = root.querySelector("#profile-avatar-slot");
    const previous = slot.innerHTML;
    slot.innerHTML = `<img class="avatar profile-avatar" src="${preview}" alt="" />`;

    try {
      const updated = await withBusy(change, "Uploading…", () => uploadMyAvatar(file));
      profile = updated;
      pageNotice = "Profile photo updated.";
      pageTone = "ok";
      URL.revokeObjectURL(preview);
      renderProfile();
    } catch (error) {
      URL.revokeObjectURL(preview);
      slot.innerHTML = previous;
      setStatus(
        status,
        error.status === 404
          ? "Photo upload is not available yet; the backend update has not been deployed."
          : error.message || "Could not upload that photo.",
        "error",
      );
    } finally {
      input.value = "";
    }
  });

  remove?.addEventListener("click", async () => {
    try {
      const updated = await withBusy(remove, "Removing…", () => removeMyAvatar());
      profile = updated;
      pageNotice = "Profile photo removed.";
      pageTone = "ok";
      renderProfile();
    } catch (error) {
      setStatus(
        status,
        error.status === 404
          ? "Photo removal is not available yet; the backend update has not been deployed."
          : error.message || "Could not remove the photo.",
        "error",
      );
    }
  });
}

function bindForm() {
  const form = root.querySelector("#profile-form");
  const errorEl = form.querySelector(".auth-error");
  const status = form.querySelector(".auth-status");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    status.textContent = "";

    const displayName = form.querySelector('input[name="display_name"]').value.trim();
    const website = form.querySelector('input[name="website_url"]').value.trim();
    const github = form.querySelector('input[name="github_username"]').value.trim().replace(/^@/, "");
    const bio = form.querySelector('textarea[name="bio"]').value.trim();

    if (!displayName) {
      errorEl.textContent = "Enter a display name.";
      return;
    }
    if (website && !/^https?:\/\//i.test(website)) {
      errorEl.textContent = "The website must start with http:// or https://.";
      return;
    }
    if (github && !/^[A-Za-z0-9-]{1,39}$/.test(github)) {
      errorEl.textContent = "A GitHub username can only use letters, numbers and hyphens.";
      return;
    }
    if (bio.length > 1200) {
      errorEl.textContent = "Keep the bio under 1200 characters.";
      return;
    }

    try {
      const updated = await withBusy(
        form.querySelector(".auth-submit"),
        "Saving…",
        () => updateProfile({
          display_name: displayName,
          website_url: website,
          github_username: github,
          bio,
        }),
      );
      profile = updated;
      pageNotice = "Profile saved.";
      pageTone = "ok";
      document.title = `${profile.display_name || profile.email} | The Free Code Subculture`;
      renderProfile();
    } catch (error) {
      errorEl.textContent = error.message || "Could not save your profile.";
    }
  });
}

function bindSignOut() {
  root.querySelector("#profile-signout").addEventListener("click", async (event) => {
    await withBusy(event.currentTarget, "Signing out…", () => signOut());
    location.href = "./";
  });
}

function setStatus(element, message, tone = "ok") {
  if (!element) return;
  element.textContent = message || "";
  element.dataset.tone = tone;
}

async function withBusy(button, label, run) {
  const text = button.querySelector("span") || button;
  const idle = text.textContent;
  button.disabled = true;
  button.setAttribute("aria-busy", "true");
  text.textContent = label;
  try {
    return await run();
  } finally {
    button.disabled = false;
    button.removeAttribute("aria-busy");
    text.textContent = idle;
  }
}

function roleLabel(role) {
  return {
    admin: "Admin",
    editor: "Editor",
    member: "Member",
    pending: "Pending access",
  }[role] || "Member";
}

function formatJoined(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function safeLink(value) {
  const url = String(value || "").trim();
  return /^https?:\/\//i.test(url) ? url : "";
}
