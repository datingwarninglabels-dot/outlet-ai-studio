"use client";

import { useEffect, useState } from "react";

/**
 * Section 20: "Safe update behavior." Registers sw.js and, when a new
 * version has installed and is waiting, shows a banner instead of
 * silently activating it — an in-progress script edit should never get
 * yanked out from under the Owner by a background update. Refreshing only
 * happens when they explicitly click the button.
 */
export function PwaRegister() {
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    let cancelled = false;

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      if (cancelled) return;

      const handleWaiting = () => {
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setUpdateReady(true);
        }
      };

      if (registration.waiting && registration.active) {
        handleWaiting();
      }

      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            handleWaiting();
          }
        });
      });
    });

    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!updateReady) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-lg">
      <span>A new version is available.</span>
      <button
        type="button"
        onClick={() => waitingWorker?.postMessage("SKIP_WAITING")}
        className="h-11 rounded-lg bg-gradient-to-r from-accent-purple via-accent-blue to-accent-teal px-4 font-medium text-black"
      >
        Update
      </button>
    </div>
  );
}
