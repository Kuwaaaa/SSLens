interface RouteRefreshOptions {
  shouldRefresh: () => boolean;
  onRefresh: () => void;
  delayMs?: number;
}

export function installRouteRefreshHooks({
  shouldRefresh,
  onRefresh,
  delayMs = 100,
}: RouteRefreshOptions): void {
  let routeRefreshTimer: number | null = null;

  const scheduleRouteRefresh = () => {
    if (routeRefreshTimer !== null) window.clearTimeout(routeRefreshTimer);
    routeRefreshTimer = window.setTimeout(() => {
      routeRefreshTimer = null;
      if (shouldRefresh()) onRefresh();
    }, delayMs);
  };

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function pushState(...args) {
    const result = originalPushState.apply(this, args);
    scheduleRouteRefresh();
    return result;
  };

  history.replaceState = function replaceState(...args) {
    const result = originalReplaceState.apply(this, args);
    scheduleRouteRefresh();
    return result;
  };

  window.addEventListener("popstate", scheduleRouteRefresh);
  window.addEventListener("hashchange", scheduleRouteRefresh);
}
