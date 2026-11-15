// STRIKE LANE — boot and the one loop: a fixed 60 Hz simulation feeding a render at
// the display's rate. The simulation (rounds, economy, bots, combat) lives apart from
// rendering; main.js wires them together and owns the one central state object.
// ?shot=buy|play|site|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP, nearestWaypoint } from './mapdata.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeaponRig, WEAPONS } from './weapons.js';
import { createBot } from './bots.js';
import { createCombat } from './combat.js';
import { createEconomy, START_MONEY } from './economy.js';
import { createRounds, PLANT_SECONDS, DEFUSE_SECONDS } from './rounds.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { mulberry32, clamp, segmentHitsBox } from './utils.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 26, 78);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const hud = createHud();
const economy = createEconomy();
const weaponRig = createWeaponRig(camera);
const player = createPlayer(world.colliders, 0, 17.5, 0);
const combat = createCombat(scene, world.colliders);

// Central state: everything the round, the bots and the HUD read lives here.
const game = {
  started: false,
  frozen: false,
  time: 0,
  plantProgress: 0,
  spectateId: -1,
  bobPhase: 0,
  kills: 0,
  deaths: 0,
  spike: { state: 'carried', carrier: 'player', x: 0, z: 17.5, site: -1 },
  lastThrower: null,
};

const rounds = createRounds(onRoundEvent);
const input = createInput(renderer.domElement, onLockChange, onKeyAction);

// --- Actors -----------------------------------------------------------------
// Combat sees one shape: { alive, state, team, name, headCenter, bodyCenter }.
const playerActor = {
  kind: 'player',
  name: 'YOU',
  team: 'attacker',
  get alive() { return player.alive; },
  state: player.state,
  headCenter(out) {
    out.set(player.state.position.x, player.state.position.y + player.state.height - 0.19, player.state.position.z);
    return out;
  },
  bodyCenter(out) {
    out.set(player.state.position.x, player.state.position.y + player.state.height * 0.58, player.state.position.z);
    return out;
  },
};

const ALLY_NAMES = ['VEX', 'ROOK'];
const ENEMY_NAMES = ['HAVOC', 'MIRA', 'JUNO', 'FALK'];
const bots = [];
for (let i = 0; i < 2; i += 1) {
  const handle = createBot(scene, {
    id: i, name: ALLY_NAMES[i], team: 'attacker',
    weaponId: i === 0 ? 'rifle' : 'smg', colliders: world.colliders, random,
  });
  bots.push({ kind: 'bot', handle, team: 'attacker', name: ALLY_NAMES[i] });
}
for (let i = 0; i < 4; i += 1) {
  const handle = createBot(scene, {
    id: 10 + i, name: ENEMY_NAMES[i], team: 'defender',
    weaponId: i % 2 === 0 ? 'rifle' : 'smg', colliders: world.colliders, random,
  });
  bots.push({ kind: 'bot', handle, team: 'defender', name: ENEMY_NAMES[i] });
}
for (const entry of bots) {
  entry.actor = {
    kind: 'bot',
    name: entry.name,
    team: entry.team,
    get alive() { return entry.handle.bot.alive; },
    state: entry.handle.bot.state,
    headCenter: entry.handle.headCenter,
    bodyCenter: entry.handle.bodyCenter,
  };
}
const allActors = [playerActor, ...bots.map((entry) => entry.actor)];
const allies = bots.filter((entry) => entry.team === 'attacker');
const enemies = bots.filter((entry) => entry.team === 'defender');

const tmpDir = new THREE.Vector3();
const tmpOrigin = new THREE.Vector3();
const tmpAim = new THREE.Vector3();
const tmpRight = new THREE.Vector3();
const tmpUp = new THREE.Vector3(0, 1, 0);

// --- Round events ------------------------------------------------------------
function onRoundEvent(type, state) {
  if (type === 'roundStart') {
    resetPositions();
    game.spike = { state: 'carried', carrier: 'player', x: 0, z: 17.5, site: -1 };
    game.plantProgress = 0;
    game.spectateId = -1;
    hud.hideBanner();
    hud.hidePlant();
    hud.setSpike('BUY PHASE — PRESS B FOR THE BUY MENU');
    hud.showBanner('BUY PHASE', 'Press B to buy — the round starts in 15 seconds', true, 3000);
    combat.clear();
    refreshBuyMarks();
  } else if (type === 'roundLive') {
    hud.hideBuy();
    hud.setSpike('SPIKE — PLANT IT AT A OR B');
    assignBots();
  } else if (type === 'bombPlanted') {
    hud.setSpike(`SPIKE PLANTED — ${state.timer.toFixed(0)}s TO DETONATION`);
    hud.showBanner('SPIKE PLANTED', 'Defend it — the Wardens are coming to defuse', true, 3000);
    audio.plant();
    for (const enemy of enemies) enemy.handle.goDefuse();
    for (const ally of allies) {
      if (ally.handle.bot.alive) ally.handle.defendSite(game.spike.site === 0 ? 9 : 10);
    }
  } else if (type === 'roundEnd') {
    const playerWon = state.winner === 'attacker';
    const reward = economy.roundEnd(playerWon);
    hud.setMoney(economy.cash);
    hud.setSpike('');
    hud.hidePlant();
    const title = playerWon ? 'ROUND WON' : 'ROUND LOST';
    hud.showBanner(title, `${state.reason} · +$${reward}`, playerWon, 4200);
    if (playerWon) audio.roundWin();
    else audio.roundLose();
    for (const entry of bots) entry.handle.bot.mode = 'wait';
  } else if (type === 'matchEnd') {
    const playerWon = state.matchWinner === 'attacker';
    hud.showBanner(
      playerWon ? 'STRIKERS WIN THE MATCH' : 'WARDENS WIN THE MATCH',
      `${state.scoreAttacker} — ${state.scoreDefender} · Click Deploy to play again`,
      playerWon,
      0,
    );
    hud.showOverlay('match');
    if (document.pointerLockElement) document.exitPointerLock();
  }
}

function resetPositions() {
  player.reset(MAP.spawns.attacker[0].x, MAP.spawns.attacker[0].z, 0);
  allies.forEach((ally, i) => {
    const spawn = MAP.spawns.attacker[i + 1];
    ally.handle.reset(spawn.x, spawn.z, 0, ally.handle.bot.weapon.id, -1);
  });
  enemies.forEach((enemy, i) => {
    const spawn = MAP.spawns.defender[i];
    enemy.handle.reset(spawn.x, spawn.z, Math.PI, enemy.handle.bot.weapon.id, -1);
  });
  for (const entry of bots) entry.handle.syncMesh(camera);
}

function assignBots() {
  const site = random() < 0.5 ? 0 : 1;
  const other = 1 - site;
  const siteNode = site === 0 ? 9 : 10;
  const otherNode = other === 0 ? 9 : 10;
  allies[0].handle.assign(site, siteNode);
  allies[1].handle.assign(other, otherNode);
  enemies[0].handle.assign(0, 9);
  enemies[1].handle.assign(0, 11);
  enemies[2].handle.assign(1, 10);
  enemies[3].handle.assign(1, 12);
}

// --- Damage, kills, spike ----------------------------------------------------
function applyDamage(victim, amount, isHead, shooter) {
  if (!victim.alive) return;
  if (victim.kind === 'player') {
    player.damage(amount);
    hud.flashDamage();
    hud.setHealth(player.health);
    audio.hurt();
    if (!player.alive) {
      game.deaths += 1;
      hud.showBanner('YOU ARE DOWN', 'Spectating your squad — the round plays on', false, 0);
      if (game.spike.state === 'carried' && game.spike.carrier === 'player') dropSpike();
      checkWipe();
    }
    return;
  }
  const entry = bots.find((item) => item.actor === victim);
  if (!entry) return;
  const remaining = entry.handle.damage(amount);
  if (remaining <= 0) {
    hud.feed(`${shooter ? shooter.name : '???'} ✕ ${victim.name}${isHead ? ' (headshot)' : ''}`, shooter === playerActor);
    if (shooter === playerActor) {
      game.kills += 1;
      economy.killReward();
      hud.setMoney(economy.cash);
      audio.kill();
    }
    if (entry.handle.bot.hasSpike) dropSpike();
    checkWipe();
  }
}

function dropSpike() {
  const carrier = game.spike.carrier === 'player' ? player.state.position : bots.find((b) => b.handle.bot.hasSpike)?.handle.bot.state.position;
  if (!carrier) return;
  game.spike = { state: 'dropped', carrier: null, x: carrier.x, z: carrier.z, site: -1 };
  for (const entry of bots) entry.handle.bot.hasSpike = false;
  hud.setSpike('SPIKE DROPPED — PICK IT UP');
  hud.feed('The spike was dropped', false);
}

function plantSpike(siteIndex) {
  game.spike = { state: 'planted', carrier: null, x: MAP.sites[siteIndex].x, z: MAP.sites[siteIndex].z, site: siteIndex };
  for (const entry of bots) {
    entry.handle.bot.hasSpike = false;
    entry.handle.bot.plantProgress = 0;
  }
  economy.add(300);
  hud.setMoney(economy.cash);
  rounds.toPlanted();
}

function checkWipe() {
  const attackersAlive = (player.alive ? 1 : 0) + allies.filter((a) => a.handle.bot.alive).length;
  const defendersAlive = enemies.filter((e) => e.handle.bot.alive).length;
  const phase = rounds.state.phase;
  if (phase !== 'live' && phase !== 'planted') return;
  if (defendersAlive === 0) {
    rounds.endRound('attacker', 'Wardens eliminated');
  } else if (attackersAlive === 0 && phase === 'live') {
    rounds.endRound('defender', 'Strikers eliminated');
  }
}

function spikePos() {
  if (game.spike.state === 'carried' && game.spike.carrier === 'player') {
    return { x: player.state.position.x, z: player.state.position.z };
  }
  if (game.spike.state === 'carried') {
    const carrier = bots.find((b) => b.handle.bot.hasSpike);
    if (carrier) return { x: carrier.handle.bot.state.position.x, z: carrier.handle.bot.state.position.z };
  }
  return { x: game.spike.x, z: game.spike.z };
}

// --- Shooting ----------------------------------------------------------------
function muzzlePosition(out) {
  camera.getWorldDirection(tmpDir);
  tmpRight.crossVectors(tmpDir, tmpUp).normalize();
  out.copy(camera.position).addScaledVector(tmpDir, 0.6).addScaledVector(tmpRight, 0.22);
  out.y -= 0.16;
  return out;
}

function alertBots(x, z, team) {
  for (const entry of bots) entry.handle.alert(x, z, team);
}

function playerShoot() {
  const def = weaponRig.def();
  if (!weaponRig.takeRound()) {
    audio.dry();
    return;
  }
  camera.getWorldDirection(tmpDir);
  const spread = weaponRig.spread(player.groundSpeed(), player.state.crouching, input.state.keys.has('ShiftLeft'));
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    tmpAim.copy(tmpDir);
    tmpAim.x += (random() * 2 - 1) * spread;
    tmpAim.y += (random() * 2 - 1) * spread;
    tmpAim.z += (random() * 2 - 1) * spread;
    tmpAim.normalize();
    muzzlePosition(tmpOrigin);
    const result = combat.resolveShot(tmpOrigin, tmpAim, playerActor, allActors, camera);
    combat.spawnTracer(tmpOrigin, result.point);
    if (result.hit) {
      const damage = Math.round(def.damage * (result.part === 'head' ? def.headMult : 1) * (result.distance > 28 ? 0.75 : 1));
      const wasAlive = result.target.alive;
      applyDamage(result.target, damage, result.part === 'head', playerActor);
      if (wasAlive) {
        hud.hitMarker(result.target.alive === false, 4000);
        if (result.target.alive) audio.hit();
      }
    }
  }
  weaponRig.pullTrigger();
  player.recoil(def.recoil * (0.8 + random() * 0.5), (random() * 2 - 1) * def.recoil * 0.4);
  alertBots(player.state.position.x, player.state.position.z, 'attacker');
  audio.shot(def.kind);
  hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, weaponRig.state.current, weaponRig.state.grenades);
}

function fireBotShot(botHandle, targetActor) {
  const bot = botHandle.bot;
  botHandle.eyePos(tmpOrigin);
  targetActor.bodyCenter(tmpAim);
  if (random() < 0.12) targetActor.headCenter(tmpAim);
  const dist = tmpOrigin.distanceTo(tmpAim);
  const targetSpeed = targetActor.kind === 'player'
    ? player.groundSpeed()
    : Math.hypot(targetActor.state.velocity.x, targetActor.state.velocity.z);
  const spread = (0.032 + dist * 0.0013 + targetSpeed * 0.0025 + botHandle.bot.state.velocity.length() * 0.002) * (1.2 - bot.skill * 0.25);
  tmpDir.copy(tmpAim).sub(tmpOrigin).normalize();
  tmpDir.x += (random() * 2 - 1) * spread;
  tmpDir.y += (random() * 2 - 1) * spread;
  tmpDir.z += (random() * 2 - 1) * spread;
  tmpDir.normalize();
  const result = combat.resolveShot(tmpOrigin, tmpDir, botHandle.actorRef, allActors, camera);
  combat.spawnTracer(tmpOrigin, result.point);
  if (result.hit) {
    const def = bot.weapon;
    const damage = Math.round(def.damage * (result.part === 'head' ? def.headMult : 1) * (dist > 20 ? 0.8 : 1));
    applyDamage(result.target, damage, result.part === 'head', botHandle.actorRef);
  }
  const playerDist = Math.hypot(player.state.position.x - bot.state.position.x, player.state.position.z - bot.state.position.z);
  if (playerDist < 26) audio.distantShot();
  alertBots(bot.state.position.x, bot.state.position.z, bot.team);
}

// --- Buy menu ----------------------------------------------------------------
function refreshBuyMarks() {
  for (const id of ['rifle', 'smg', 'shotgun']) {
    if (economy.owned[id]) hud.markBuy(id, 'owned');
    else if (economy.cash < WEAPONS[id].price) hud.markBuy(id, 'cant');
    else hud.markBuy(id, '');
  }
  if (economy.cash < 300) hud.markBuy('grenade', 'cant');
  else hud.markBuy('grenade', '');
}

function stashAmmo() {
  economy.owned[weaponRig.state.current] = { mag: weaponRig.state.mag, reserve: weaponRig.state.reserve };
}

function tryBuy(itemId) {
  if (rounds.state.phase !== 'buy') {
    audio.denied();
    return;
  }
  const result = economy.buy(itemId);
  if (!result.ok) {
    audio.denied();
    hud.feed(result.reason, false);
    return;
  }
  if (itemId === 'grenade') {
    weaponRig.state.grenades = Math.min(2, weaponRig.state.grenades + 1);
  } else {
    stashAmmo();
    weaponRig.equip(itemId, economy.owned[itemId]);
  }
  audio.buy();
  hud.setMoney(economy.cash);
  hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, weaponRig.state.current, weaponRig.state.grenades);
  refreshBuyMarks();
  hud.feed(`Bought ${result.item.name} — $${result.item.price}`, true);
}

hud.onBuy(tryBuy);
hud.onPlay(() => {
  audio.unlock();
  if (rounds.state.phase === 'match') {
    economy.resetMatch();
    weaponRig.state.grenades = 0;
    weaponRig.equip('pistol', economy.owned.pistol);
    rounds.resetMatch();
  } else if (!game.started) {
    game.started = true;
    rounds.startRound();
  }
  hud.hideOverlay();
  if (!shot) input.requestLock();
});

// --- Input actions -----------------------------------------------------------
let prevFiring = false;
function onKeyAction(code) {
  if (!game.started || shot) return;
  // While the buy menu is open, number keys buy instead of switching weapons.
  if (hud.buyOpen && /^Digit[1-4]$/.test(code)) {
    tryBuy({ Digit1: 'rifle', Digit2: 'smg', Digit3: 'shotgun', Digit4: 'grenade' }[code]);
    return;
  }
  if (code === 'KeyB') {
    if (rounds.state.phase === 'buy') {
      if (hud.buyOpen) {
        hud.hideBuy();
        input.requestLock();
      } else {
        hud.showBuy(economy.cash);
        refreshBuyMarks();
        input.exitLock();
      }
    }
    return;
  }
  if (code === 'Digit1') {
    if (weaponRig.state.current !== 'pistol') {
      stashAmmo();
      weaponRig.equip('pistol', economy.owned.pistol);
      hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, 'pistol', weaponRig.state.grenades);
    }
    return;
  }
  if (code === 'Digit2') {
    const owned = ['rifle', 'smg', 'shotgun'].filter((id) => economy.owned[id]);
    if (owned.length > 0) {
      const next = owned.find((id) => id !== weaponRig.state.current) ?? owned[0];
      stashAmmo();
      weaponRig.equip(next, economy.owned[next]);
      hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, next, weaponRig.state.grenades);
    } else {
      audio.denied();
    }
    return;
  }
  if (code === 'KeyR') {
    if (weaponRig.reload()) audio.reload();
    return;
  }
  if (code === 'KeyG') {
    if (weaponRig.state.grenades > 0 && !weaponRig.busy()) {
      weaponRig.state.grenades -= 1;
      camera.getWorldDirection(tmpDir);
      muzzlePosition(tmpOrigin);
      game.lastThrower = playerActor;
      combat.throwGrenade(tmpOrigin, tmpDir, 14, playerActor);
      audio.grenadePin();
      hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, weaponRig.state.current, weaponRig.state.grenades);
    } else {
      audio.denied();
    }
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (game.started && !hud.buyOpen && rounds.state.phase !== 'match') {
    hud.showOverlay('paused');
  }
}

// --- Bot context ---------------------------------------------------------------
const botCtx = {
  get time() { return game.time; },
  enemiesOf(bot) {
    if (bot.team === 'attacker') return [playerActor, ...enemies.map((e) => e.actor)];
    return [playerActor, ...allies.map((a) => a.actor)];
  },
  get spikeDropped() { return game.spike.state === 'dropped'; },
  get spikeCarried() { return game.spike.state === 'carried'; },
  get spikePos() { return spikePos(); },
  nearestAttackerToSpike() {
    const pos = spikePos();
    let best = null;
    let bestDist = Infinity;
    for (const ally of allies) {
      if (!ally.handle.bot.alive || ally.handle.bot.hasSpike) continue;
      const d = Math.hypot(ally.handle.bot.state.position.x - pos.x, ally.handle.bot.state.position.z - pos.z);
      if (d < bestDist) {
        bestDist = d;
        best = ally.handle;
      }
    }
    return best;
  },
  onSpikePickup(botHandle) {
    game.spike = { state: 'carried', carrier: 'bot', x: 0, z: 0, site: -1 };
    botHandle.bot.hasSpike = true;
    hud.setSpike(`${botHandle.bot.name} carries the spike`);
    hud.feed(`${botHandle.bot.name} picked up the spike`, true);
  },
  onPlantTick(botHandle) {
    if (game.spike.state !== 'carried' || botHandle.bot.plantProgress < PLANT_SECONDS) return;
    if (botHandle.bot.assignedSite == null) return;
    plantSpike(botHandle.bot.assignedSite);
  },
  onDefuseTick(botHandle) {
    if (game.spike.state !== 'planted') return;
    if (botHandle.bot.defuseProgress >= DEFUSE_SECONDS) {
      rounds.endRound('defender', 'Spike defused');
    }
  },
  fireBotShot(botHandle, targetActor) {
    fireBotShot(botHandle, targetActor);
  },
};
// Resolve-shot needs the shooting bot as an actor to exclude it; attach it here.
for (const entry of bots) entry.handle.actorRef = entry.actor;

// --- The fixed-step simulation -------------------------------------------------
function step(dt) {
  game.time += dt;
  world.step(dt, game.time);
  if (game.started) rounds.step(dt);
  weaponRig.step(dt);
  combat.stepFx(dt);

  const phase = rounds.state.phase;

  if (game.started && player.alive && phase !== 'match' && !hud.overlayOpen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    player.step(dt, input.state.keys);
    game.bobPhase += player.groundSpeed() * dt * 1.6;

    // Semi-auto weapons fire on the click edge; automatic ones while held.
    const firing = input.state.firing;
    const edge = firing && !prevFiring;
    prevFiring = firing;
    if (!hud.buyOpen) {
      const def = weaponRig.def();
      if ((def.auto && firing) || (!def.auto && edge)) {
        if (weaponRig.ready()) playerShoot();
      }
    }

    // Plant channel: hold E inside a site while carrying the spike, standing still.
    if (
      phase === 'live'
      && game.spike.state === 'carried'
      && game.spike.carrier === 'player'
      && input.state.keys.has('KeyE')
      && player.groundSpeed() < 0.6
    ) {
      const siteIndex = MAP.sites.findIndex((site) =>
        Math.hypot(site.x - player.state.position.x, site.z - player.state.position.z) < site.radius);
      if (siteIndex >= 0) {
        game.plantProgress += dt;
        hud.showPlant('PLANTING SPIKE', game.plantProgress / PLANT_SECONDS);
        if (game.plantProgress >= PLANT_SECONDS) {
          game.plantProgress = 0;
          hud.hidePlant();
          plantSpike(siteIndex);
        }
      } else {
        game.plantProgress = 0;
        hud.hidePlant();
      }
    } else {
      if (game.plantProgress > 0) {
        game.plantProgress = 0;
        hud.hidePlant();
      }
    }

    // Pick up a dropped spike by walking over it.
    if (game.spike.state === 'dropped') {
      const pos = spikePos();
      if (Math.hypot(pos.x - player.state.position.x, pos.z - player.state.position.z) < 1.3) {
        game.spike = { state: 'carried', carrier: 'player', x: 0, z: 0, site: -1 };
        hud.setSpike('SPIKE — PLANT IT AT A OR B');
        hud.feed('You picked up the spike', true);
      }
    }
  } else {
    input.takeLook();
    prevFiring = input.state.firing;
  }

  // Bots move once the round is live (or the bomb is ticking).
  if (game.started && (phase === 'live' || phase === 'planted' || phase === 'end')) {
    for (const entry of bots) {
      entry.handle.step(dt, botCtx);
      entry.handle.syncMesh(camera);
    }
  }

  combat.stepGrenades(dt, allActors, applyDamage, (pos) => {
    audio.explosion();
    hud.feed('HE-7 detonated', false);
    const dist = Math.hypot(player.state.position.x - pos.x, player.state.position.z - pos.z);
    if (dist < 12) hud.flashDamage();
  });

  // HUD: timer, score, alive counts, ammo, spike chip, minimap.
  hud.setTimer(rounds.state.timer, phase);
  hud.setScore(rounds.state.round, rounds.state.scoreAttacker, rounds.state.scoreDefender);
  hud.setAlive(
    (player.alive ? 1 : 0) + allies.filter((a) => a.handle.bot.alive).length,
    enemies.filter((e) => e.handle.bot.alive).length,
  );
  hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, weaponRig.state.current, weaponRig.state.grenades);
  hud.setCrosshair(weaponRig.spread(player.groundSpeed(), player.state.crouching, input.state.keys.has('ShiftLeft')));
  if (phase === 'planted') {
    hud.setSpike(`SPIKE PLANTED — ${Math.ceil(rounds.state.timer)}s TO DETONATION`);
  }
  drawMinimapDots();
}

const minimapDots = [];
function drawMinimapDots() {
  minimapDots.length = 0;
  minimapDots.push({ x: player.state.position.x, z: player.state.position.z, color: '#ffb02e', size: 4 });
  for (const ally of allies) {
    if (!ally.handle.bot.alive) continue;
    minimapDots.push({ x: ally.handle.bot.state.position.x, z: ally.handle.bot.state.position.z, color: '#ffe1a1', size: 3 });
  }
  for (const enemy of enemies) {
    if (!enemy.handle.bot.alive) continue;
    const seen = enemy.handle.bot.lastSeenBy > 0 && game.time - enemy.handle.bot.lastSeenBy < 3;
    if (seen) minimapDots.push({ x: enemy.handle.bot.state.position.x, z: enemy.handle.bot.state.position.z, color: '#e5484d', size: 3 });
  }
  if (game.spike.state === 'dropped' || game.spike.state === 'planted') {
    const pos = spikePos();
    minimapDots.push({ x: pos.x, z: pos.z, color: '#ffffff', size: 3 });
  }
  hud.drawMinimap(minimapDots);
}

// Mark enemies the player can see, so the minimap shows them briefly.
let seenScan = 0;
function scanSeen(dt) {
  seenScan -= dt;
  if (seenScan > 0) return;
  seenScan = 0.2;
  camera.getWorldDirection(tmpDir);
  for (const enemy of enemies) {
    if (!enemy.handle.bot.alive) continue;
    const p = enemy.handle.bot.state.position;
    tmpAim.set(p.x - camera.position.x, (p.y + 1.1) - camera.position.y, p.z - camera.position.z);
    const dist = tmpAim.length();
    if (dist > 45) continue;
    tmpAim.normalize();
    if (tmpDir.dot(tmpAim) < 0.55) continue;
    let blocked = false;
    for (const box of world.colliders) {
      if (segmentHitsBox0(camera.position, tmpAim, dist, box)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) enemy.handle.bot.lastSeenBy = game.time;
  }
}

function segmentHitsBox0(origin, dir, dist, box) {
  return segmentHitsBox(
    origin.x, origin.y, origin.z,
    origin.x + dir.x * dist, origin.y + dir.y * dist, origin.z + dir.z * dist,
    box.min, box.max,
  );
}

function syncCamera() {
  const spectate = !player.alive
    ? bots.find((entry) => entry.handle.bot.alive && entry.team === 'attacker')
    : null;
  if (spectate) {
    const s = spectate.handle.bot.state;
    camera.position.set(s.position.x, s.position.y + s.eye, s.position.z);
    camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ');
    return;
  }
  const bob = Math.sin(game.bobPhase) * 0.018 * Math.min(1, player.groundSpeed() / 5.2);
  camera.position.set(player.state.position.x, player.state.position.y + player.state.eye + bob, player.state.position.z);
  camera.rotation.set(player.state.pitch, player.state.yaw, 0, 'YXZ');
}

let accumulator = 0;
let lastTime = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!game.frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    scanSeen(dt);
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function aimAt(point) {
  const p = player.state;
  const dx = point.x - p.position.x;
  const dy = point.y - (p.position.y + p.eye);
  const dz = point.z - p.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(clamp(dy / length, -1, 1));
  syncCamera();
}

function runShot(name) {
  game.started = true;
  hud.hideOverlay();
  hud.hideBuy();
  if (name === 'buy') {
    resetPositions();
    settle(20);
    for (const enemy of enemies) {
      enemy.handle.reset(MAP.spawns.defender[enemies.indexOf(enemy)].x, MAP.spawns.defender[enemies.indexOf(enemy)].z, Math.PI, enemy.handle.bot.weapon.id, -1);
      enemy.handle.syncMesh(camera);
    }
    hud.showBuy(economy.cash);
    refreshBuyMarks();
    aimAt(new THREE.Vector3(0, 1.4, -6));
  } else if (name === 'play') {
    rounds.state.phase = 'live';
    rounds.state.timer = 87;
    resetPositions();
    player.mover.teleport(0, 10, 0);
    const enemy = enemies[2]; // JUNO, one pistol body shot from death
    enemy.handle.reset(2, -3, Math.PI, 'rifle', -1);
    enemy.handle.bot.health = 26;
    enemy.handle.syncMesh(camera);
    const enemy2 = enemies[1];
    enemy2.handle.reset(-6, -1, Math.PI, 'smg', -1);
    enemy2.handle.syncMesh(camera);
    allies[0].handle.reset(-4, 6, 0, 'rifle', -1);
    allies[0].handle.syncMesh(camera);
    settle(10);
    aimAt(new THREE.Vector3(2, 1.1, -3));
    if (weaponRig.ready()) playerShoot();
    settle(2);
  } else if (name === 'site') {
    rounds.state.phase = 'planted';
    rounds.state.timer = 24;
    game.spike = { state: 'planted', carrier: null, x: MAP.sites[0].x, z: MAP.sites[0].z, site: 0 };
    resetPositions();
    player.mover.teleport(-14, -5, 0);
    const enemy = enemies[2];
    enemy.handle.reset(-19.5, -10.2, 0, 'rifle', -1);
    enemy.handle.syncMesh(camera);
    const enemy2 = enemies[3];
    enemy2.handle.reset(-24, -8.5, 0, 'smg', -1);
    enemy2.handle.syncMesh(camera);
    allies[0].handle.reset(-17, -7, 0, 'rifle', -1);
    allies[0].handle.syncMesh(camera);
    settle(10);
    aimAt(new THREE.Vector3(-21, 1.2, -11));
    hud.setSpike('SPIKE PLANTED — 24s TO DETONATION');
    hud.showPlant('DEFUSE IN PROGRESS — WARDEN', 0.42);
  } else if (name === 'end') {
    rounds.state.scoreAttacker = 1;
    rounds.state.scoreDefender = 0;
    rounds.state.round = 2;
    rounds.state.phase = 'end';
    rounds.state.timer = 4;
    resetPositions();
    for (const enemy of enemies) enemy.handle.damage(100);
    player.mover.teleport(0, 12, 0);
    settle(10);
    aimAt(new THREE.Vector3(0, 1.4, -6));
    hud.showBanner('ROUND WON', 'Wardens eliminated · +$3250', true, 0);
    hud.setScore(2, 1, 0);
  }
  hud.setTimer(rounds.state.timer, rounds.state.phase);
  hud.setScore(rounds.state.round, rounds.state.scoreAttacker, rounds.state.scoreDefender);
  hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, weaponRig.state.current, weaponRig.state.grenades);
  hud.setHealth(player.health);
  hud.setMoney(economy.cash);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      game.frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

// Debug handle for play-testing: read-only state plus a few test helpers.
window.__strike = {
  version: 1,
  get state() {
    return {
      phase: rounds.state.phase,
      round: rounds.state.round,
      timer: Math.round(rounds.state.timer * 10) / 10,
      score: [rounds.state.scoreAttacker, rounds.state.scoreDefender],
      money: economy.cash,
      player: {
        hp: player.health, alive: player.alive,
        x: +player.state.position.x.toFixed(2), z: +player.state.position.z.toFixed(2),
        ammo: weaponRig.state.mag, reserve: weaponRig.state.reserve,
        weapon: weaponRig.state.current, grenades: weaponRig.state.grenades,
      },
      spike: game.spike.state,
      plant: Math.round(game.plantProgress * 100) / 100,
      keys: [...input.state.keys],
      overlayOpen: hud.overlayOpen,
      bots: bots.map((entry) => ({
        name: entry.name, team: entry.team, hp: entry.handle.bot.health,
        alive: entry.handle.bot.alive, mode: entry.handle.bot.mode,
        x: +entry.handle.bot.state.position.x.toFixed(1), z: +entry.handle.bot.state.position.z.toFixed(1),
      })),
      kills: game.kills,
    };
  },
  teleport(x, z, yaw) {
    player.mover.teleport(x, z, yaw);
    syncCamera();
  },
  giveMoney(amount) {
    economy.add(amount);
    hud.setMoney(economy.cash);
  },
  start() {
    if (!game.started) {
      game.started = true;
      hud.hideOverlay();
    }
  },
  // Aim the view at a world point (play-testing helper).
  aimAt(x, y, z) {
    const p = player.state;
    const dx = x - p.position.x;
    const dy = y - (p.position.y + p.eye);
    const dz = z - p.position.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    p.yaw = Math.atan2(-dx, -dz);
    p.pitch = Math.asin(clamp(dy / length, -1, 1));
    syncCamera();
  },
  // Fire one shot through the real shooting path (play-testing helper).
  testShoot() {
    if (weaponRig.ready()) playerShoot();
  },
  // Jump the round timer (play-testing helper).
  setTimer(seconds) {
    rounds.state.timer = seconds;
  },
};

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

resetPositions();
hud.setAmmo(weaponRig.state.mag, weaponRig.state.reserve, 'pistol', 0);
hud.setHealth(100);
hud.setMoney(START_MONEY);
hud.setTimer(rounds.state.timer, 'buy');
hud.setScore(1, 0, 0);
syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
