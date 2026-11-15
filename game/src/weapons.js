// The arsenal: four guns and one grenade, each with its own numbers and view model.
// The weapon owns its magazine, reload and spread; main.js owns the ray and damage.
// Spread punishes moving, firing fast and standing tall; crouching and stopping pay.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', short: 'P9', price: 0, kind: 'pistol',
    damage: 26, headMult: 4, mag: 12, reserve: 48, gap: 0.15, auto: false,
    reload: 1.4, spreadStill: 0.004, spreadMove: 0.02, recoil: 0.011, pellets: 1,
  },
  rifle: {
    id: 'rifle', name: 'VK-47 Carbine', short: 'VK-47', price: 2700, kind: 'rifle',
    damage: 34, headMult: 4, mag: 30, reserve: 90, gap: 0.1, auto: true,
    reload: 2.1, spreadStill: 0.0025, spreadMove: 0.03, recoil: 0.013, pellets: 1,
  },
  smg: {
    id: 'smg', name: 'PDW-9', short: 'PDW-9', price: 1250, kind: 'smg',
    damage: 24, headMult: 4, mag: 32, reserve: 96, gap: 0.075, auto: true,
    reload: 1.8, spreadStill: 0.005, spreadMove: 0.022, recoil: 0.008, pellets: 1,
  },
  shotgun: {
    id: 'shotgun', name: 'Scatter-12', short: 'S-12', price: 900, kind: 'shotgun',
    damage: 9, headMult: 3, mag: 6, reserve: 24, gap: 0.85, auto: false,
    reload: 2.6, spreadStill: 0.028, spreadMove: 0.045, recoil: 0.03, pellets: 8,
  },
};

export const GRENADE = { id: 'grenade', name: 'HE-7 Grenade', short: 'HE-7', price: 300 };

const MUZZLE_TIME = 0.06;
const BLOOM_PER_SHOT = 0.004;
const BLOOM_MAX = 0.02;
const BLOOM_RECOVER = 0.03;

function buildViewModel(def) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const accent = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 });
  const model = new THREE.Group();
  const add = (w, h, d, x, y, z, mat = body) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    model.add(mesh);
    return mesh;
  };
  if (def.kind === 'pistol') {
    add(0.06, 0.09, 0.2, 0, 0, -0.08);
    add(0.035, 0.035, 0.16, 0, 0.012, -0.24, grip);
    add(0.05, 0.12, 0.06, 0, -0.09, 0.02, grip);
    add(0.018, 0.025, 0.02, 0, 0.055, -0.16, accent);
  } else if (def.kind === 'smg') {
    add(0.07, 0.09, 0.34, 0, 0, -0.12);
    add(0.04, 0.04, 0.22, 0, 0.02, -0.32, grip);
    add(0.05, 0.14, 0.05, 0, -0.1, -0.02, grip);
    add(0.06, 0.03, 0.1, 0, 0.06, -0.05, accent);
  } else if (def.kind === 'shotgun') {
    add(0.09, 0.1, 0.46, 0, 0, -0.14);
    add(0.06, 0.06, 0.4, 0, -0.05, -0.2, grip);
    add(0.07, 0.08, 0.2, 0, -0.02, 0.28, grip);
    add(0.05, 0.04, 0.06, 0, 0.07, -0.3, accent);
  } else {
    add(0.09, 0.1, 0.44, 0, 0, -0.14);
    add(0.045, 0.045, 0.42, 0, 0.025, -0.4, grip);
    add(0.07, 0.08, 0.2, 0, -0.02, 0.3, grip);
    add(0.05, 0.12, 0.05, 0, -0.1, -0.04, grip);
    add(0.04, 0.03, 0.03, 0, 0.065, -0.28, accent);
  }
  model.position.set(0.23, -0.22, -0.5);
  model.scale.setScalar(0.9);
  return model;
}

export function createWeaponRig(camera) {
  const models = {};
  for (const def of Object.values(WEAPONS)) {
    const model = buildViewModel(def);
    model.visible = false;
    camera.add(model);
    models[def.id] = model;
  }

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.18),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.23, -0.2, -1.0);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.23, -0.2, -0.7);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    mag: WEAPONS.pistol.mag,
    reserve: WEAPONS.pistol.reserve,
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    bloom: 0,
    switchLeft: 0,
    grenades: 0,
  };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.switchLeft = Math.max(0, state.switchLeft - dt);
    state.bloom = Math.max(0, state.bloom - BLOOM_RECOVER * dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.5 + state.kick;
    model.rotation.x = state.kick * 2.2;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
    flash.visible = state.flash > 0;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
  }

  return {
    state,
    def,
    step,
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0 && state.switchLeft === 0;
    },
    busy() {
      return state.reloadLeft > 0 || state.switchLeft > 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = MUZZLE_TIME;
      state.kick = def().kind === 'shotgun' ? 0.11 : 0.055;
      state.bloom = Math.min(BLOOM_MAX, state.bloom + BLOOM_PER_SHOT);
      flash.rotation.z = (Math.random() * 2 - 1) * 0.7;
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return false;
      state.reloadLeft = def().reload;
      return true;
    },
    spread(speed, crouching, walking) {
      const d = def();
      const move = Math.min(1, speed / 5.2);
      let value = d.spreadStill + move * d.spreadMove + state.bloom;
      if (crouching) value *= 0.6;
      if (walking) value *= 0.55;
      return value;
    },
    recoil() {
      return def().recoil;
    },
    equip(id, keepAmmo = null) {
      if (!WEAPONS[id] || state.current === id) return false;
      models[state.current].visible = false;
      state.current = id;
      models[id].visible = true;
      if (keepAmmo) {
        state.mag = keepAmmo.mag;
        state.reserve = keepAmmo.reserve;
      } else {
        state.mag = WEAPONS[id].mag;
        state.reserve = WEAPONS[id].reserve;
      }
      state.reloadLeft = 0;
      state.cooldown = 0;
      state.switchLeft = 0.35;
      return true;
    },
  };
}
