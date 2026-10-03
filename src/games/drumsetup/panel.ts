import { createButton, setLockedReason } from '../../core/ui/widgets';
import { createSectionHeading } from '../../core/ui/layout';
import { createChoice } from '../../core/ui/widgets';
import type { DrumSetupState, DrumSetupAction } from './logic';
import { density, thicknessPerTurn } from './logic';
import type { DrumSetupPuzzle } from './puzzles';
import { GRADE_LABEL, ANGLES, ALLOWED_ANGLES, YARN_COEF, FEED_STEP_SMALL, FEED_STEP_LARGE } from './params';

/**
 * ドラム設定の操作欄 (T2c-03a)。区画は上から:依頼書・計算のメモ・羽の角度・送り量。
 * 一番下に「電卓」「巻く」を固定する (詰めた形では操作欄が縦にスクロールし、主な操作は下に固定)。
 * メッセージは GameFrame の message 欄を使う (controller が書く)。この部品はメッセージ欄を作らない。
 */

export interface DrumSetupPanel {
  update(s: DrumSetupState): void;
  destroy(): void;
}

/** 計算のメモの行を作る (段階に応じて見せる数を減らす) */
function memoLines(p: DrumSetupPuzzle): string[] {
  const dens = `${Math.round(density(p) * 100) / 100}本/cm`;
  const thick = `${thicknessPerTurn(p).toFixed(3)}mm`;
  const tan = ANGLES.map((a) => `tan ${a}° = ${Math.tan((a * Math.PI) / 180).toFixed(4)}`).join('　');
  const coef = (Object.keys(YARN_COEF) as Array<keyof typeof YARN_COEF>)
    .map((g) => `${g}: ${YARN_COEF[g]}mm`)
    .join('　');
  switch (p.stage) {
    case 1:
      return [`密度 ${dens}`, `1回転の厚み ${thick}`, tan];
    case 2:
      return [`1回転の厚み ${thick}`, tan];
    case 3:
      return [`密度 ${dens}`, `厚みの係数 ${coef}`, tan];
    case 4:
      return [`厚みの係数 ${coef}`, tan];
    default:
      return []; // 段階5 は何も見せない (電卓の表を使う)
  }
}

export function createDrumSetupPanel(
  parent: HTMLElement,
  opts: {
    puzzle: DrumSetupPuzzle;
    onAction: (a: DrumSetupAction) => void;
    onOpenCalculator: () => void;
    onNotice: (text: string) => void;
  },
): DrumSetupPanel {
  const p = opts.puzzle;
  const root = document.createElement('div');
  root.className = 'drumsetup-panel';

  // 1. 依頼書
  const orderBox = document.createElement('section');
  orderBox.className = 'drumsetup-panel__block';
  orderBox.appendChild(createSectionHeading('依頼書'));
  const order = document.createElement('div');
  order.className = 'drumsetup-panel__order';
  order.dataset.testid = 'drumsetup-order';
  for (const line of [`番手 ${GRADE_LABEL[p.grade]}`, `帯 ${p.ends}本`, `幅 ${p.widthCm}cm`, p.name]) {
    const span = document.createElement('span');
    span.textContent = line;
    order.appendChild(span);
  }
  orderBox.appendChild(order);
  root.appendChild(orderBox);

  // 2. 計算のメモ
  const memoBox = document.createElement('section');
  memoBox.className = 'drumsetup-panel__block';
  memoBox.appendChild(createSectionHeading('計算のメモ'));
  const memo = document.createElement('div');
  memo.className = 'drumsetup-panel__memo';
  memo.dataset.testid = 'drumsetup-memo';
  for (const line of memoLines(p)) {
    const span = document.createElement('span');
    span.textContent = line;
    memo.appendChild(span);
  }
  if (p.stage >= 5) {
    const note = document.createElement('span');
    note.textContent = '表は電卓から見られます';
    memo.appendChild(note);
  }
  memoBox.appendChild(memo);
  root.appendChild(memoBox);

  // 3. 羽の角度 (その糸に使えない角度も選べる。段階1〜2 だけ使える角度に「○」を添える)
  const angleBox = document.createElement('section');
  angleBox.className = 'drumsetup-panel__block';
  angleBox.appendChild(createSectionHeading('羽の角度'));
  const allowed = ALLOWED_ANGLES[p.grade];
  const choice = createChoice<string>({
    options: ANGLES.map((a) => ({
      value: String(a),
      label: `${a}°${p.stage <= 2 && allowed.includes(a) ? '○' : ''}`,
    })),
    value: '',
    ariaLabel: '羽の角度',
    onChange: (v) => opts.onAction({ type: 'selectAngle', angle: Number(v) }),
  });
  // 「○」は角度の下に小さく出す (T2c-04a 2。文字を分けて改行する)
  for (const b of Array.from(choice.root.querySelectorAll('.choice__item'))) {
    const tn = Array.from(b.childNodes).find((n) => n.nodeType === 3);
    if (!tn) continue;
    const m = /^(.*?°)(○?)$/.exec(String(tn.textContent ?? ''));
    if (!m) continue;
    tn.textContent = m[1]!;
    if (m[2] === '○') {
      const mark = document.createElement('span');
      mark.className = 'drumsetup-panel__ok';
      mark.textContent = '○';
      mark.setAttribute('aria-hidden', 'true');
      b.appendChild(mark);
    }
  }
  // 1行に4つの格子にする (T2c-04a 2)
  choice.root.classList.add('drumsetup-panel__angles');
  angleBox.appendChild(choice.root);
  root.appendChild(angleBox);

  // 4. 送り量 (大きな数字。押すと電卓を開く)
  const feedBox = document.createElement('section');
  feedBox.className = 'drumsetup-panel__block';
  feedBox.appendChild(createSectionHeading('送り量'));
  const feedValue = document.createElement('button');
  feedValue.type = 'button';
  feedValue.className = 'drumsetup-panel__feed';
  feedValue.dataset.testid = 'drumsetup-feed';
  feedValue.addEventListener('click', () => opts.onOpenCalculator());
  feedBox.appendChild(feedValue);
  const feedRow = document.createElement('div');
  feedRow.className = 'drumsetup-panel__steps';
  for (const [label, delta] of [['−0.1', -FEED_STEP_LARGE], ['−0.01', -FEED_STEP_SMALL], ['+0.01', FEED_STEP_SMALL], ['+0.1', FEED_STEP_LARGE]] as const) {
    const b = createButton({ label, onClick: () => opts.onAction({ type: 'stepFeed', delta }) });
    feedRow.appendChild(b);
  }
  feedBox.appendChild(feedRow);
  root.appendChild(feedBox);

  // 5. 一番下の主な操作 (電卓・巻く。星3でない結果のあとは「ここで終える」)
  const buttonRow = document.createElement('div');
  buttonRow.className = 'drumsetup-panel__actions';
  const calcBtn = createButton({
    label: '電卓',
    variant: 'secondary',
    onClick: () => opts.onOpenCalculator(),
    onLocked: (reason) => opts.onNotice(reason),
  });
  const trialBtn = createButton({
    label: '巻く',
    variant: 'primary',
    onClick: () => opts.onAction({ type: 'trial' }),
    onLocked: (reason) => opts.onNotice(reason),
  });
  trialBtn.classList.add('drumsetup-panel__main');
  const finishBtn = createButton({ label: 'ここで終える', variant: 'secondary', onClick: () => opts.onAction({ type: 'finish' }) });
  buttonRow.appendChild(calcBtn);
  buttonRow.appendChild(trialBtn);
  buttonRow.appendChild(finishBtn);
  root.appendChild(buttonRow);

  parent.appendChild(root);

  const TRIAL_LOCK_TEXT = '巻いているあいだは待ってください';

  return {
    update(s: DrumSetupState): void {
      choice.setValue(s.angle !== null ? String(s.angle) : '');
      feedValue.textContent = `${s.feed.toFixed(2)} mm`;
      const trialLocked = s.phase === 'trial';
      setLockedReason(calcBtn, trialLocked ? TRIAL_LOCK_TEXT : null);
      setLockedReason(trialBtn, trialLocked ? TRIAL_LOCK_TEXT : null);
      // 星3でない結果のあとだけ「ここで終える」を出す
      finishBtn.style.display =
        s.phase === 'setting' && s.lastResult !== null && s.lastResult.stars !== 3 ? '' : 'none';
    },
    destroy(): void {
      root.remove();
    },
  };
}
