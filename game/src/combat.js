// Combat: one hitscan resolver shared by the player and the bots, tracer and impact
// pools (reused, never allocated per shot), and grenades with real projectile flight.
// A shot is a ray against two spheres per body (head and torso) and the wall boxes;
// the closest thing the ray meets wins. Headshots deal the weapon's head multiplier.
import * as THREE from 'three';
import { raySphere } from './utils.js';
import { PALETTE } from './palette.js';

const RANGE = 90;
const TRACER_COUNT = 28;
const IMPACT_COUNT = 16;
const EXPLOSION_RADIUS = 5.5;

// Ray against an AABB, returning the entry distance or -1. Slab test, no allocation.
function rayBox(ox, oy, oz, dx, dy, dz, mn, mx) {
  let tmin = 0;
  let tmax = RANGE;
  const d = [dx, dy, dz];
  const o = [ox, oy, oz];
  const lo = [mn.x, mn.y, mn.z];
  const hi = [mx.x, mx.y, mx.z];
  for (let i = 0; i < 3; i += 1) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return -1;
    } else {
      let t1 = (lo[i] - o[i]) / d[i];
      let t2 = (hi[i] - o[i]) / d[i];
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

export function createCombat(scene, colliders) {
  // Tracer pool: lines whose endpoints are rewritten per shot.
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 }),
    );
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIndex = 0;

  // Impact pool: small additive sparks on walls.
  const impacts = [];
  for (let i = 0; i < IMPACT_COUNT; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.3),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.visible = false;
    scene.add(mesh);
    impacts.push({ mesh, life: 0 });
  }
  let impactIndex = 0;

  // Explosion pool: expanding spheres.
  const explosions = [];
  for (let i = 0; i < 2; i += 1) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.danger), transparent: true, opacity: 0, depthWrite: false }),
    );
    mesh.visible = false;
    scene.add(mesh);
    explosions.push({ mesh, life: 0 });
  }

  const grenades = [];
  const grenadeGeometry = new THREE.SphereGeometry(0.11, 10, 8);
  const grenadeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#1c2b1f'), roughness: 0.6, metalness: 0.4 });

  const tmpHead = new THREE.Vector3();
  const tmpBody = new THREE.Vector3();
  const tmpPoint = new THREE.Vector3();

  function spawnTracer(from, to) {
    const tracer = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_COUNT;
    const positions = tracer.line.geometry.attributes.position.array;
    positions[0] = from.x;
    positions[1] = from.y;
    positions[2] = from.z;
    positions[3] = to.x;
    positions[4] = to.y;
    positions[5] = to.z;
    tracer.line.geometry.attributes.position.needsUpdate = true;
    tracer.life = 0.09;
    tracer.line.material.opacity = 0.85;
  }

  function spawnImpact(point, camera) {
    const impact = impacts[impactIndex];
    impactIndex = (impactIndex + 1) % IMPACT_COUNT;
    impact.mesh.position.copy(point);
    impact.mesh.visible = true;
    if (camera) impact.mesh.quaternion.copy(camera.quaternion);
    impact.life = 0.18;
    impact.mesh.material.opacity = 0.9;
  }

  // Resolve one pellet. `targets` are actors with .state/.health/.alive/.team and
  // headCenter/bodyCenter(out) helpers; the player is wrapped the same way by main.
  // Returns { hit, part, target, point, distance } or a wall-only miss.
  function resolveShot(origin, dir, shooter, targets, camera) {
    let bestDist = RANGE;
    let bestTarget = null;
    let bestPart = null;
    for (const target of targets) {
      if (target === shooter || !target.alive) continue;
      target.headCenter(tmpHead);
      const headDist = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, tmpHead.x, tmpHead.y, tmpHead.z, 0.19);
      if (headDist > 0 && headDist < bestDist) {
        bestDist = headDist;
        bestTarget = target;
        bestPart = 'head';
      }
      target.bodyCenter(tmpBody);
      const bodyDist = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, tmpBody.x, tmpBody.y, tmpBody.z, 0.46);
      if (bodyDist > 0 && bodyDist < bestDist) {
        bestDist = bodyDist;
        bestTarget = target;
        bestPart = 'body';
      }
    }
    let wallDist = RANGE;
    for (const box of colliders) {
      const t = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, box.min, box.max);
      if (t >= 0 && t < wallDist) wallDist = t;
    }
    tmpPoint.copy(origin).addScaledVector(dir, Math.min(bestDist, wallDist));
    if (bestTarget && bestDist <= wallDist) {
      return { hit: true, part: bestPart, target: bestTarget, point: tmpPoint.clone(), distance: bestDist };
    }
    if (wallDist < RANGE) spawnImpact(tmpPoint, camera);
    return { hit: false, part: null, target: null, point: tmpPoint.clone(), distance: wallDist };
  }

  function throwGrenade(origin, dir, speed, owner) {
    if (grenades.length >= 4) return;
    const mesh = new THREE.Mesh(grenadeGeometry, grenadeMaterial);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    scene.add(mesh);
    grenades.push({
      mesh,
      vx: dir.x * speed,
      vy: dir.y * speed + 2.2,
      vz: dir.z * speed,
      fuse: 1.25,
      bounced: 0,
      owner: owner ?? null,
    });
  }

  function explodeGrenade(grenade, actors, onDamage, onBoom) {
    const pos = grenade.mesh.position;
    const boom = explosions.find((item) => item.life <= 0) ?? explosions[0];
    boom.mesh.position.copy(pos);
    boom.mesh.visible = true;
    boom.mesh.scale.setScalar(0.5);
    boom.life = 0.45;
    boom.mesh.material.opacity = 0.85;
    for (const actor of actors) {
      if (!actor.alive) continue;
      const p = actor.state.position;
      const dist = Math.hypot(p.x - pos.x, (p.y + 1.0) - pos.y, p.z - pos.z);
      if (dist > EXPLOSION_RADIUS) continue;
      const damage = Math.round(90 - (dist / EXPLOSION_RADIUS) * 70);
      onDamage(actor, damage, false, grenade.owner);
    }
    onBoom(pos);
    scene.remove(grenade.mesh);
  }

  function stepGrenades(dt, actors, onDamage, onBoom) {
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const grenade = grenades[i];
      grenade.fuse -= dt;
      grenade.vy -= 20 * dt;
      const pos = grenade.mesh.position;
      pos.x += grenade.vx * dt;
      pos.y += grenade.vy * dt;
      pos.z += grenade.vz * dt;
      // Simple bounce against wall boxes: flip the velocity component that
      // penetrated, with damping. The floor stops the grenade.
      if (pos.y < 0.11) {
        pos.y = 0.11;
        grenade.vy = Math.abs(grenade.vy) * 0.35;
        grenade.vx *= 0.7;
        grenade.vz *= 0.7;
        grenade.bounced += 1;
      }
      for (const box of colliders) {
        if (
          pos.x > box.min.x - 0.11 && pos.x < box.max.x + 0.11
          && pos.y > box.min.y - 0.11 && pos.y < box.max.y + 0.11
          && pos.z > box.min.z - 0.11 && pos.z < box.max.z + 0.11
        ) {
          grenade.vx *= -0.4;
          grenade.vz *= -0.4;
          grenade.vy = Math.abs(grenade.vy) * 0.4 + 0.5;
          pos.y = box.max.y + 0.12;
          grenade.bounced += 1;
          break;
        }
      }
      if (grenade.fuse <= 0 || grenade.bounced >= 4) {
        grenades.splice(i, 1);
        explodeGrenade(grenade, actors, onDamage, onBoom);
      }
    }
    for (const boom of explosions) {
      if (boom.life <= 0) continue;
      boom.life -= dt;
      boom.mesh.scale.setScalar(0.5 + (0.45 - boom.life) * 16);
      boom.mesh.material.opacity = Math.max(0, boom.life / 0.45) * 0.85;
      if (boom.life <= 0) boom.mesh.visible = false;
    }
  }

  function stepFx(dt) {
    for (const tracer of tracers) {
      if (tracer.life <= 0) continue;
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life / 0.09) * 0.85;
    }
    for (const impact of impacts) {
      if (impact.life <= 0) continue;
      impact.life -= dt;
      impact.mesh.material.opacity = Math.max(0, impact.life / 0.18) * 0.9;
      impact.mesh.scale.setScalar(1 + (0.18 - impact.life) * 6);
      if (impact.life <= 0) impact.mesh.visible = false;
    }
  }

  return {
    resolveShot,
    spawnTracer,
    throwGrenade,
    stepGrenades,
    stepFx,
    grenadeCount() {
      return grenades.length;
    },
    clear() {
      for (const grenade of grenades) scene.remove(grenade.mesh);
      grenades.length = 0;
      for (const tracer of tracers) tracer.life = 0;
      for (const impact of impacts) impact.life = 0;
      for (const boom of explosions) {
        boom.life = 0;
        boom.mesh.visible = false;
      }
    },
  };
}
