// FOUNDRY YARD — the map of STRIKE LANE. An original industrial yard, 56 x 40 m:
// attackers spawn south, defenders north, two spike sites (A Silo Yard west, B Depot
// east), three lanes through a mid wall, and a waypoint graph the bots navigate on.
// Boxes are axis-aligned; every entry is both a mesh and a collider.
export const MAP = {
  bounds: { minX: -28, maxX: 28, minZ: -20, maxZ: 20 },
  // { w, h, d, x, y, z, mat } — y is the box centre height.
  boxes: [
    // Perimeter, 5 m high.
    { w: 57.2, h: 5, d: 0.6, x: 0, y: 2.5, z: -20.3, mat: 'surface' },
    { w: 57.2, h: 5, d: 0.6, x: 0, y: 2.5, z: 20.3, mat: 'surface' },
    { w: 0.6, h: 5, d: 41.2, x: -28.3, y: 2.5, z: 0, mat: 'surface' },
    { w: 0.6, h: 5, d: 41.2, x: 28.3, y: 2.5, z: 0, mat: 'surface' },
    // Mid wall (z = 0) with three gaps: A lane, mid, B lane.
    { w: 6, h: 3.4, d: 0.6, x: -25, y: 1.7, z: 0, mat: 'hairline' },
    { w: 16, h: 3.4, d: 0.6, x: -10, y: 1.7, z: 0, mat: 'hairline' },
    { w: 16, h: 3.4, d: 0.6, x: 10, y: 1.7, z: 0, mat: 'hairline' },
    { w: 6, h: 3.4, d: 0.6, x: 25, y: 1.7, z: 0, mat: 'hairline' },
    // Site fences (z = -13): a tall wall north of each site, so the defender spawn
    // pocket cannot see straight onto the spike sites. Defenders rotate to a site
    // around the fence's inner end, through the connector — which is what gives a
    // plant its window. (Waypoint edges 13-9 and 15-10 are cut for the same reason:
    // no route crosses a fence.)
    { w: 16, h: 3.4, d: 0.6, x: -20, y: 1.7, z: -13, mat: 'hairline' },
    { w: 16, h: 3.4, d: 0.6, x: 20, y: 1.7, z: -13, mat: 'hairline' },
    // Shipping containers (2.6 m high, climbable cover).
    { w: 6, h: 2.6, d: 2.4, x: -6, y: 1.3, z: 10, mat: 'container' },
    { w: 2.4, h: 2.6, d: 6, x: 8, y: 1.3, z: 4, mat: 'containerB' },
    { w: 6, h: 2.6, d: 2.4, x: -8, y: 1.3, z: -6, mat: 'container' },
    { w: 2.4, h: 2.6, d: 6, x: 14, y: 1.3, z: -6, mat: 'containerB' },
    { w: 6, h: 2.6, d: 2.4, x: 0, y: 1.3, z: -12, mat: 'container' },
    { w: 2.4, h: 2.6, d: 6, x: -24, y: 1.3, z: 4, mat: 'containerB' },
    { w: 2.4, h: 2.6, d: 6, x: 24, y: 1.3, z: 4, mat: 'container' },
    // Crates (1.2 m cubes; a few stacked two high).
    { w: 1.2, h: 1.2, d: 1.2, x: -14, y: 0.6, z: 12, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: -12.6, y: 0.6, z: 12, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: -13.3, y: 1.8, z: 12, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: 12, y: 0.6, z: 14, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: -2, y: 0.6, z: 2, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: 2.4, y: 0.6, z: -4, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: -18, y: 0.6, z: -6, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: 18, y: 0.6, z: -14, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: -26, y: 0.6, z: -8, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: 26, y: 0.6, z: -16, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: -6, y: 0.6, z: 15, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: -4, y: 0.6, z: -14, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: 4, y: 0.6, z: -14, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: -16, y: 0.6, z: -12, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: -16, y: 1.8, z: -12, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: 16, y: 0.6, z: -12, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: -24, y: 0.6, z: -6, mat: 'rust' },
    { w: 1.2, h: 1.2, d: 1.2, x: 24, y: 0.6, z: -6, mat: 'rust' },
    // Depot building at site B: two walls forming a corner shelter.
    { w: 10, h: 3, d: 0.5, x: 21, y: 1.5, z: -16.5, mat: 'hairline' },
    { w: 0.5, h: 3, d: 8, x: 25.8, y: 1.5, z: -12.5, mat: 'hairline' },
    // Light poles.
    { w: 0.25, h: 5, d: 0.25, x: -24, y: 2.5, z: 14, mat: 'hairline' },
    { w: 0.25, h: 5, d: 0.25, x: 24, y: 2.5, z: 14, mat: 'hairline' },
    { w: 0.25, h: 5, d: 0.25, x: -24, y: 2.5, z: -18, mat: 'hairline' },
    { w: 0.25, h: 5, d: 0.25, x: 24, y: 2.5, z: -18, mat: 'hairline' },
    // Silo footings (the cylinders themselves are listed below; these are their
    // square colliders, matching the cylinder radius).
    { w: 4.4, h: 6, d: 4.4, x: -25, y: 3, z: -15, mat: 'silo' },
    { w: 4.4, h: 6, d: 4.4, x: -18.5, y: 3, z: -16.5, mat: 'silo' },
  ],
  // Decorative cylinders (visual only; colliders come from the boxes above).
  cylinders: [
    { r: 2.2, h: 6, x: -25, z: -15, mat: 'silo' },
    { r: 2.2, h: 6, x: -18.5, z: -16.5, mat: 'silo' },
    { r: 0.55, h: 1.1, x: -10, y: 0.55, z: 14, mat: 'rust' },
    { r: 0.55, h: 1.1, x: -9, y: 0.55, z: 14.6, mat: 'container' },
    { r: 0.55, h: 1.1, x: 10.5, y: 0.55, z: -10, mat: 'rust' },
  ],
  // Spike sites.
  sites: [
    { id: 'A', name: 'SILO YARD', x: -21, z: -11, radius: 4.6, color: '#ffb02e' },
    { id: 'B', name: 'DEPOT', x: 21, z: -11, radius: 4.6, color: '#37c8a3' },
  ],
  spawns: {
    attacker: [
      { x: 0, z: 17.5 },
      { x: -4, z: 17.5 },
      { x: 4, z: 17.5 },
    ],
    defender: [
      { x: -10, z: -17.5 },
      { x: -2, z: -17.5 },
      { x: 6, z: -17.5 },
      { x: 14, z: -17.5 },
    ],
  },
  // Waypoint graph: nodes the bots walk between. Edges are listed per node index.
  waypoints: [
    { x: 0, z: 17.5 },   // 0 attacker mid spawn
    { x: -14, z: 17.5 }, // 1 attacker west spawn
    { x: 14, z: 17.5 },  // 2 attacker east spawn
    { x: -20, z: 8 },    // 3 A lane low
    { x: 0, z: 8 },      // 4 mid low
    { x: 20, z: 8 },     // 5 B lane low
    { x: -20, z: -2 },   // 6 A lane mid (through gap)
    { x: 0, z: -2 },     // 7 mid (through gap)
    { x: 20, z: -2 },    // 8 B lane mid
    { x: -21, z: -11 },  // 9 site A
    { x: 21, z: -11 },   // 10 site B
    { x: -8, z: -8 },    // 11 connector west
    { x: 8, z: -8 },     // 12 connector east
    { x: -12, z: -16 },  // 13 defender west spawn
    { x: 0, z: -16 },    // 14 defender mid spawn
    { x: 12, z: -16 },   // 15 defender east spawn
    { x: -26, z: 2 },    // 16 A far west
    { x: 26, z: 2 },     // 17 B far east
    { x: -8, z: 12 },    // 18 attacker mid-west
    { x: 8, z: 12 },     // 19 attacker mid-east
  ],
  edges: [
    [1, 2, 4],          // 0
    [0, 3, 18],         // 1
    [0, 5, 19],         // 2
    [1, 6, 16, 4],      // 3
    [0, 7, 18, 19, 3, 5], // 4
    [2, 8, 17, 4],      // 5
    [3, 9, 11, 7, 16],  // 6
    [4, 11, 12, 6, 8],  // 7
    [5, 10, 12, 7, 17], // 8
    [6, 11],        // 9 (no 13: the site fence stands between them)
    [8, 12],        // 10 (no 15: the site fence stands between them)
    [7, 9, 13, 6],  // 11
    [7, 10, 15, 8], // 12
    [11, 14],       // 13
    [13, 15],       // 14
    [12, 14],       // 15
    [3, 6],             // 16
    [5, 8],             // 17
    [1, 4, 3],          // 18
    [2, 4, 5],          // 19
  ],
};

// Dijkstra over the waypoint graph. Returns an array of node indices from `from`
// to `to` (inclusive), or [] when unreachable.
export function findPath(from, to) {
  const count = MAP.waypoints.length;
  const dist = new Array(count).fill(Infinity);
  const prev = new Array(count).fill(-1);
  const done = new Array(count).fill(false);
  dist[from] = 0;
  for (let step = 0; step < count; step += 1) {
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < count; i += 1) {
      if (!done[i] && dist[i] < bestDist) {
        bestDist = dist[i];
        best = i;
      }
    }
    if (best === -1) break;
    if (best === to) break;
    done[best] = true;
    const a = MAP.waypoints[best];
    for (const next of MAP.edges[best]) {
      if (done[next]) continue;
      const b = MAP.waypoints[next];
      const cost = Math.hypot(a.x - b.x, a.z - b.z);
      if (dist[best] + cost < dist[next]) {
        dist[next] = dist[best] + cost;
        prev[next] = best;
      }
    }
  }
  if (dist[to] === Infinity) return [];
  const path = [];
  let node = to;
  while (node !== -1) {
    path.unshift(node);
    node = prev[node];
  }
  return path;
}

// Nearest waypoint to a world position.
export function nearestWaypoint(x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < MAP.waypoints.length; i += 1) {
    const w = MAP.waypoints[i];
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}
