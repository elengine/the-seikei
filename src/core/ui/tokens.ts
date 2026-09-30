export const COLORS = {
  kinari: '#F7F3E8',
  sumi: '#2B2A24',
  sumiSub: '#5A574C',
  machineDark: '#4F5B47',
  machine: '#8C9A7E',
  machineLight: '#A9B39C',
  wood: '#8A5A3C',
  steel: '#B8BEC4',
  shu: '#B03A2E',
  ai: '#2F4A6D',
  white: '#FFFFFF',
} as const;

export type FontScale = 'large' | 'xlarge';

export const FONT = {
  large: { body: 20, button: 22, label: 24, heading: 28, number: 32 },
  xlarge: { body: 24, button: 26, label: 28, heading: 34, number: 38 },
} as const;

export const SIZE = {
  buttonMinH: 64,
  buttonMinW: 120,
  iconButton: 64,
  gap: 12,
  radius: 12,
  hitMin: 64,
} as const;

export const MOTION = { normalMs: 400, celebrateMs: 1500 } as const;

export const FONT_FAMILY = '"Hiragino Sans", "Noto Sans JP", sans-serif';

/** root の data-font 属性を設定する */
export function applyFontScale(root: HTMLElement, scale: FontScale): void {
  root.dataset.font = scale;
}
