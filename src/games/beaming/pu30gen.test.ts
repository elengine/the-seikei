import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { init, reduce } from './logic';
import type { BeamingState } from './logic';

// PU-30 のブラウザ確認用: 2つの状態 JSON を書き出す (attach・巻き 40% の beaming)
it('gen states', () => {
  let s: BeamingState = init({ level: 1, widthCm: 60, seed: 42, puzzleId: 's1', patternId: 'p-muji-kon' });
  s = reduce(s, { type: 'moveFlange', side: 'left', deltaCm: -30 - s.leftCm });
  s = reduce(s, { type: 'moveFlange', side: 'right', deltaCm: 30 - s.rightCm });
  const attach = reduce(s, { type: 'finishSetup' });
  writeFileSync('/opt/data/cache/scratch/pu30-state-attach.json', JSON.stringify(attach));
  s = reduce(attach, { type: 'attachThread' });
  s = { ...s, progress: 0.4 };
  writeFileSync('/opt/data/cache/scratch/pu30-state-beam.json', JSON.stringify(s));
});
