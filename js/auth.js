/*
 * js/auth.js
 * ------------------------------------------------------------------
 * Member access for the public site: the Login control in the nav,
 * the sign-in/create-account dialog, email verification, password
 * reset, and the read-only profile view.
 *
 * There is no member page. Every state lives in one native <dialog>,
 * so the nav and the email links can open the same piece of UI.
 * ------------------------------------------------------------------
 */

import {
  getProfile,
  getSession,
  requestPasswordReset,
  resendVerification,
  signIn,
  signOut,
  signUp,
  updatePassword,
  verifyEmail,
} from "./api.js";
import { avatarHTML } from "./lib/avatar.js";
import { escapeAttr, escapeHTML, icon } from "./render.js";

const navButton = document.getElementById("nav-auth");
const dialog = document.getElementById("auth-dialog");
const body = document.getElementById("auth-body");
const titleEl = document.getElementById("auth-title");
const kickerEl = document.getElementById("auth-kicker");
const closeButton = document.getElementById("auth-close");

let navUser = null;
let activeProfile = null;

/* ------------------------------------------------------------------
 * Boot
 * ---------------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if (!navButton || !dialog || !body) return;

  bindDialog();
  navButton.addEventListener("click", onNavClick);
  await refreshNav();
  if (navUser) loadProfile({ background: true });
  await handleLinkHash();
}

async function onNavClick() {
  closeMobileNav();
  const session = await getSession();
  navUser = session?.user || null;

  if (navUser) {
    location.href = "account.html";
  } else {
    openDialog();
    viewLogin();
  }
}

function bindDialog() {
  closeButton?.addEventListener("click", () => dialog.close());

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  // Drop typed passwords when the dialog closes.
  dialog.addEventListener("close", () => {
    body.innerHTML = "";
  });
}

function openDialog() {
  closeMobileNav();
  if (!dialog.open) dialog.showModal();
}

function closeMobileNav() {
  const links = document.getElementById("nav-links");
  const toggle = document.getElementById("nav-toggle");
  links?.classList.remove("is-open");
  toggle?.setAttribute("aria-expanded", "false");
}

function setHeader(kicker, title) {
  kickerEl.textContent = kicker;
  titleEl.textContent = title;
}

function focusFirst() {
  const target = body.querySelector("[data-autofocus]") || body.querySelector("input, button");
  target?.focus();
}

/* ------------------------------------------------------------------
 * Navigation state
 * ---------------------------------------------------------------- */

async function refreshNav() {
  try {
    const session = await getSession();
    navUser = session?.user || null;
  } catch {
    navUser = null;
  }
  renderNav();
}

function renderNav() {
  if (!navButton) return;

  // The early session script painted a placeholder circle; the real nav
  // state now takes over.
  document.documentElement.dataset.auth = navUser ? "in" : "out";
  document.documentElement.dataset.authReady = "true";

  if (!navUser) {
    navButton.classList.remove("is-profile");
    navButton.innerHTML = `${icon("user", "nav-auth-icon")}<span class="nav-auth-label">Login</span>`;
    navButton.setAttribute("aria-label", "Log in or create an account");
    return;
  }

  const name = navUser.display_name || navUser.email || "Member";
  navButton.classList.add("is-profile");
  navButton.innerHTML = `${avatarHTML(
    { name, avatar: activeProfile?.avatar_url || "" },
    "avatar nav-avatar",
  )}<span class="nav-auth-label">Profile</span>`;
  navButton.setAttribute("aria-label", `Open profile for ${name}`);
}

async function loadProfile({ background = false } = {}) {
  try {
    activeProfile = await getProfile();
    renderNav();
    return activeProfile;
  } catch (error) {
    if (error.status === 401) {
      await signOut().catch(() => {});
      navUser = null;
      activeProfile = null;
      renderNav();
      if (!background) {
        openDialog();
        viewLogin({ message: "Your session expired. Sign in again." });
      }
      return null;
    }
    if (!background) throw error;
    return null;
  }
}

/* ------------------------------------------------------------------
 * Shared bits
 * ---------------------------------------------------------------- */

function tabsHTML(active) {
  return `
    <div class="auth-tabs" role="tablist" aria-label="Member access">
      <button type="button" role="tab" id="auth-tab-login" aria-controls="auth-panel"
        aria-selected="${active === "login"}" data-auth-tab="login"
        class="auth-tab${active === "login" ? " is-active" : ""}">Sign in</button>
      <button type="button" role="tab" id="auth-tab-signup" aria-controls="auth-panel"
        aria-selected="${active === "signup"}" data-auth-tab="signup"
        class="auth-tab${active === "signup" ? " is-active" : ""}">Create account</button>
    </div>`;
}

function panelHTML(active, inner) {
  return `
    ${tabsHTML(active)}
    <div id="auth-panel" role="tabpanel" aria-labelledby="auth-tab-${active}">
      ${inner}
    </div>`;
}

function bindTabs() {
  body.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      const email = body.querySelector('input[name="email"]')?.value.trim() || "";
      if (button.dataset.authTab === "signup") viewSignup({ email });
      else viewLogin({ email });
    });
  });
}

function revealButton(inputId) {
  return `
    <button type="button" class="auth-reveal" data-reveal="${inputId}"
      aria-label="Show password" aria-pressed="false">
      ${icon("eye", "icon-eye")}${icon("eye-off", "icon-eye-off")}
    </button>`;
}

function bindReveals(root = body) {
  root.querySelectorAll("[data-reveal]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = root.querySelector(`#${button.dataset.reveal}`);
      if (!input) return;
      const shown = input.type === "text";
      input.type = shown ? "password" : "text";
      button.setAttribute("aria-pressed", String(!shown));
      button.setAttribute("aria-label", shown ? "Show password" : "Hide password");
      input.focus();
    });
  });
}

function setError(root, message) {
  const error = root.querySelector(".auth-error");
  if (error) error.textContent = message || "";
}

function setStatus(root, message, tone = "ok") {
  const status = root.querySelector(".auth-status");
  if (!status) return;
  status.textContent = message || "";
  status.dataset.tone = tone;
}

async function withBusy(button, label, run) {
  if (!button) return run();
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

function clearHash() {
  if (location.hash && /(verify=|type=recovery)/.test(location.hash)) {
    history.replaceState(null, "", location.pathname + location.search);
  }
}

/* ------------------------------------------------------------------
 * Sign in / create account
 * ---------------------------------------------------------------- */

function viewLogin({ email = "", message = "", unverified = false } = {}) {
  setHeader("// MEMBER ACCESS", "Sign in");
  body.innerHTML = panelHTML(
    "login",
    `
    <form class="auth-form" id="auth-form" novalidate>
      <p class="auth-intro">Sign in to your FCS member account.</p>
      <label class="auth-field">
        <span>Email</span>
        <input name="email" type="email" autocomplete="email" required
          value="${escapeAttr(email)}" data-autofocus />
      </label>
      <label class="auth-field">
        <span>Password</span>
        <span class="auth-password">
          <input id="login-password" name="password" type="password"
            autocomplete="current-password" required />
          ${revealButton("login-password")}
        </span>
      </label>
      <p class="auth-error" role="alert">${escapeHTML(message)}</p>
      <p class="auth-status" role="status"></p>
      ${unverified ? `<button type="button" class="link-button" id="auth-resend">Resend verification email</button>` : ""}
      <button type="submit" class="auth-submit btn-subscribe"><span>Sign in</span></button>
      <div class="auth-links">
        <button type="button" class="link-button" id="auth-forgot">Forgot password?</button>
        <button type="button" class="link-button" data-auth-tab="signup">Create an account</button>
      </div>
      <p class="auth-foot">No account yet? Choose <strong>Create account</strong>. Accounts need a verified email address.</p>
    </form>`,
  );

  bindTabs();
  bindReveals();
  focusFirst();

  const form = body.querySelector("#auth-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const emailInput = form.querySelector('input[name="email"]');
    const passwordInput = form.querySelector('input[name="password"]');
    const submit = form.querySelector(".auth-submit");
    const emailValue = emailInput.value.trim();
    const password = passwordInput.value;

    if (!emailValue || !password) {
      setError(form, "Enter your email and password.");
      (!emailValue ? emailInput : passwordInput).focus();
      return;
    }

    try {
      const user = await withBusy(submit, "Signing in…", () =>
        signIn(emailValue, password),
      );
      navUser = user;
      activeProfile = null;
      renderNav();
      dialog.close();
      loadProfile({ background: true });
    } catch (error) {
      if (error.status === 403) {
        viewLogin({
          email: emailValue,
          message: error.message,
          unverified: true,
        });
        return;
      }
      setError(form, error.message || "Sign in failed.");
    }
  });

  form.querySelector("#auth-forgot")?.addEventListener("click", () => {
    viewForgot({ email: emailInput.value.trim() });
  });

  form.querySelector("#auth-resend")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const emailValue = emailInput.value.trim();
    if (!emailValue) {
      setError(form, "Enter your email first.");
      emailInput.focus();
      return;
    }
    try {
      await withBusy(button, "Sending…", () => resendVerification(emailValue));
      setError(form, "");
      setStatus(form, "Verification email sent. Check your inbox.");
    } catch (error) {
      setError(form, error.message || "Could not send the verification email.");
    }
  });
}

/* ------------------------------------------------------------------
 * Signup
 * ---------------------------------------------------------------- */

function viewSignup({ email = "" } = {}) {
  setHeader("// MEMBER ACCESS", "Create an account");
  body.innerHTML = panelHTML(
    "signup",
    `
    <form class="auth-form" id="auth-form" novalidate>
      <p class="auth-intro">Create a member account. We will email you a link to verify it.</p>
      <label class="auth-field">
        <span>Display name</span>
        <input name="displayName" type="text" autocomplete="name" maxlength="80" required data-autofocus />
      </label>
      <label class="auth-field">
        <span>Email</span>
        <input name="email" type="email" autocomplete="email" required value="${escapeAttr(email)}" />
      </label>
      <label class="auth-field">
        <span>Password</span>
        <span class="auth-password">
          <input id="signup-password" name="password" type="password"
            autocomplete="new-password" minlength="10" required />
          ${revealButton("signup-password")}
        </span>
      </label>
      <p class="auth-foot">At least 10 characters.</p>
      <div class="auth-check">
        <input id="signup-updates" name="emailUpdates" type="checkbox" checked />
        <label for="signup-updates">Email me about events and updates from the club.</label>
      </div>
      <input class="auth-hp" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" />
      <p class="auth-error" role="alert"></p>
      <p class="auth-status" role="status"></p>
      <button type="submit" class="auth-submit btn-subscribe"><span>Create account</span></button>
      <div class="auth-links">
        <button type="button" class="link-button" data-auth-tab="login">Already have an account? Sign in</button>
      </div>
      <p class="auth-foot">By creating an account you agree to the <a href="privacy.html">privacy notice</a>.</p>
    </form>`,
  );

  bindTabs();
  bindReveals();
  focusFirst();

  const form = body.querySelector("#auth-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const displayName = form.querySelector('input[name="displayName"]').value.trim();
    const emailInput = form.querySelector('input[name="email"]');
    const emailValue = emailInput.value.trim();
    const password = form.querySelector('input[name="password"]').value;
    const submit = form.querySelector(".auth-submit");

    if (!displayName) {
      setError(form, "Enter a display name.");
      form.querySelector('input[name="displayName"]').focus();
      return;
    }
    if (!emailValue) {
      setError(form, "Enter a valid email address.");
      emailInput.focus();
      return;
    }
    if (password.length < 10) {
      setError(form, "The password must be at least 10 characters.");
      form.querySelector('input[name="password"]').focus();
      return;
    }

    try {
      const result = await withBusy(submit, "Creating…", () =>
        signUp({
          email: emailValue,
          password,
          displayName,
          emailUpdates: form.querySelector('input[name="emailUpdates"]').checked,
          company: form.querySelector('input[name="company"]').value,
        }),
      );
      viewVerifySent({
        email: emailValue,
        pending: Boolean(result?.pending),
        verifyUrl: result?.verifyUrl || "",
      });
    } catch (error) {
      setError(form, error.message || "Could not create the account.");
    }
  });
}

function viewForgot({ email = "" } = {}) {
  setHeader("// PASSWORD", "Reset your password");
  body.innerHTML = `
    <form class="auth-form" id="auth-form" novalidate>
      <p class="auth-intro">Enter your email and we will send a one-time reset link.</p>
      <label class="auth-field">
        <span>Email</span>
        <input name="email" type="email" autocomplete="email" required
          value="${escapeAttr(email)}" data-autofocus />
      </label>
      <p class="auth-error" role="alert"></p>
      <button type="submit" class="auth-submit btn-subscribe"><span>Send reset link</span></button>
      <div class="auth-links">
        <button type="button" class="link-button" id="auth-back">Back to sign in</button>
      </div>
      <p class="auth-foot">If the address belongs to an account, the link will arrive shortly.</p>
    </form>`;

  focusFirst();
  const form = body.querySelector("#auth-form");
  form.querySelector("#auth-back").addEventListener("click", () => viewLogin());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const emailInput = form.querySelector('input[name="email"]');
    const emailValue = emailInput.value.trim();
    if (!emailValue) {
      setError(form, "Enter your email first.");
      emailInput.focus();
      return;
    }
    try {
      const result = await withBusy(
        form.querySelector(".auth-submit"),
        "Sending…",
        () => requestPasswordReset(emailValue),
      );
      viewResetSent({ email: emailValue, resetUrl: result?.resetUrl || "" });
    } catch (error) {
      setError(form, error.message || "Could not send the reset link.");
    }
  });
}

function viewResetSent({ email, resetUrl = "" }) {
  setHeader("// PASSWORD", "Check your inbox");
  body.innerHTML = `
    <p class="auth-intro">If <strong>${escapeHTML(email)}</strong> belongs to an account, a reset link is on its way. The link expires in one hour.</p>
    <p class="auth-status" role="status">You can close this window once the new password is saved.</p>
    ${resetUrl ? `<p class="auth-foot auth-dev-link">Development link: <a href="${escapeAttr(resetUrl)}">open reset page</a></p>` : ""}
    <div class="auth-actions">
      <button type="button" class="btn-subscribe" id="auth-back"><span>Back to sign in</span></button>
    </div>`;
  body.querySelector("#auth-back").addEventListener("click", () => viewLogin({ email }));
}

function viewVerifySent({ email, verifyUrl = "" }) {
  setHeader("// MEMBER", "Verify your email");
  body.innerHTML = `
    <p class="auth-intro">We sent a verification link to <strong>${escapeHTML(email)}</strong>. Open it to activate your account; the link signs you in automatically.</p>
    <p class="auth-status" role="status"></p>
    ${verifyUrl ? `<p class="auth-foot auth-dev-link">Development link: <a href="${escapeAttr(verifyUrl)}">verify this account</a></p>` : ""}
    <div class="auth-actions">
      <button type="button" class="btn-subscribe" id="auth-resend"><span>Resend email</span></button>
      <button type="button" class="link-button" id="auth-back">Back to sign in</button>
    </div>
    <p class="auth-foot">If it does not arrive, check spam, then resend. The link expires in 24 hours.</p>`;

  body.querySelector("#auth-back").addEventListener("click", () => viewLogin({ email }));
  body.querySelector("#auth-resend").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    try {
      const result = await withBusy(button, "Sending…", () => resendVerification(email));
      setStatus(body, "Verification email sent. Check your inbox.");
      if (result?.verifyUrl) {
        const link = body.querySelector(".auth-dev-link");
        if (link) link.innerHTML = `Development link: <a href="${escapeAttr(result.verifyUrl)}">verify this account</a>`;
      }
    } catch (error) {
      setStatus(body, error.message || "Could not send the verification email.", "error");
    }
  });
}

/* ------------------------------------------------------------------
 * Emailed links: verify and reset
 * ---------------------------------------------------------------- */

async function handleLinkHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  const verifyToken = params.get("verify");
  const type = params.get("type");
  const token = params.get("token");

  if (location.hash === "#login") {
    history.replaceState(null, "", location.pathname + location.search);
    openDialog();
    viewLogin();
    return;
  }

  if (verifyToken) {
    clearHash();
    openDialog();
    await verifyFromLink(verifyToken);
    return;
  }

  if (type === "recovery" && token) {
    clearHash();
    openDialog();
    viewReset();
  }
}

async function verifyFromLink(token) {
  setHeader("// MEMBER", "Verifying your email");
  body.innerHTML = `<p class="auth-intro">One moment while we verify this link.</p><p class="auth-status" role="status">Checking the token…</p>`;
  try {
    navUser = await verifyEmail(token);
    activeProfile = await loadProfile({ background: true });
    location.href = "account.html?verified=1";
  } catch (error) {
    viewVerifyError(error.message || "This verification link is invalid or expired.");
  }
}

function viewVerifyError(message) {
  setHeader("// MEMBER", "Verification failed");
  body.innerHTML = `
    <p class="auth-intro">${escapeHTML(message)}</p>
    <form class="auth-form" id="auth-form" novalidate>
      <label class="auth-field">
        <span>Email</span>
        <input name="email" type="email" autocomplete="email" required data-autofocus />
      </label>
      <p class="auth-error" role="alert"></p>
      <p class="auth-status" role="status"></p>
      <button type="submit" class="auth-submit btn-subscribe"><span>Resend verification email</span></button>
      <div class="auth-links">
        <button type="button" class="link-button" id="auth-back">Back to sign in</button>
      </div>
    </form>`;
  focusFirst();
  const form = body.querySelector("#auth-form");
  form.querySelector("#auth-back").addEventListener("click", () => viewLogin());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = form.querySelector('input[name="email"]').value.trim();
    if (!email) {
      setError(form, "Enter your email first.");
      return;
    }
    try {
      const result = await withBusy(
        form.querySelector(".auth-submit"),
        "Sending…",
        () => resendVerification(email),
      );
      setError(form, "");
      setStatus(form, "Verification email sent. Check your inbox.");
      if (result?.verifyUrl) {
        form.insertAdjacentHTML(
          "beforeend",
          `<p class="auth-foot auth-dev-link">Development link: <a href="${escapeAttr(result.verifyUrl)}">verify this account</a></p>`,
        );
      }
    } catch (error) {
      setStatus(form, error.message || "Could not send the verification email.", "error");
    }
  });
}

function viewReset() {
  setHeader("// PASSWORD", "Choose a new password");
  body.innerHTML = `
    <form class="auth-form" id="auth-form" novalidate>
      <p class="auth-intro">Choose a new password for your FCS account. Use at least 10 characters.</p>
      <label class="auth-field">
        <span>New password</span>
        <span class="auth-password">
          <input id="reset-password" name="password" type="password"
            autocomplete="new-password" minlength="10" required data-autofocus />
          ${revealButton("reset-password")}
        </span>
      </label>
      <label class="auth-field">
        <span>Confirm new password</span>
        <span class="auth-password">
          <input id="reset-confirm" name="confirm" type="password"
            autocomplete="new-password" minlength="10" required />
          ${revealButton("reset-confirm")}
        </span>
      </label>
      <p class="auth-error" role="alert"></p>
      <button type="submit" class="auth-submit btn-subscribe"><span>Save password</span></button>
      <div class="auth-links">
        <button type="button" class="link-button" id="auth-back">Back to sign in</button>
      </div>
    </form>`;
  bindReveals();
  focusFirst();
  const form = body.querySelector("#auth-form");
  form.querySelector("#auth-back").addEventListener("click", () => viewLogin());
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = form.querySelector('input[name="password"]').value;
    const confirm = form.querySelector('input[name="confirm"]').value;
    if (password.length < 10) {
      setError(form, "Use at least 10 characters.");
      return;
    }
    if (password !== confirm) {
      setError(form, "The two passwords do not match.");
      return;
    }
    try {
      navUser = await withBusy(
        form.querySelector(".auth-submit"),
        "Saving…",
        () => updatePassword(password),
      );
      activeProfile = await loadProfile({ background: true });
      location.href = "account.html?reset=1";
    } catch (error) {
      setError(form, error.message || "Could not save the password.");
    }
  });
}

