import { useEffect, useState } from "react";
import type { RouteState } from "../types";

export function parseRoute(): RouteState {
  const legacyMatch = window.location.pathname.match(/\/checks\/view\/([^/]+)/);
  if (legacyMatch) {
    const id = decodeURIComponent(legacyMatch[1]);
    return { path: `/reports/${id}`, params: { id } };
  }

  const hash = window.location.hash.replace(/^#/, "");
  const path = hash || "/overview";
  const reportMatch = path.match(/^\/reports\/([^/]+)/);
  if (reportMatch) {
    return { path, params: { id: decodeURIComponent(reportMatch[1]) } };
  }
  return { path, params: {} };
}

export function navigate(path: string): void {
  if (window.location.pathname.startsWith("/checks/view/")) {
    window.history.replaceState(null, "", "/");
  }
  window.location.hash = path;
}

export function useHashRoute(): RouteState {
  const [route, setRoute] = useState<RouteState>(() => parseRoute());

  useEffect(() => {
    const updateRoute = () => setRoute(parseRoute());
    window.addEventListener("hashchange", updateRoute);
    window.addEventListener("popstate", updateRoute);
    return () => {
      window.removeEventListener("hashchange", updateRoute);
      window.removeEventListener("popstate", updateRoute);
    };
  }, []);

  return route;
}
