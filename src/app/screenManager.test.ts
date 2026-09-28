import { describe, it, expect, vi, afterEach } from 'vitest';
import { matchRoute, createScreenManager, type Route, type Screen } from './screenManager';

describe('matchRoute', () => {
  const routes: Route[] = [
    { pattern: '/', create: () => ({ mount: () => undefined, unmount: () => undefined }) },
    { pattern: '/zukan/:patternId', create: () => ({ mount: () => undefined, unmount: () => undefined }) },
    { pattern: '/games/:gameId', create: () => ({ mount: () => undefined, unmount: () => undefined }) },
  ];

  it("1. '#/' はホームに一致する", () => {
    const m = matchRoute(routes, '#/');
    expect(m).not.toBeNull();
    expect(m!.route.pattern).toBe('/');
    expect(m!.params).toEqual({});
  });

  it("'#/zukan/abc' で params.patternId が 'abc'", () => {
    const m = matchRoute(routes, '#/zukan/abc');
    expect(m).not.toBeNull();
    expect(m!.route.pattern).toBe('/zukan/:patternId');
    expect(m!.params).toEqual({ patternId: 'abc' });
  });

  it("'#/zukan/%E7%B8%9E' がデコードされる", () => {
    const m = matchRoute(routes, '#/zukan/%E7%B8%9E');
    expect(m!.params).toEqual({ patternId: '縞' });
  });

  it("'#/nothing' は null", () => {
    expect(matchRoute(routes, '#/nothing')).toBeNull();
  });

  it("'' は '/' として扱う", () => {
    const m = matchRoute(routes, '');
    expect(m).not.toBeNull();
    expect(m!.route.pattern).toBe('/');
  });

  it("'#' も '/' として扱う", () => {
    const m = matchRoute(routes, '#');
    expect(m).not.toBeNull();
    expect(m!.route.pattern).toBe('/');
  });

  it('複数セグメントのパスでパラメータを取る', () => {
    const m = matchRoute(routes, '#/games/creel');
    expect(m!.route.pattern).toBe('/games/:gameId');
    expect(m!.params).toEqual({ gameId: 'creel' });
  });
});

function fakeScreen(log: string[], name: string, onMount?: () => void): Screen {
  return {
    mount: () => {
      log.push(`${name}:mount`);
      onMount?.();
    },
    unmount: () => {
      log.push(`${name}:unmount`);
    },
  };
}

describe('createScreenManager', () => {
  function setup(): { container: HTMLElement; setHash: (h: string) => void; handlers: Map<string, () => void>; fire: (t: string) => void } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const handlers = new Map<string, () => void>();
    vi.stubGlobal('window', {
      location: { hash: '#/' },
      addEventListener: (t: string, cb: () => void) => {
        handlers.set(t, cb);
      },
      removeEventListener: (t: string) => {
        handlers.delete(t);
      },
    });
    return {
      container,
      setHash: (h: string) => {
        (window as unknown as { location: { hash: string } }).location.hash = h;
      },
      handlers,
      fire: (t: string) => {
        handlers.get(t)?.();
      },
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('2. hash を A→B と変えると、A の unmount が B の mount より先に呼ばれる', () => {
    const { container, setHash, fire } = setup();
    const log: string[] = [];
    const routes: Route[] = [
      { pattern: '/', create: () => fakeScreen(log, 'A') },
      { pattern: '/other', create: () => fakeScreen(log, 'B') },
    ];
    const sm = createScreenManager(container, routes);
    sm.start();

    setHash('#/other');
    fire('hashchange');
    expect(log).toEqual(['A:mount', 'A:unmount', 'B:mount']);
    sm.stop();
  });

  it('3. 未知の hash で "/" に移る', () => {
    const { container, setHash, fire } = setup();
    const log: string[] = [];
    const routes: Route[] = [
      { pattern: '/', create: () => fakeScreen(log, 'home') },
      { pattern: '/other', create: () => fakeScreen(log, 'other') },
    ];
    const sm = createScreenManager(container, routes);
    sm.start();

    setHash('#/nothing');
    fire('hashchange');
    // 一致しないので '/' に navigate される (未知の画面の mount は行われない)
    expect((window as unknown as { location: { hash: string } }).location.hash).toBe('/');
    expect(log).toEqual(['home:mount']); // navigate だけでは mount しない
    // ブラウザでは hash 変更で hashchange が発火し、'/' の画面が表示される
    fire('hashchange');
    expect(log).toEqual(['home:mount', 'home:unmount', 'home:mount']);
    expect(log).not.toContain('other:mount');
    sm.stop();
  });

  it('4. stop() で現在の画面の unmount が呼ばれる', () => {
    const { container, fire } = setup();
    const log: string[] = [];
    const routes: Route[] = [{ pattern: '/', create: () => fakeScreen(log, 'home') }];
    const sm = createScreenManager(container, routes);
    sm.start();
    fire('hashchange'); // 同じ hash でも再表示 (unmount → mount)
    expect(log).toEqual(['home:mount', 'home:unmount', 'home:mount']);
    sm.stop();
    expect(log).toEqual(['home:mount', 'home:unmount', 'home:mount', 'home:unmount']);
    expect(container.children).toHaveLength(0);
  });

  it('start 時に現在の hash の画面が表示される', () => {
    const { container, fire } = setup();
    (window as unknown as { location: { hash: string } }).location.hash = '#/';
    const log: string[] = [];
    const routes: Route[] = [{ pattern: '/', create: () => fakeScreen(log, 'home') }];
    const sm = createScreenManager(container, routes);
    sm.start(); // start 時に現在の hash の画面が表示される
    expect(log).toEqual(['home:mount']);
    fire('hashchange');
    expect(log).toEqual(['home:mount', 'home:unmount', 'home:mount']);
    sm.stop();
  });
});
