// The economy: money earned per round and per kill, spent in the buy menu between
// rounds. Prices are the game's own; a loss streak grows the loss bonus, so a team
// that keeps losing can still buy back into the match.
import { WEAPONS, GRENADE } from './weapons.js';

export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const PLANT_REWARD = 300;
export const LOSS_REWARDS = [1900, 2400, 2900, 3400];

export function createEconomy() {
  const money = { player: START_MONEY };
  const owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
  let lossStreak = 0;

  function buy(itemId) {
    if (itemId === 'grenade') {
      if (money.player < GRENADE.price) return { ok: false, reason: 'Not enough money' };
      money.player -= GRENADE.price;
      return { ok: true, item: GRENADE };
    }
    const def = WEAPONS[itemId];
    if (!def || itemId === 'pistol') return { ok: false, reason: 'Not for sale' };
    if (owned[itemId]) return { ok: false, reason: 'Already owned' };
    if (money.player < def.price) return { ok: false, reason: 'Not enough money' };
    money.player -= def.price;
    owned[itemId] = { mag: def.mag, reserve: def.reserve };
    return { ok: true, item: def };
  }

  return {
    money,
    owned,
    get cash() {
      return money.player;
    },
    add(amount) {
      money.player += amount;
    },
    buy,
    resetMatch() {
      money.player = START_MONEY;
      lossStreak = 0;
      for (const key of Object.keys(owned)) delete owned[key];
      owned.pistol = { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve };
    },
    roundEnd(won) {
      if (won) {
        money.player += WIN_REWARD;
        lossStreak = 0;
        return WIN_REWARD;
      }
      const reward = LOSS_REWARDS[Math.min(lossStreak, LOSS_REWARDS.length - 1)];
      money.player += reward;
      lossStreak += 1;
      return reward;
    },
    killReward() {
      money.player += KILL_REWARD;
      return KILL_REWARD;
    },
  };
}
