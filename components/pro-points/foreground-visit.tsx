"use client";
import { useEffect } from "react";
// A foreground interaction records at most one daily visit. Loading/refreshing alone does not.
export function ForegroundVisit() {
  useEffect(() => {
    let sent = false;
    const started = Date.now();
    const record = () => {
      if (
        sent ||
        document.visibilityState !== "visible" ||
        !document.hasFocus() ||
        Date.now() - started < 1000
      )
        return;
      sent = true;
      void fetch("/api/pro-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "visit" }),
        keepalive: true,
      }).catch(() => {});
    };
    const events = ["pointerdown", "keydown", "scroll"];
    events.forEach((e) =>
      window.addEventListener(e, record, { passive: true }),
    );
    return () => events.forEach((e) => window.removeEventListener(e, record));
  }, []);
  return null;
}
