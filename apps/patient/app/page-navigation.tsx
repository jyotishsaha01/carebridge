"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const accountPages = new Set(["/login", "/forgot-password", "/reset-password", "/verify-email"]);
const publicPages = new Set(["/", "/compare", "/documents", "/checkout"]);

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
    const currentAccountPage = accountPages.has(pathname);
    visits.current.pop();
    while (visits.current.length) {
      const previous = visits.current.at(-1)!;
      const previousPath = new URL(previous).pathname;
      const allowed = currentAccountPage
        ? accountPages.has(previousPath) || publicPages.has(previousPath)
        : !accountPages.has(previousPath);
      if (allowed) {
        router.replace(previous);
        return;
      }
      visits.current.pop();
    }

    // Direct links and refreshed pages have no in-portal history to return to.
    const appointmentParent = pathname.match(/^(\/appointments\/[^/]+)\/intake$/)?.[1];
    let fallback = "/dashboard";
    if (appointmentParent) fallback = appointmentParent;
    else if (currentAccountPage && pathname !== "/login") fallback = "/login";
    else if (publicPages.has(pathname) || pathname === "/login" || pathname === "/dashboard") fallback = "/";
    router.replace(fallback);
  }

  // The public landing page already has its own primary navigation.
  if (pathname === "/") return null;

  return <nav className="page-navigation" aria-label="Page navigation">
    <div className="page-navigation-inner">
      <button type="button" onClick={goBack}><span aria-hidden="true">←</span> Back</button>
      <div className="page-navigation-links">
        <Link href="/">Home</Link>
        <Link href="/dashboard" aria-current={pathname === "/dashboard" ? "page" : undefined}>Dashboard</Link>
      </div>
    </div>
  </nav>;
}
