export const FALLBACK_TEAM_COLOR = '#334155'

/** Primary color per NBA team abbreviation (as returned by balldontlie). */
export const TEAM_COLORS: Readonly<Record<string, string>> = {
  ATL: '#E03A3E',
  BOS: '#007A33',
  BKN: '#000000',
  CHA: '#1D1160',
  CHI: '#CE1141',
  CLE: '#860038',
  DAL: '#00538C',
  DEN: '#0E2240',
  DET: '#C8102E',
  GSW: '#1D428A',
  HOU: '#CE1141',
  IND: '#002D62',
  LAC: '#C8102E',
  LAL: '#552583',
  MEM: '#5D76A9',
  MIA: '#98002E',
  MIL: '#00471B',
  MIN: '#0C2340',
  NOP: '#0C2340',
  NYK: '#006BB6',
  OKC: '#007AC1',
  ORL: '#0077C0',
  PHI: '#006BB6',
  PHX: '#1D1160',
  POR: '#E03A3E',
  SAC: '#5A2D81',
  SAS: '#C4CED4',
  TOR: '#CE1141',
  UTA: '#002B5C',
  WAS: '#002B5C',
}

export function teamColor(abbr: string): string {
  return TEAM_COLORS[abbr.trim().toUpperCase()] ?? FALLBACK_TEAM_COLOR
}

/** Dark text on light team colors, white text otherwise (WCAG relative luminance). */
export function teamTextColor(hex: string): '#0b0f14' | '#ffffff' {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2)
  return luminance > 0.4 ? '#0b0f14' : '#ffffff'
}
