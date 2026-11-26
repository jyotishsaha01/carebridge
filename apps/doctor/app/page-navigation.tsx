"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const patientPortal = process.env.NEXT_PUBLIC_PATIENT_APP_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:3000");
const home = patientPortal ? new URL("/", patientPortal).toString() : "";

function navigationHref() {
  const url = new URL(window.location.href);
  // Recovery/verification credentials must never reappear through the Back trail.
  if (["/login", "/forgot-password", "/reset-password", "/verify-email"].includes(url.pathname)) {
    url.search = "";
    url.hash = "";
  }
  return url.toString();
}

export default function PageNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  const visits = useRef<string[]>([]);

  useEffect(() => {
    const href = navigationHref();
    if (visits.current.at(-1) !== href) visits.current.push(href);
  }, [pathname]);

  useEffect(() => {
    // Keep the portal trail aligned when the browser's own Back/Forward is used.
    const restore = () => {
      const index = visits.current.lastIndexOf(navigationHref());
      if (index >= 0) visits.current.splice(index + 1);
      else visits.current.push(navigationHref());
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  function goBack() {
    visits.current.pop();
    while (visits.current.length) {
      const previous = visits.current.at(-1)!;
      if (pathname !== "/login" && new URL(previous).pathname !== "/login") {
        router.replace(previous);
        return;
      }
      visits.current.pop();
    }

    // Never guess at browser history: direct entries return to a known portal.
    if (pathname === "/login" && home) window.location.assign(home);
    else router.replace(pathname === "/dashboard" ? "/" : "/dashboard");
  }

  return <nav className="page-navigation" aria-label="Page navigation">
    <div className="page-navigation-inner">
      <button type="button" onClick={goBack}><span aria-hidden="true">←</span> Back</button>
      <div className="page-navigation-links">
        {home && <a href={home}>Home</a>}
        <Link href="/dashboard" aria-current={pathname === "/dashboard" ? "page" : undefined}>Dashboard</Link>
      </div>
    </div>
  </nav>;
}
