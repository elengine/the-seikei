import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createBeamingPanel } from './panel';
import { init, reduce } from './logic';
import type { BeamingState, BeamingAction } from './logic';

/**
 * ビーム巻きの操作欄のテスト (P3 T3-03a)。
 * 幅合わせの段階: 円盤を動かす4つのボタンが1行 (4列の格子)・今と目標の幅。
 * 巻き返しの段階: 巻き量の帯と表示・巻いた割合と時間 (寄せるは T3-05 で無し)。
 */

const terms = { t: (k: string) => k, render: (x: string) => x };

function make(): BeamingState {
  return init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' });
}

/** 目標どおりに合わせて糸も付けた巻きの状態 (phase は beaming。T3-06 で attach 段階が増えた) */
function beaming(): BeamingState {
  let s = make();
  s = reduce(s, { type: 'moveFlange', side: 'left', deltaCm: -30 - s.leftCm });
  s = reduce(s, { type: 'moveFlange', side: 'right', deltaCm: 30 - s.rightCm });
  s = reduce(s, { type: 'finishSetup' });
  return reduce(s, { type: 'attachThread' });
}

describe('beaming panel T3-03a (操作欄)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.textContent = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('1. 幅合わせの段階: 円盤を動かすボタン (◀▶) は無い (絵の上で引っぱる。PU-15b)。今の幅と目標の幅の数字が出る', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(make());
    expect(host.querySelector('.beaming-panel__flange-row')).toBeNull();
    expect(host.querySelector('.beaming-panel__flanges')).toBeNull();
    const labels = Array.from(host.querySelectorAll('button')).map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(labels.some((l) => /円盤を(左|右)へ/.test(String(l)))).toBe(false);
    expect(host.textContent).not.toContain('◀ 左');
    expect(host.textContent).toContain('目標 60cm'); // 目標と今の幅の数字 (PU-27 で大きく)
    expect(host.textContent).toMatch(/いま \d+cm/);
    p.destroy();
  });

  it('3. 巻き返しの段階: 「寄せる」のボタンと入れ物は無い (T3-05 で寄せるをやめた)。幅合わせのボタンは隠れる', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(beaming());
    expect(host.querySelector('.beaming-panel__shift')).toBeNull();
    expect(host.textContent).not.toContain('寄せる');
    // 幅合わせの入れ物 (block) ごと隠れる
    const setupBlock = host.querySelector('.beaming-panel__info')!.closest('.beaming-panel__block') as HTMLElement;
    expect(setupBlock.style.display).toBe('none');
    p.destroy();
  });

  it('4. 巻き量の表示は切り捨て (100.99% は 100%。T3-05)', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update({ ...beaming(), progress: 1.0099 });
    expect(host.textContent).toContain('巻き量 100%');
    p.update({ ...beaming(), progress: 0.995 });
    expect(host.textContent).toContain('巻き量 99%');
    p.destroy();
  });

  it('5. 「円盤調整完了」は幅合わせの段階だけ出る (押すと finishSetup)。巻き返しの段階では主な操作は無し (T3-06 で名前を変えた)', () => {
    const actions: BeamingAction[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a) });
    p.update(make());
    const start = (): HTMLButtonElement | undefined =>
      Array.from(host.querySelectorAll('button')).find((b) => b.textContent === '円盤調整完了');
    expect(start()).toBeDefined();
    start()!.click();
    expect(actions).toEqual([{ type: 'finishSetup' }]);
    p.update(beaming());
    expect(start()!.style.display).toBe('none'); // 巻き返しの段階では主な操作は無し (隠れる)
    p.destroy();
  });

  it('6. 「巻き量」は操作欄の一番上に 1 か所だけ。依頼票は 1 つ (柄の名前・巻き幅・帯の数。PU-27)', () => {
    const p = createBeamingPanel(host, {
      terms,
      onAction: () => undefined,
      puzzle: { bands: 3, patternName: '無地紺' },
    });
    p.update(make());
    expect(host.querySelectorAll('.order-ticket')).toHaveLength(1);
    expect(host.querySelector('.order-ticket')!.textContent).toContain('無地紺');
    expect(host.querySelector('.order-ticket__width')!.textContent).toBe('巻き幅 60cm');
    p.update(beaming());
    const amounts = host.querySelectorAll('.beaming-panel__amount');
    expect(amounts).toHaveLength(1);
    expect(host.querySelector('.beaming-panel')!.firstElementChild).toBe(amounts[0]);
    expect(amounts[0]!.textContent).toBe('巻き量 0%');
    expect((host.textContent ?? '').match(/巻き量/g)).toHaveLength(1); // 依頼票の「巻き幅」は別の言葉
    expect(host.textContent).not.toContain('巻いた');
    p.destroy();
  });

  it('7. destroy で要素が消える', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(make());
    p.destroy();
    expect(host.querySelector('.beaming-panel')).toBeNull();
  });
});

describe('PU-15c: 操作欄の整理 (戻す・踏み込む・速さ・経過時間を無くす)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.textContent = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('速さのボタンは無い (盤面の茶色の棒で変える。T3-04b)。「戻す」「踏み込む」・経過時間は無い', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(beaming());
    const labels = Array.from(host.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).not.toContain('停止');
    expect(labels).not.toContain('50%');
    expect(labels).not.toContain('100%');
    expect(host.querySelector('.pedal__btn')).toBeNull();
    expect(host.querySelector('.pedal__groove')).toBeNull();
    expect(host.querySelector('.beaming-panel__clock')).toBeNull();
    expect(host.textContent).not.toContain('踏み込む');
    expect(host.textContent).not.toContain('戻す');
    expect(host.textContent).not.toMatch(/\d+:\d{2}/);
    p.destroy();
  });

  it('巻き返しの段階に「寄せる」は無い (T3-05 でやめた。速さは盤面の茶色の棒で変える)', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(beaming());
    expect(host.textContent).not.toContain('寄せる');
    p.destroy();
  });
  it('巻き量は 32px 以上の太字 (base.css)', () => {
    const css = readFileSync('src/styles/base.css', 'utf8');
    const m = css.match(/\n\.beaming-panel__amount\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(m.match(/font-size: (\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(32);
    expect(m).toContain('font-weight: bold');
  });

});

describe('T3-04c (完了のボタン。T3-06 で「確認」から名前を変えた)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.textContent = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it("1. 巻き量 95% 未満では「完了」のボタンは無い。速さの3つのボタンも無い (茶色の棒に置き換わった)", () => {
    const actions: unknown[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a) });
    p.update(beaming());
    // 見えているボタンだけ (確認は 95% 以上で出る。隠れているボタンは数えない)
    const labels = Array.from(host.querySelectorAll('button'))
      .filter((b) => (b as HTMLElement).style.display !== 'none')
      .map((b) => b.textContent?.trim());
    expect(labels).not.toContain('完了');
    expect(labels).not.toContain('停止');
    expect(labels).not.toContain('50%');
    expect(labels).not.toContain('100%');
    p.destroy();
  });

  it("2. 巻き量 95% 以上で止めていれば「完了」が押せる (confirm を送る) (T3-06 で名前を変えた)", () => {
    const actions: unknown[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a) });
    p.update({ ...beaming(), progress: 0.96, speed: 0 });
    const btn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === '完了');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-disabled')).toBe('false');
    btn!.click();
    expect(actions).toContainEqual({ type: 'confirm' });
    p.destroy();
  });

  it("3. 95% 以上でも止めていないときは押せない形 (aria-disabled)。押すと理由のお知らせ", () => {
    const actions: unknown[] = [];
    const notices: string[] = [];
    const p = createBeamingPanel(host, { terms, onAction: (a) => actions.push(a), onNotice: (t) => notices.push(t) });
    p.update({ ...beaming(), progress: 0.96, speed: 50 });
    const btn = Array.from(host.querySelectorAll('button')).find((b) => b.textContent?.trim() === '完了');
    expect(btn).not.toBeNull();
    expect(btn!.getAttribute('aria-disabled')).toBe('true');
    btn!.click();
    expect(actions).not.toContainEqual({ type: 'confirm' });
    expect(notices).toContain('レバーを左端まで戻して止めてから、完了を押します');
    p.destroy();
  });
});

describe('PU-27: 操作欄に「速さ」の行は無い', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.textContent = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('どの段階でも「速さ」の字も .beaming-panel__speed も無い。巻き量は残る。ボタンの名前は「円盤調整完了」で「ビーム設定OK」はどこにも無い', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    for (const st of [make(), { ...beaming(), phase: 'attach' as const }, { ...beaming(), progress: 0.5, speed: 63 }]) {
      p.update(st);
      expect(host.querySelector('.beaming-panel__speed')).toBeNull();
      expect(host.textContent).not.toContain('速さ');
      expect(host.textContent).not.toContain('ビーム設定OK');
    }
    expect(host.querySelector('.beaming-panel__amount')!.textContent).toContain('巻き量');
    p.update(make());
    expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent === '円盤調整完了')).toBe(true);
    p.destroy();
  });
});

describe('T3-06 (張りのメーターと糸を付ける段階の操作欄)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.textContent = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('巻き量の帯 (速さの目標の色の区間) は無い。代わりに張りのメーターがあり、範囲が巻き量で動く', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(beaming());
    expect(host.querySelector('.beaming-panel__band')).toBeNull();
    expect(host.querySelector('.tension-meter')).not.toBeNull();
    // 巻き量 50% (目標 100) では範囲は 90〜100。0% (目標 50) では 40〜60
    const zone = host.querySelector<HTMLElement>('.meter__zone')!;
    p.update({ ...beaming(), phase: 'beaming', progress: 0.5, tension: 95 });
    const left50 = zone.style.left;
    p.update({ ...beaming(), phase: 'beaming', progress: 0, tension: 50 });
    expect(zone.style.left).not.toBe(left50);
    p.destroy();
  });

  it('attach の段階では案内の1行が出る (「円盤調整完了」も「完了」も出ない)', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update({ ...beaming(), phase: 'attach' });
    expect(host.textContent).toContain('ドラムの糸を、ビームまで引っぱってください');
    const labels = Array.from(host.querySelectorAll('button'))
      .filter((b) => (b as HTMLElement).style.display !== 'none')
      .map((b) => b.textContent?.trim());
    expect(labels).not.toContain('円盤調整完了');
    expect(labels).not.toContain('完了');
    p.destroy();
  });

  it('「巻き始める」「確認」の言葉は操作欄に無い (T3-06 で名前を変えた)', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(beaming());
    p.update({ ...beaming(), phase: 'beaming', progress: 0.96, speed: 0 });
    expect(host.textContent).not.toContain('巻き始める');
    expect(host.textContent).not.toContain('確認');
    p.destroy();
  });
});

describe('PU-27: 円盤調整の目標と今の幅を大きく (setup)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.textContent = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  const setupWith = (left: number, right: number): BeamingState => ({ ...make(), leftCm: left, rightCm: right });
  const lines = (): string[] => Array.from(host.querySelectorAll('.beaming-panel__setup-line')).map((e) => e.textContent ?? '');

  it('1. 1 行目「目標 60cm」、2 行目「いま 66cm」、3 行目は差。巻き量の行 (setup では 0) は出さない', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(setupWith(-33, 33)); // いま 66cm、目標 60cm
    const [l1, l2, l3] = lines();
    expect(l1).toBe('目標 60cm');
    expect(l2).toBe('いま 66cm');
    expect(l3).toBe('あと 6cm 狭く ◀▶');
    expect((host.querySelector('.beaming-panel__amount') as HTMLElement).style.display).toBe('none');
    p.destroy();
  });

  it('2. 差の言葉: 狭すぎ →「あと N cm 広く ◀ ▶」、ぴったり →「ぴったり ○」(ぴったりだけ藍の印)', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(setupWith(-29, 29)); // 58cm、目標 60cm
    expect(lines()[2]).toBe('あと 2cm 広く ◀ ▶');
    expect(host.querySelector('.beaming-panel__setup-line--ok')).toBeNull();
    p.update(setupWith(-30, 30));
    expect(lines()[2]).toBe('ぴったり ○');
    expect(host.querySelector('.beaming-panel__setup-line--ok')).not.toBeNull();
    p.destroy();
  });

  it('3. 数字は 40px 以上、見出しと単位と差の行は 24px 以上 (base.css)。ほかの段階では出さない', () => {
    const css = readFileSync('src/styles/base.css', 'utf8');
    const num = css.match(/\.beaming-panel__setup-num\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(num.match(/font-size:\s*(\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(40);
    const line = css.match(/\.beaming-panel__setup-line\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(line.match(/font-size:\s*(\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(24);
    const p = createBeamingPanel(host, { terms, onAction: () => undefined });
    p.update(beaming());
    const block = host.querySelector('.beaming-panel__setup') as HTMLElement;
    expect(block.style.display).toBe('none');
    p.destroy();
  });
});

describe('PU-27: 依頼票 (柄の名前・巻き幅・帯の数)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.textContent = '';
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('1. 札に「依頼票」の見出し・柄の色の四角・柄の名前・「巻き幅 60cm」・「帯 3本」がある', () => {
    const p = createBeamingPanel(host, { terms, onAction: () => undefined, puzzle: { bands: 3, patternName: '紺の無地' }, patternHex: '#1f3a5f' });
    p.update(make());
    const t = host.querySelector('.order-ticket') as HTMLElement;
    expect(t).not.toBeNull();
    expect(t.querySelector('.order-ticket__title')!.textContent).toBe('依頼票');
    expect(t.querySelector('.order-ticket__name')!.textContent).toBe('紺の無地');
    expect(t.querySelector('.order-ticket__width')!.textContent).toBe('巻き幅 60cm');
    expect(t.querySelector('.order-ticket__bands')!.textContent).toBe('帯 3本');
    expect((t.querySelector('.order-ticket__swatch') as HTMLElement).style.background).not.toBe('');
    p.destroy();
  });

  it('2. 文字は 20px 以上で、「…」で省かない (text-overflow: ellipsis が無い・nowrap でない。折り返す)。色は既存の変数だけ', () => {
    const css = readFileSync('src/styles/base.css', 'utf8');
    const rules = Array.from(css.matchAll(/\.order-ticket[^{]*\{([^}]*)\}/g)).map((m) => m[1]!);
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r).not.toContain('text-overflow');
      expect(r).not.toContain('nowrap');
      expect(/#[0-9a-fA-F]{3,8}\b/.test(r)).toBe(false); // 新しい色を足さない
    }
    const body = css.match(/\.order-ticket\s*\{([^}]*)\}/)![1]!;
    expect(parseInt(body.match(/font-size:\s*(\d+)px/)![1]!, 10)).toBeGreaterThanOrEqual(20);
    // 横長の低い画面 (915×412・852×393) では巻き幅と帯の数を札ごと省く (柄の名前は残す)
    expect(css).toMatch(/@media[^{]*max-height[^{]*\{[^@]*\.order-ticket__detail/);
  });
});
