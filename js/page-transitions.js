/*
 * js/page-transitions.js
 * ------------------------------------------------------------------
 * Names the direction of a cross-page view transition (style.css):
 * going deeper (home or the blog -> a post) is "nav-forward", coming back
 * out is "nav-back", so the page slides the way you are moving, as in
 * Vercel's view transitions guide. Depth is the address's path length.
 * Loaded in <head>, not deferred: "pagereveal" fires before the first
 * frame. Browsers without the Navigation API or view transitions skip it.
 * ------------------------------------------------------------------
 */

// Resolve the stylesheet before the first reveal. Chromium can otherwise
// decide @view-transition is missing and reject the transition with
// "ViewTransition opt-in disabled".
getComputedStyle(document.documentElement).getPropertyValue("--paper");

addEventListener("pagereveal", (event) => {
  try {
    const activation = window.navigation && navigation.activation;
    if (!event.viewTransition || !activation || !activation.from || !activation.entry) return;
    const depth = (url) => {
      try {
        return new URL(url, location.href).pathname.replace(/index\.html$/, "").split("/").filter(Boolean).length;
      } catch {
        return null;
      }
    };
    const from = depth(activation.from.url);
    const to = depth(activation.entry.url);
    if (from === null || to === null || to === from) return;
    event.viewTransition.types.add(to > from ? "nav-forward" : "nav-back");
  } catch {
    // A navigation or render can abort the transition before this runs.
  }
});
