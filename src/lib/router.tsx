"use client";

import { useSyncExternalStore } from "react";

// A hash router: GitHub Pages serves static files only, so deep links like /group/123 would 404.

const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};

const currentPath = () => window.location.hash.replace(/^#/, "") || "/";

export function usePath() {
  return useSyncExternalStore(subscribe, currentPath, () => "/");
}

export const segmentsOf = (path: string) => path.split("?")[0].split("/").filter(Boolean).map(decodeURIComponent);

export function navigate(path: string) {
  window.location.hash = path;
  window.scrollTo({ top: 0 });
}

export function Link({ to, className, children, ...rest }: { to: string; className?: string; children: React.ReactNode } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={`#${to}`} className={className} {...rest}>{children}</a>;
}
