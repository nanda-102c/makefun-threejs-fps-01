// The map, built from MAP: ground, walls, containers, crates, silos, the depot, site
// markers and dusk lighting. Every box is a collider for movers and a surface bullets
// stop on. Site markers (a floating letter and a ground ring) are the map's own art.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './mapdata.js';

function makeLetterTexture(letter, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 128);
  ctx.fillStyle = color;
  ctx.font = '900 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

// Dusk sky: a vertical gradient the scene background stretches across the frame,
// deep blue up top, amber at the horizon where the sun sits.
function makeSkyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 512);
  gradient.addColorStop(0, '#0c1522');
  gradient.addColorStop(0.5, '#24334a');
  gradient.addColorStop(0.74, '#6e4a2e');
  gradient.addColorStop(0.88, '#c47b33');
  gradient.addColorStop(1, '#8a5426');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 4, 512);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  gradient.addColorStop(0, 'rgba(255, 205, 130, 0.9)');
  gradient.addColorStop(0.35, 'rgba(255, 170, 90, 0.35)');
  gradient.addColorStop(1, 'rgba(255, 150, 60, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);
  scene.background = makeSkyTexture();
  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' || name === 'silo' ? 0.5 : 0.92,
      metalness: name === 'silo' || name === 'container' ? 0.35 : 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(spec) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(spec.w, spec.h, spec.d), materials[spec.mat]);
    mesh.position.set(spec.x, spec.y, spec.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    const bounds = new THREE.Box3(
      new THREE.Vector3(spec.x - spec.w / 2, spec.y - spec.h / 2, spec.z - spec.d / 2),
      new THREE.Vector3(spec.x + spec.w / 2, spec.y + spec.h / 2, spec.z + spec.d / 2),
    );
    colliders.push(bounds);
    shootables.push(mesh);
    return mesh;
  }

  // Ground slab (walkable, but not a wall collider: the mover treats y=0 as floor).
  const ground = new THREE.Mesh(
    new THREE.BoxGeometry(57.2, 0.4, 41.2),
    materials.ground,
  );
  ground.position.set(0, -0.2, 0);
  ground.receiveShadow = true;
  group.add(ground);
  shootables.push(ground);

  for (const spec of MAP.boxes) box(spec);

  // Silo cylinders and barrels (visual; their colliders are boxes in MAP.boxes).
  for (const spec of MAP.cylinders) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(spec.r, spec.r, spec.h, 20), materials[spec.mat]);
    mesh.position.set(spec.x, (spec.y ?? spec.h / 2), spec.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (spec.r > 1) shootables.push(mesh);
  }

  // Site markers: a glowing ring on the ground and a floating letter.
  const siteMarkers = [];
  for (const site of MAP.sites) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.25, site.radius, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(site.color), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 2.4),
      new THREE.MeshBasicMaterial({
        map: makeLetterTexture(site.id, site.color),
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    letter.position.set(site.x, 4.4, site.z);
    group.add(letter);
    const glow = new THREE.PointLight(new THREE.Color(site.color), 12, 14, 1.6);
    glow.position.set(site.x, 2.6, site.z);
    group.add(glow);
    siteMarkers.push({ ring, letter, glow, site });
  }

  // Lamp glows on the light poles.
  for (const [x, z] of [[-24, 14], [24, 14], [-24, -18], [24, -18]]) {
    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.18, 0.7),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
    );
    lamp.position.set(x, 5.05, z);
    group.add(lamp);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 9, 16, 1.8);
    light.position.set(x, 4.8, z);
    group.add(light);
  }

  // Dusk: warm low key sun, cool sky fill, thin fog so the far wall reads.
  const sky = new THREE.HemisphereLight(new THREE.Color('#5a6b7d'), new THREE.Color('#1a1d20'), 1.25);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffd2a0'), 2.0);
  sun.position.set(26, 18, 22);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -34;
  sun.shadow.camera.right = 34;
  sun.shadow.camera.top = 28;
  sun.shadow.camera.bottom = -28;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7d92a8'), 0.5);
  fill.position.set(-18, 12, -14);
  scene.add(fill);

  // The world beyond the fence: a ring of dark warehouse silhouettes, a low sun
  // disc and its glow, all outside the fog's reach. They sell the dusk; none of
  // them is a collider.
  const skylineMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color('#1a2129') });
  const skyline = [
    [-52, -30, 16, 10, 12], [52, -34, 14, 12, 10], [-48, 34, 12, 8, 16],
    [48, 30, 18, 14, 12], [0, -52, 20, 9, 10], [-20, 52, 14, 7, 12],
    [24, 54, 12, 11, 10], [-62, 0, 12, 6, 14], [62, -2, 14, 9, 12],
    [0, 58, 16, 6, 10], [-34, -48, 12, 13, 10], [36, -50, 12, 8, 14],
  ];
  for (const [x, z, w, h, d] of skyline) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), skylineMaterial);
    block.position.set(x, h / 2 - 0.4, z);
    group.add(block);
  }
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(5, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd9a0'), fog: false }),
  );
  sunDisc.position.set(52, 13, 44);
  sunDisc.lookAt(0, 2, 0);
  group.add(sunDisc);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(), transparent: true, depthWrite: false, fog: false,
  }));
  glow.position.set(52, 13, 44);
  glow.scale.setScalar(46);
  group.add(glow);

  return {
    colliders,
    shootables,
    group,
    siteMarkers,
    step(dt, time) {
      for (const marker of siteMarkers) {
        marker.letter.rotation.y = time * 0.4;
        marker.letter.position.y = 4.4 + Math.sin(time * 0.9) * 0.12;
        marker.ring.material.opacity = 0.45 + Math.sin(time * 2.2) * 0.12;
      }
    },
  };
}
