import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/** Retry for ~2s: the target may render late (e.g. after Clerk loads). */
const HASH_SCROLL_TIMEOUT_MS = 2000;

function scrollToHash(hash: string): () => void {
  const id = decodeURIComponent(hash.slice(1));
  const deadline = Date.now() + HASH_SCROLL_TIMEOUT_MS;
  let frame = 0;
  const attempt = () => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (Date.now() < deadline) {
      frame = requestAnimationFrame(attempt);
    }
  };
  attempt();
  return () => cancelAnimationFrame(frame);
}

/**
 * App-wide scroll behaviour for BrowserRouter (which has no built-in scroll
 * restoration):
 *
 * - New page → start at the top, instead of inheriting the previous page's
 *   scroll offset (e.g. clicking a footer link at the bottom of the landing).
 * - `#anchor` links (e.g. "/#pricing", "/faq#contact") → scroll to the target,
 *   including on first load and when the same anchor link is clicked again.
 * - Clicking a link to the page you're already on → back to the top.
 * - Back/forward → left alone, so the browser can restore the old position.
 * - Query-string-only changes (filters, pagination) → no jump.
 */
const ScrollManager = () => {
  const { pathname, search, hash, key } = useLocation();
  const navigationType = useNavigationType();
  const prev = useRef<{ pathname: string; search: string; hash: string } | null>(
    null,
  );

  useEffect(() => {
    const last = prev.current;
    prev.current = { pathname, search, hash };

    if (hash) {
      const moved = !last || last.pathname !== pathname || last.hash !== hash;
      if (moved || navigationType === "PUSH") return scrollToHash(hash);
      return;
    }

    // Initial load already starts at the top; back/forward is the browser's.
    if (!last || navigationType === "POP") return;

    if (last.pathname !== pathname) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else if (last.search === search && navigationType === "PUSH") {
      // A link to the current page (e.g. "Home" while on the landing page).
      window.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    }
  }, [pathname, search, hash, key, navigationType]);

  return null;
};

export default ScrollManager;
