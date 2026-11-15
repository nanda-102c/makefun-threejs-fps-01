// The round machine: buy -> live -> (planted) -> end, then the next round, first to
// five rounds wins the match. It owns the timers and the score; main.js owns the
// actors and tells it what happened (kills, plant, defuse, detonation, wipe).
export const BUY_SECONDS = 15;
export const ROUND_SECONDS = 100;
export const BOMB_SECONDS = 30;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const END_SECONDS = 5;
export const ROUNDS_TO_WIN = 5;
export const MAX_ROUNDS = 9;

export function createRounds(onEvent) {
  const state = {
    phase: 'buy', // buy | live | planted | end | match
    round: 1,
    scoreAttacker: 0,
    scoreDefender: 0,
    timer: BUY_SECONDS,
    winner: null,
    matchWinner: null,
    reason: '',
  };

  function startRound() {
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.winner = null;
    state.reason = '';
    onEvent('roundStart', state);
  }

  function toLive() {
    state.phase = 'live';
    state.timer = ROUND_SECONDS;
    onEvent('roundLive', state);
  }

  function toPlanted() {
    state.phase = 'planted';
    state.timer = BOMB_SECONDS;
    onEvent('bombPlanted', state);
  }

  function endRound(winner, reason) {
    if (state.phase === 'end' || state.phase === 'match') return;
    state.phase = 'end';
    state.timer = END_SECONDS;
    state.winner = winner;
    state.reason = reason;
    if (winner === 'attacker') state.scoreAttacker += 1;
    else state.scoreDefender += 1;
    if (state.scoreAttacker >= ROUNDS_TO_WIN || state.scoreDefender >= ROUNDS_TO_WIN) {
      state.matchWinner = winner;
    }
    onEvent('roundEnd', state);
  }

  function step(dt) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) toLive();
    } else if (state.phase === 'live') {
      state.timer -= dt;
      if (state.timer <= 0) endRound('defender', 'Time expired — the spike was never planted');
    } else if (state.phase === 'planted') {
      state.timer -= dt;
      if (state.timer <= 0) endRound('attacker', 'The spike detonated');
    } else if (state.phase === 'end') {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.matchWinner) {
          state.phase = 'match';
          onEvent('matchEnd', state);
        } else {
          state.round += 1;
          startRound();
        }
      }
    }
  }

  return {
    state,
    startRound,
    toPlanted,
    endRound,
    step,
    resetMatch() {
      state.round = 1;
      state.scoreAttacker = 0;
      state.scoreDefender = 0;
      state.matchWinner = null;
      startRound();
    },
  };
}
