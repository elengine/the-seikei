/**
 * 結果表示。ほめる一言、星、成績、新しく集めた柄、「もう一度」「ホームへ」。
 * 押したボタンの値で解決する。表示後 1.5 秒の演出中もボタンは押せる。
 */
export function showResult(
  parent: HTMLElement,
  opts: {
    praise: string; // ほめる一言
    stars: 1 | 2 | 3;
    lines: string[]; // 成績 (例「継いだ本数 12本」)
    newPatternNames: string[]; // 新しく集めた柄 (空なら欄を出さない)
    againLabel: string;
    homeLabel: string;
  },
): Promise<'again' | 'home'> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.classList.add('dialog-backdrop');
    const box = document.createElement('div');
    box.classList.add('dialog', 'result');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');

    // ほめる一言
    const praise = document.createElement('p');
    praise.classList.add('result__praise');
    praise.textContent = opts.praise;
    box.appendChild(praise);

    // 星: ★ と ☆ の文字で表し、色だけに頼らない
    const stars = document.createElement('p');
    stars.classList.add('result-stars');
    stars.textContent = '★'.repeat(opts.stars) + '☆'.repeat(3 - opts.stars);
    stars.setAttribute('aria-label', `星${opts.stars}つ`);
    box.appendChild(stars);

    // 成績
    if (opts.lines.length > 0) {
      const lines = document.createElement('ul');
      lines.classList.add('result__lines');
      for (const line of opts.lines) {
        const li = document.createElement('li');
        li.textContent = line;
        lines.appendChild(li);
      }
      box.appendChild(lines);
    }

    // 新しく集めた柄 (空なら欄を出さない)
    if (opts.newPatternNames.length > 0) {
      const patterns = document.createElement('div');
      patterns.classList.add('result-patterns');
      const label = document.createElement('p');
      label.classList.add('result-patterns__label');
      label.textContent = 'あたらしく集めた柄';
      patterns.appendChild(label);
      const names = document.createElement('p');
      names.classList.add('result-patterns__names');
      names.textContent = opts.newPatternNames.join('・');
      patterns.appendChild(names);
      box.appendChild(patterns);
    }

    const actions = document.createElement('div');
    actions.classList.add('dialog__actions');
    for (const [label, value] of [
      [opts.againLabel, 'again'],
      [opts.homeLabel, 'home'],
    ] as const) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.classList.add('btn', value === 'again' ? 'btn--primary' : 'btn--secondary');
      btn.textContent = label;
      btn.addEventListener('click', () => {
        backdrop.remove();
        resolve(value);
      });
      actions.appendChild(btn);
    }
    box.appendChild(actions);
    backdrop.appendChild(box);
    parent.appendChild(backdrop);

    // 表示後 1.5 秒の演出 (演出中もボタンは押せる)。演出自体は結果の確定に影響しない
    setTimeout(() => {
      box.classList.add('result--settled');
    }, 1500);
  });
}
