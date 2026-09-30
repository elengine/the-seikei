
import 'fake-indexeddb/auto';
import { describe, it, vi } from 'vitest';
import { createWindingModule } from './index';
import { init, reduce, isValidResume } from './logic';
import { paramsOf } from './params';
import { createAppContext } from '../../app/context';
import { createFixedClock } from '../../core/clock/clock';

describe('dbg2', () => {
  it('mount with broken resume', async () => {
    const frames: Array<() => void> = [];
    vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void): number => { frames.push(() => cb(16)); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    const ctx = await createAppContext({ dbName: 'dbg2w-' + String(Math.random()).slice(2), clock: createFixedClock('2026-09-30T00:00:00Z'), navigate: () => undefined });
    const deps = { terms: ctx.terms, audio: ctx.audio, records: ctx.records, clock: ctx.clock, log: () => undefined };
    const p1 = paramsOf(1);
    let state = init({ level: 1, patternId: p1.patternId, sections: p1.sections, seed: 1 });
    state = reduce(state, { type: 'start' });
    state = reduce(state, { type: 'tick', dtMs: 1000 });
    state = reduce(state, { type: 'setPedal', value: 40 });
    state = reduce(state, { type: 'tick', dtMs: 5000 });
    state = { ...state, phase: 'broken', breaks: state.breaks + 1, brk: { kind: 'broken', thread: 0, firstTapped: false } };
    console.log('valid:', isValidResume(state));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const module = createWindingModule(deps);
    module.mount(container, { mode: 'standalone', resume: state, onFinish: () => undefined, onExit: () => undefined });
    console.log('panel:', container.querySelector('.winding-panel')?.textContent?.slice(0, 60));
    console.log('isList:', container.querySelector('.winding-list') !== null);
  }, 15000);
});
