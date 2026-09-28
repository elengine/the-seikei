export interface Screen {
  mount(container: HTMLElement, params: Record<string, string>): void;
  unmount(): void;
}

export interface Route {
  pattern: string; // 例:'/zukan/:patternId'
  create: () => Screen;
}

export interface MatchedRoute {
  route: Route;
  params: Record<string, string>;
}

/**
 * 純粋関数。hash は '#/zukan/abc' の形。先頭の '#' がない、または空なら '/' とみなす。
 * 一致したルートと params を返す。一致しなければ null。
 */
export function matchRoute(routes: Route[], hash: string): MatchedRoute | null {
  let path = hash.startsWith('#') ? hash.slice(1) : hash;
  if (path === '' || path === '#') {
    path = '/';
  }
  const segments = path.split('/').filter((s) => s !== '');
  for (const route of routes) {
    const patternSegments = route.pattern.split('/').filter((s) => s !== '');
    if (patternSegments.length !== segments.length) {
      continue;
    }
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < patternSegments.length; i++) {
      const p = patternSegments[i];
      const s = segments[i];
      if (p !== undefined && p.startsWith(':')) {
        if (s === undefined) {
          matched = false;
          break;
        }
        try {
          params[p.slice(1)] = decodeURIComponent(s);
        } catch {
          // 不正なエンコード (例:'%E7') は、そのルートは一致しなかったものとして扱う
          matched = false;
          break;
        }
      } else if (p !== s) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return { route, params };
    }
  }
  return null;
}

export interface ScreenManager {
  start(): void; // hashchange の監視を始め、現在の hash の画面を表示
  navigate(path: string): void; // location.hash を変える
  stop(): void; // 監視をやめ、現在の画面を unmount
}

export function createScreenManager(container: HTMLElement, routes: Route[]): ScreenManager {
  let current: Screen | null = null;

  function unmountCurrent(): void {
    if (current !== null) {
      const screen = current;
      current = null;
      try {
        screen.unmount();
      } catch (e) {
        // 1つの画面の不具合で切替自体が壊れないように、記録して続行する
        console.error(e instanceof Error ? e : new Error(String(e)));
      }
    }
    container.textContent = ''; // 前の画面を取り除いてから次を mount する
  }

  function show(): void {
    const hash = window.location.hash;
    const matched = matchRoute(routes, hash);
    if (matched === null) {
      // 一致するルートがなければ '/' に navigate する
      navigate('/');
      return;
    }
    unmountCurrent();
    const screen = matched.route.create();
    screen.mount(container, matched.params);
    current = screen;
  }

  function onHashChange(): void {
    show();
  }

  function navigate(path: string): void {
    window.location.hash = path;
  }

  return {
    start(): void {
      window.addEventListener('hashchange', onHashChange);
      show();
    },
    navigate,
    stop(): void {
      window.removeEventListener('hashchange', onHashChange);
      unmountCurrent();
    },
  };
}
