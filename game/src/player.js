// The player: a mover plus health. It turns the key set into a wish direction in
// world space (WASD relative to the view yaw) and reports walk/crouch for spread.
import { createMover } from './mover.js';

const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const WALK_SLOW = 2.6;

export function createPlayer(colliders, x, z, yaw) {
  const mover = createMover(colliders, x, z, yaw);
  const body = mover.state;
  let health = 100;

  function step(dt, keys) {
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    const walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let wishX = 0;
    let wishZ = 0;
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      const length = Math.hypot(forward, strafe);
      wishX = (-sin * forward + cos * strafe) / length;
      wishZ = (-cos * forward - sin * strafe) / length;
    }
    const speed = body.crouching ? CROUCH_SPEED : walking ? WALK_SLOW : WALK_SPEED;
    mover.step(dt, wishX, wishZ, speed, crouching, keys.has('Space'));
    return { walking, crouching: body.crouching };
  }

  return {
    mover,
    state: body,
    look: mover.look,
    recoil(pitchKick, yawKick) {
      body.pitch = Math.min(1.45, body.pitch + pitchKick);
      body.yaw += yawKick;
    },
    groundSpeed: mover.groundSpeed,
    step,
    get health() {
      return health;
    },
    set health(value) {
      health = Math.max(0, Math.min(100, value));
    },
    get alive() {
      return health > 0;
    },
    damage(amount) {
      health = Math.max(0, health - amount);
      return health;
    },
    reset(x, z, yaw) {
      health = 100;
      mover.teleport(x, z, yaw);
    },
  };
}
