// Small shared math: a seeded RNG, clamp/lerp, and the two geometric tests the whole
// game leans on — ray vs sphere (bodies) and segment vs AABB (line of sight, bullets
// against walls). No allocations in the hot paths: the callers pass scratch objects.
export function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Ray (origin + t*dir, dir unit) against a sphere. Returns the distance or -1.
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, radius) {
  const lx = cx - ox;
  const ly = cy - oy;
  const lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return -1;
  return tca - Math.sqrt(r2 - d2);
}

// Segment p0->p1 against an AABB (min/max as {x,y,z}). Returns true when blocked.
export function segmentHitsBox(x0, y0, z0, x1, y1, z1, mn, mx) {
  let tmin = 0;
  let tmax = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const axes = [
    [dx, x0, mn.x, mx.x],
    [dy, y0, mn.y, mx.y],
    [dz, z0, mn.z, mx.z],
  ];
  for (let i = 0; i < 3; i += 1) {
    const [d, o, lo, hi] = axes[i];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let t1 = (lo - o) / d;
      let t2 = (hi - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return false;
    }
  }
  return true;
}

// Distance from a point to a segment, used for grenade blast falloff and bot spacing.
export function pointSegmentDistance(px, py, pz, ax, ay, az, bx, by, bz) {
  const abx = bx - ax;
  const aby = by - ay;
  const abz = bz - az;
  const len2 = abx * abx + aby * aby + abz * abz;
  let t = len2 === 0 ? 0 : ((px - ax) * abx + (py - ay) * aby + (pz - az) * abz) / len2;
  t = clamp(t, 0, 1);
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const cz = az + abz * t;
  return Math.hypot(px - cx, py - cy, pz - cz);
}
