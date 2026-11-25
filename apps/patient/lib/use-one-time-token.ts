"use client";

import { useEffect, useRef, useState } from "react";

/** Capture the credential once, then remove it from subsequent history and referrers. */
export function useOneTimeToken() {
  const [token, setToken] = useState("");
  const captured = useRef(false);
  useEffect(() => {
    if (captured.current) return;
    captured.current = true;
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const value = fragment.get("token") ?? url.searchParams.get("token") ?? "";
    // The fragment is available only in the browser; never render it into static HTML.
    setToken(value);
    if (url.searchParams.has("token") || fragment.has("token")) {
      url.searchParams.delete("token");
      fragment.delete("token");
      url.hash = fragment.toString();
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, []);
  return [token, setToken] as const;
}
