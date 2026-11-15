// The look plan, in one place. STRIKE LANE is a dusk industrial yard: cold blue-grey
// concrete, warm amber site lights, and two team colours — amber for the attacking
// Strikers, teal for the defending Wardens. Every colour in the game is one of these.
export const PALETTE = {
  canvas: '#0e1216',
  surface: '#1b2128',
  hairline: '#2b333d',
  ink: '#ece7db',
  muted: '#8b95a0',
  accent: '#ffb02e',
  striker: '#ffb02e',
  warden: '#37c8a3',
  danger: '#e5484d',
  siteA: '#ffb02e',
  siteB: '#37c8a3',
  ground: '#2c333b',
  rust: '#7a4a2b',
  container: '#3d5a68',
  containerB: '#6b4a35',
  silo: '#9aa4ab',
};

export function shade(name) {
  return PALETTE[name];
}
