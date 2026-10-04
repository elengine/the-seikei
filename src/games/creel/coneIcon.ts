/**
 * コーン (チーズ) の小さな絵 (PU-12c)。糸の色の丸・紙の芯の色の輪・中央の穴。
 * 箱の中と依頼書の行で同じ部品を使う (引っぱるチーズ .creel-drag と同じ描き方で、色は CSS 変数で渡す)。
 * 大きさは呼び出し側のクラスの CSS で決める。
 */
export function createConeIcon(opts: { bodyHex?: string; coreHex?: string; label?: string; className?: string }): HTMLElement {
  const cone = document.createElement('span');
  cone.classList.add('cone-icon');
  if (opts.className !== undefined) {
    cone.classList.add(opts.className);
  }
  if (opts.label !== undefined) {
    cone.setAttribute('role', 'img');
    cone.setAttribute('aria-label', opts.label);
  } else {
    cone.setAttribute('aria-hidden', 'true');
  }
  if (opts.bodyHex !== undefined) {
    cone.style.setProperty('--creel-drag-body', opts.bodyHex);
  }
  if (opts.coreHex !== undefined) {
    cone.style.setProperty('--creel-drag-core', opts.coreHex);
  }
  const ring = document.createElement('span');
  ring.classList.add('creel-drag__core');
  const hole = document.createElement('span');
  hole.classList.add('creel-drag__hole');
  ring.appendChild(hole);
  cone.appendChild(ring);
  return cone;
}
