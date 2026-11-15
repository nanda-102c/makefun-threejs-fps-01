// The bots: six soldiers who walk the waypoint graph, hold sites, see and hear, and
// shoot back. A bot thinks in modes — push, hold, engage, hunt, fetch, plant, defuse,
// defend, wait — and re-plans when the round state changes. Perception is a real
// line-of-sight test against the world's colliders, not a distance cheat.
import * as THREE from 'three';
import { createMover } from './mover.js';
import { PALETTE } from './palette.js';
import { MAP, findPath, nearestWaypoint } from './mapdata.js';
import { segmentHitsBox, clamp } from './utils.js';
import { WEAPONS } from './weapons.js';

const BOT_SPEED = 4.2;
const REACTION_MIN = 0.35;
const REACTION_MAX = 0.75;
const SIGHT_RANGE = 55;
const HEAR_RANGE = 24;
const HEAD_Y = 1.53;
const BODY_Y = 1.0;

function hasLineOfSight(from, to, colliders) {
  for (const box of colliders) {
    if (segmentHitsBox(from.x, from.y, from.z, to.x, to.y, to.z, box.min, box.max)) return false;
  }
  return true;
}

function buildBotMesh(team) {
  const group = new THREE.Group();
  const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(team === 'attacker' ? PALETTE.striker : PALETTE.warden), roughness: 0.5, metalness: 0.2 });
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2e343b'), roughness: 0.85, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a184'), roughness: 0.7 });
  const gun = new THREE.MeshStandardMaterial({ color: new THREE.Color('#15181c'), roughness: 0.6, metalness: 0.3 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.8, 0.32), cloth);
  torso.position.y = 1.06;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.5, 0.36), trim);
  vest.position.y = 1.12;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), skin);
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), trim);
  helmet.position.y = 1.65;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.62, 0.28), cloth);
  legs.position.y = 0.31;
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.62), gun);
  rifle.position.set(0.28, 1.18, -0.2);
  group.add(torso, vest, head, helmet, legs, rifle);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  // Health bar that always faces the camera.
  const bar = new THREE.Group();
  const barBg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.09),
    new THREE.MeshBasicMaterial({ color: 0x111417, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  const barFg = new THREE.Mesh(
    new THREE.PlaneGeometry(0.68, 0.06),
    new THREE.MeshBasicMaterial({ color: team === 'attacker' ? 0xffb02e : 0x37c8a3, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  barFg.position.z = 0.001;
  bar.add(barBg, barFg);
  bar.position.y = 2.0;
  group.add(bar);
  return { group, bar, barFg };
}

export function createBot(scene, options) {
  const { id, name, team, weaponId, colliders, random } = options;
  const mover = createMover(colliders, 0, 17, 0);
  const body = mover.state;
  const def = WEAPONS[weaponId];
  const visuals = buildBotMesh(team);
  scene.add(visuals.group);

  const bot = {
    id,
    name,
    team,
    mover,
    state: body,
    mesh: visuals.group,
    bar: visuals.bar,
    barFg: visuals.barFg,
    weapon: def,
    health: 100,
    alive: true,
    mode: 'wait',
    path: [],
    pathIndex: 0,
    target: null,
    lastSeen: null, // { x, y, z, time }
    lastSeenBy: 0,
    scanTimer: random() * 0.12,
    reactionLeft: 0,
    burstLeft: 0,
    shotGap: 0,
    pauseLeft: 0,
    ammo: def.mag,
    reloadLeft: 0,
    holdNode: -1,
    assignedSite: null,
    hasSpike: false,
    plantProgress: 0,
    defuseProgress: 0,
    strafeDir: 1,
    strafeTimer: 0,
    huntTimer: 0,
    fall: 0,
    skill: 0.85 + random() * 0.35,
  };

  function eyePos(out) {
    out.set(body.position.x, body.position.y + body.eye, body.position.z);
    return out;
  }

  function targetChest(target, out) {
    const t = target.state;
    out.set(t.position.x, t.position.y + BODY_Y, t.position.z);
    return out;
  }

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  function canSee(target) {
    const t = target.state;
    const dx = t.position.x - body.position.x;
    const dz = t.position.z - body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > SIGHT_RANGE) return false;
    // Facing: bots notice what is in front of them, or anything very close.
    const facingX = -Math.sin(body.yaw);
    const facingZ = -Math.cos(body.yaw);
    const dot = (dx * facingX + dz * facingZ) / Math.max(0.01, dist);
    if (dist > 6 && dot < 0.1) return false;
    eyePos(tmpA);
    targetChest(target, tmpB);
    return hasLineOfSight(tmpA, tmpB, colliders);
  }

  function setPathTo(node) {
    const from = nearestWaypoint(body.position.x, body.position.z);
    bot.path = findPath(from, node);
    bot.pathIndex = 0;
  }

  function followPath(dt) {
    if (bot.pathIndex >= bot.path.length) return true;
    const node = MAP.waypoints[bot.path[bot.pathIndex]];
    const dx = node.x - body.position.x;
    const dz = node.z - body.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.7) {
      bot.pathIndex += 1;
      return bot.pathIndex >= bot.path.length;
    }
    const wishX = dx / dist;
    const wishZ = dz / dist;
    mover.step(dt, wishX, wishZ, BOT_SPEED, false, false);
    body.yaw = Math.atan2(-wishX, -wishZ);
    return false;
  }

  function faceToward(x, z, dt) {
    const want = Math.atan2(-(x - body.position.x), -(z - body.position.z));
    let diff = want - body.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    body.yaw += clamp(diff, -dt * 7, dt * 7);
  }

  function startBurst() {
    bot.burstLeft = 3 + Math.floor(random() * 3);
    bot.pauseLeft = 0;
  }

  function step(dt, ctx) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.mesh.rotation.x = -bot.fall * 1.45;
      bot.mesh.position.y = -bot.fall * 0.08;
      bot.bar.visible = false;
      return;
    }
    const time = ctx.time;

    // Perception, staggered so six bots do not all scan on the same tick.
    bot.scanTimer -= dt;
    if (bot.scanTimer <= 0) {
      bot.scanTimer = 0.12;
      let best = null;
      let bestDist = Infinity;
      for (const enemy of ctx.enemiesOf(bot)) {
        if (!enemy.alive) continue;
        if (!canSee(enemy)) continue;
        const d = Math.hypot(enemy.state.position.x - body.position.x, enemy.state.position.z - body.position.z);
        if (d < bestDist) {
          bestDist = d;
          best = enemy;
        }
      }
      if (best) {
        if (bot.target !== best) bot.reactionLeft = REACTION_MIN + random() * (REACTION_MAX - REACTION_MIN);
        bot.target = best;
        bot.lastSeen = { x: best.state.position.x, y: best.state.position.y + BODY_Y, z: best.state.position.z, time };
        bot.mode = 'engage';
      } else if (bot.target) {
        // Lost sight: keep hunting the last known spot briefly.
        if (time - (bot.lastSeen?.time ?? 0) > 2.5) {
          bot.target = null;
          if (bot.mode === 'engage') {
            bot.mode = 'hunt';
            bot.huntTimer = 2;
            if (bot.lastSeen) setPathTo(nearestWaypoint(bot.lastSeen.x, bot.lastSeen.z));
          }
        }
      }
    }

    if (bot.reloadLeft > 0) {
      bot.reloadLeft -= dt;
      if (bot.reloadLeft <= 0) bot.ammo = bot.weapon.mag;
    }

    switch (bot.mode) {
      case 'push': {
        // A dropped spike is a priority: the nearest attacker goes and fetches it.
        if (team === 'attacker' && ctx.spikeDropped && !ctx.spikeCarried) {
          const carrier = ctx.nearestAttackerToSpike();
          if (carrier === api) {
            bot.mode = 'fetch';
            setPathTo(nearestWaypoint(ctx.spikePos.x, ctx.spikePos.z));
            break;
          }
        }
        if (bot.hasSpike && bot.assignedSite != null) {
          const site = MAP.sites[bot.assignedSite];
          if (Math.hypot(site.x - body.position.x, site.z - body.position.z) < site.radius) {
            bot.mode = 'plant';
            bot.plantProgress = 0;
            break;
          }
        }
        if (followPath(dt)) {
          if (bot.hasSpike) bot.mode = 'plant';
          else {
            bot.mode = 'hold';
            bot.holdNode = bot.path[bot.path.length - 1] ?? nearestWaypoint(body.position.x, body.position.z);
          }
        }
        break;
      }
      case 'hold': {
        // Sweep the view across the likely approach lane.
        body.yaw += Math.sin(time * 0.5 + bot.id) * dt * 0.5;
        if (ctx.spikeDropped && team === 'attacker' && !ctx.spikeCarried) {
          const carrier = ctx.nearestAttackerToSpike();
          if (carrier === api) {
            bot.mode = 'fetch';
            setPathTo(nearestWaypoint(ctx.spikePos.x, ctx.spikePos.z));
          }
        }
        break;
      }
      case 'fetch': {
        if (followPath(dt) || Math.hypot(ctx.spikePos.x - body.position.x, ctx.spikePos.z - body.position.z) < 1.4) {
          if (Math.hypot(ctx.spikePos.x - body.position.x, ctx.spikePos.z - body.position.z) < 1.4) {
            ctx.onSpikePickup(api);
            bot.mode = 'push';
            setPathTo(bot.assignedSite === 0 ? 9 : 10);
          } else {
            bot.mode = 'hold';
          }
        }
        break;
      }
      case 'plant': {
        bot.plantProgress += dt;
        ctx.onPlantTick(api, dt);
        break;
      }
      case 'defuse': {
        const spike = ctx.spikePos;
        if (Math.hypot(spike.x - body.position.x, spike.z - body.position.z) > 1.7) {
          setPathTo(nearestWaypoint(spike.x, spike.z));
          bot.mode = 'defuseWalk';
        } else {
          bot.defuseProgress += dt;
          ctx.onDefuseTick(api, dt);
        }
        break;
      }
      case 'defuseWalk': {
        faceToward(ctx.spikePos.x, ctx.spikePos.z, dt);
        if (followPath(dt)) bot.mode = 'defuse';
        break;
      }
      case 'defend': {
        if (followPath(dt)) bot.mode = 'hold';
        break;
      }
      case 'hunt': {
        if (followPath(dt)) {
          bot.huntTimer -= dt;
          body.yaw += dt * 1.5;
          if (bot.huntTimer <= 0) {
            bot.mode = team === 'attacker' ? 'push' : 'hold';
            if (bot.mode === 'push') setPathTo(bot.assignedSite === 0 ? 9 : 10);
          }
        }
        break;
      }
      case 'engage': {
        const target = bot.target;
        if (!target || !target.alive) {
          bot.target = null;
          bot.mode = team === 'attacker' ? 'push' : 'hold';
          break;
        }
        faceToward(target.state.position.x, target.state.position.z, dt);
        // Strafe while firing: sidestep, flip direction on a timer or at cover.
        bot.strafeTimer -= dt;
        if (bot.strafeTimer <= 0) {
          bot.strafeDir = random() < 0.5 ? -1 : 1;
          bot.strafeTimer = 0.7 + random() * 0.7;
        }
        const toTargetX = target.state.position.x - body.position.x;
        const toTargetZ = target.state.position.z - body.position.z;
        const dist = Math.hypot(toTargetX, toTargetZ) || 1;
        const sideX = (-toTargetZ / dist) * bot.strafeDir;
        const sideZ = (toTargetX / dist) * bot.strafeDir;
        const closing = dist > 14 ? 0.6 : 0;
        mover.step(dt, sideX * 0.7 + (toTargetX / dist) * closing, sideZ * 0.7 + (toTargetZ / dist) * closing, BOT_SPEED * 0.55, false, false);

        if (bot.reactionLeft > 0) {
          bot.reactionLeft -= dt;
          break;
        }
        if (bot.reloadLeft > 0 || bot.ammo <= 0) {
          if (bot.ammo <= 0 && bot.reloadLeft <= 0) bot.reloadLeft = bot.weapon.reload;
          break;
        }
        if (bot.burstLeft > 0) {
          bot.shotGap -= dt;
          if (bot.shotGap <= 0) {
            bot.shotGap = bot.weapon.gap;
            bot.burstLeft -= 1;
            bot.ammo -= 1;
            ctx.fireBotShot(api, target);
            if (bot.burstLeft === 0) bot.pauseLeft = 0.45 + random() * 0.45;
          }
        } else {
          bot.pauseLeft -= dt;
          if (bot.pauseLeft <= 0) startBurst();
        }
        break;
      }
      default:
        break;
    }

    // Health bar: face the camera, shrink with health.
    bot.barFg.scale.x = Math.max(0.01, bot.health / 100);
    bot.barFg.position.x = -(0.68 - 0.68 * (bot.health / 100)) / 2;
  }

  function reset(x, z, yaw, weaponId, assignedSite) {
    bot.health = 100;
    bot.alive = true;
    bot.fall = 0;
    bot.mesh.rotation.set(0, 0, 0);
    bot.mesh.position.set(x, 0, z);
    bot.bar.visible = true;
    bot.weapon = WEAPONS[weaponId];
    bot.ammo = bot.weapon.mag;
    bot.reloadLeft = 0;
    bot.mode = 'wait';
    bot.path = [];
    bot.pathIndex = 0;
    bot.target = null;
    bot.lastSeen = null;
    bot.hasSpike = false;
    bot.plantProgress = 0;
    bot.defuseProgress = 0;
    bot.assignedSite = assignedSite;
    mover.teleport(x, z, yaw);
  }

  function damage(amount) {
    bot.health = Math.max(0, bot.health - amount);
    if (bot.health <= 0) {
      bot.alive = false;
      bot.defuseProgress = 0;
    }
    return bot.health;
  }

  function alert(x, z, hearerTeam) {
    if (!bot.alive || bot.team === hearerTeam) return;
    const dist = Math.hypot(x - body.position.x, z - body.position.z);
    if (dist > HEAR_RANGE) return;
    if (!bot.lastSeen || bot.mode !== 'engage') {
      bot.lastSeen = { x, y: 1.0, z, time: 0 };
      if (bot.mode === 'hold' || bot.mode === 'push') {
        bot.mode = 'hunt';
        bot.huntTimer = 1.5;
        setPathTo(nearestWaypoint(x, z));
      }
    }
  }

  function syncMesh(camera) {
    bot.mesh.position.set(body.position.x, body.position.y, body.position.z);
    if (bot.alive) bot.mesh.rotation.y = body.yaw + Math.PI;
    bot.bar.lookAt(camera.position);
  }

  const api = {
    bot,
    step,
    reset,
    damage,
    alert,
    syncMesh,
    eyePos,
    setPathTo,
    assign(siteIndex, targetNode) {
      bot.assignedSite = siteIndex;
      bot.mode = 'push';
      setPathTo(targetNode);
    },
    defendSite(node) {
      bot.mode = 'defend';
      setPathTo(node);
    },
    goDefuse() {
      bot.mode = 'defuse';
      bot.path = [];
      bot.pathIndex = 0;
    },
    headCenter(out) {
      out.set(body.position.x, body.position.y + HEAD_Y, body.position.z);
      return out;
    },
    bodyCenter(out) {
      out.set(body.position.x, body.position.y + BODY_Y, body.position.z);
      return out;
    },
  };
  return api;
}
