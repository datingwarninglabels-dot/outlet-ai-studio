"use client";

import { useEffect, useState } from "react";

/**
 * Section 20: "Clear offline states; research, generation, and provider
 * operations require internet." This app doesn't offer real offline
 * editing (see sw.js's comment for why), so the honest thing to do is
 * surface connectivity loss clearly rather than let a generation request
 * silently fail with a confusing network error.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  if (!isOffline) {
    return null;
  }

  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex h-11 items-center justify-center bg-amber-400/90 px-4 text-center text-sm font-medium text-black"
    >
      You&apos;re offline — research, generation, and provider operations need internet to run.
    </div>
  );
}
