// Keyboard and mouse, and the pointer lock that turns the mouse into look. Plain
// browser APIs only. If pointer lock is refused (or the game runs headless), dragging
// with the mouse held down still turns the view, so the game stays playable.
export function createInput(canvas, onLockChange, onAction) {
  const keys = new Set();
  const state = { keys, locked: false, firing: false, lookX: 0, lookY: 0, dragging: false };
  let lastX = 0;
  let lastY = 0;

  function setKey(event, down) {
    if (down) keys.add(event.code);
    else keys.delete(event.code);
    if (event.code === 'Space') event.preventDefault();
    if (down) onAction(event.code);
  }

  window.addEventListener('keydown', (event) => setKey(event, true));
  window.addEventListener('keyup', (event) => setKey(event, false));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousemove', (event) => {
    if (state.locked) {
      state.lookX += event.movementX;
      state.lookY += event.movementY;
    } else if (state.dragging) {
      state.lookX += (event.clientX - lastX) * 2.2;
      state.lookY += (event.clientY - lastY) * 2.2;
      lastX = event.clientX;
      lastY = event.clientY;
    }
  });
  window.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    lastX = event.clientX;
    lastY = event.clientY;
    if (state.locked) state.firing = true;
    else state.dragging = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) {
      state.firing = false;
      state.dragging = false;
    }
  });
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (!state.locked) {
      keys.clear();
      state.firing = false;
    }
    onLockChange(state.locked);
  });

  return {
    state,
    requestLock() {
      try {
        const result = canvas.requestPointerLock();
        if (result && result.catch) result.catch(() => {});
      } catch {
        // Pointer lock unavailable: drag-look still works.
      }
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    takeLook() {
      const x = state.lookX;
      const y = state.lookY;
      state.lookX = 0;
      state.lookY = 0;
      return { x, y };
    },
  };
}
