/**
 * Glicko-2 implementation (Mark Glickman, 2012).
 * Scale: 173.7178 internal units, default RD 350, volatility 0.06.
 */
const SCALE = 173.7178;
const TAU = 0.5;

export interface RatingState { rating: number; rd: number; volatility: number; }

function g(phi: number) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}
function expectedScore(mu: number, muJ: number, phiJ: number) {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

export function glicko2Update(player: RatingState, opponent: RatingState, score: 1 | 0 | 0.5): RatingState {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const muJ = (opponent.rating - 1500) / SCALE;
  const phiJ = opponent.rd / SCALE;
  const gJ = g(phiJ);
  const e = expectedScore(mu, muJ, phiJ);
  const v = 1 / (gJ * gJ * e * (1 - e));
  const delta = v * gJ * (score - e);

  const a = Math.log(player.volatility ** 2);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * (phi * phi + v + ex) ** 2;
    return num / den - (x - a) / (TAU * TAU);
  };
  // Illinois-variant root finding (Glickman 2012). Bounded iterations, monotone contraction.
  let A = a;
  let B = delta * delta > phi * phi + v ? Math.log(delta * delta - phi * phi - v) : a - TAU;
  let fA = f(A);
  let fB = f(B);
  let iterations = 0;
  while (Math.abs(B - A) > 1e-6 && iterations < 200) {
    iterations++;
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else { fA = fA / 2; }
    B = C;
    fB = fC;
  }
  const newVolatility = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + newVolatility * newVolatility);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gJ * (score - e);
  return {
    rating: Math.round((newMu * SCALE + 1500) * 10) / 10,
    rd: Math.round(newPhi * SCALE * 10) / 10,
    volatility: Math.round(newVolatility * 1e6) / 1e6,
  };
}

/** Display-only divisions. Explicitly not official chess titles. */
export const DIVISIONS = [
  { name: 'Bronze', min: 0, tone: '#B77A4B' },
  { name: 'Silver', min: 1200, tone: '#B8BFCC' },
  { name: 'Gold', min: 1400, tone: '#E8B84B' },
  { name: 'Platinum', min: 1600, tone: '#9EE7F5' },
  { name: 'Diamond', min: 1800, tone: '#CBA7FF' },
  { name: 'Master', min: 2000, tone: '#EF4444' },
];

export function divisionFor(rating: number) {
  return [...DIVISIONS].reverse().find(d => rating >= d.min) ?? DIVISIONS[0];
}

export const CATEGORIES = ['bullet', 'blitz', 'rapid', 'classical'] as const;
export type Category = (typeof CATEGORIES)[number];

export const TIME_CONTROLS: Record<Category, { label: string; seconds: number; increment: number; blurb: string }> = {
  bullet: { label: 'Bullet', seconds: 60, increment: 0, blurb: '1+0 — pure reflex' },
  blitz: { label: 'Blitz', seconds: 180, increment: 2, blurb: '3+2 — fast and tactical' },
  rapid: { label: 'Rapid', seconds: 600, increment: 5, blurb: '10+5 — balanced thinking time' },
  classical: { label: 'Classical', seconds: 1800, increment: 10, blurb: '30+10 — deep calculation' },
};

export function categoryFor(seconds: number, increment: number): Category {
  const estimate = seconds + increment * 40;
  if (estimate < 180) return 'bullet';
  if (estimate < 480) return 'blitz';
  if (estimate < 1500) return 'rapid';
  return 'classical';
}
