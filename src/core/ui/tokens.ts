export const COLORS = {
  kinari: '#F7F3E8',
  kinariDeep: '#EFE9DA',
  white: '#FFFFFF',
  line: '#D9D2C0',
  lineSoft: '#EFE9DA',
  sumi: '#2B2A24',
  sumiSub: '#4A473F',
  muted: '#6B675C',
  ai: '#1F3A5F',
  aiPressed: '#16304F',
  aiShadow: '#0F2138',
  btnShadow: '#C9C1AC',
  aiTint: '#DCE3EC',
  wood: '#8A5A3B',
  woodLight: '#B08A5E',
  gold: '#B07A1E',
  starOff: '#E2DBC8',
  shu: '#A33A22',
  lockBorder: '#8D96A5',
  machineDark: '#4F5B47',
  machine: '#8C9A7E',
  machineLight: '#A9B39C',
  steel: '#B8BEC4',
  messageBg: '#F3F0E6',
  creelBack: '#E6DECB',
  post: '#6E8A5E',
  postLight: '#86A276',
  postDark: '#4F6843',
} as const;

/** 余白の刻み (--sp-1〜--sp-8) */
export const SPACE = [4, 8, 12, 16, 20, 24, 32, 48] as const;

/** 角の丸み (--r-*) */
export const RADIUS = { small: 8, button: 12, card: 14, dialog: 16 } as const;

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

export const FONT_FAMILY = '"BIZ UDPGothic", "Hiragino Sans", "Noto Sans JP", sans-serif';

/** 題名・見出し用 (明朝) */
export const FONT_FAMILY_HEADING = '"Shippori Mincho", "Hiragino Mincho ProN", serif';

/** root の data-font 属性を設定する */
export function applyFontScale(root: HTMLElement, scale: FontScale): void {
  root.dataset.font = scale;
}
