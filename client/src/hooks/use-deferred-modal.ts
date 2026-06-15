import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Manages open/close state for a modal (Radix Dialog) that is rendered *inside*
 * another Radix overlay such as the WorkflowBuilder's RightSidebar `Sheet`.
 *
 * Two nested Radix overlays both apply `react-remove-scroll`, which sets
 * `pointer-events: none` on <body>. When the inner Dialog mounts/unmounts in the
 * same tick as the Sheet's own scroll-lock bookkeeping, the cleanup races and the
 * body can be left with `pointer-events: none` — freezing the whole screen so no
 * click registers.
 *
 * The fix is to defer the open/close state flip by one macrotask (setTimeout 0)
 * so the overlays' effects don't run in the same render, plus a safety net that
 * clears any lingering `pointer-events` lock on the body once the modal closes.
 */
export function useDeferredModal(initial = false) {
  const [isOpen, setIsOpen] = useState(initial);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const open = useCallback(() => {
    clear();
    // Defer so the parent Sheet's scroll-lock settles before the Dialog mounts.
    timeoutRef.current = setTimeout(() => setIsOpen(true), 0);
  }, []);

  const close = useCallback(() => {
    clear();
    // Defer the unmount so the Dialog's scroll-lock cleanup doesn't race the
    // Sheet's, which is what leaves the body frozen.
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
      // Safety net: if a lock got stuck, release it on the next tick.
      setTimeout(() => {
        if (document.body.style.pointerEvents === "none") {
          document.body.style.pointerEvents = "";
        }
      }, 0);
    }, 0);
  }, []);

  // Clean up the pending timer and any stuck lock on unmount.
  useEffect(() => {
    return () => {
      clear();
      if (document.body.style.pointerEvents === "none") {
        document.body.style.pointerEvents = "";
      }
    };
  }, []);

  return { isOpen, open, close, setIsOpen } as const;
}
