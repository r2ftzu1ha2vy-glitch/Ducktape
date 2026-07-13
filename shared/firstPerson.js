// ---------------------------------------------------------------------------
// Shared first-person rig for all three ducks.
// - Camera sits at the duck's eye height, at duckPos.
// - Drag (mouse or touch) rotates look direction (yaw + pitch).
// - WASD/arrows move relative to look yaw.
// - Each client renders its own independent Three.js scene — player positions
//   are NOT synced live over the network (only discrete events are: symbols,
//   chat, the door attempt, and the mute-jump signal). The other two ducks
//   you see are static decorative avatars standing in a window opening, not
//   a live feed of that teammate's actual movement.
// - hideFromOwnCamera still matters within a single client: it adds your own
//   duck's body model to the scene (so its silhouette/edges are available for
//   other code, e.g. blind.html's outline pass) but excludes it from your own
//   camera's render, so you don't see your own body blocking the first-person
//   view.
// - The duck model's yaw is set to match movement heading, so it visibly
//   turns to face the direction it's walking.
// ---------------------------------------------------------------------------

export function createFirstPersonRig(camera, domElement, { bounds = 4.5 } = {}) {
  const state = {
    pos: new THREE.Vector3(0, 1.4, 2), // eye height ~1.4
    yaw: Math.PI,     // facing -Z by default
    pitch: 0,
    moveYaw: Math.PI, // heading of last actual movement, for duck body rotation
  };

  const keys = {};
  window.addEventListener("keydown", e => { keys[e.key.toLowerCase()] = true; });
  window.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

  // --- drag to look ---
  let dragging = false;
  let lastX = 0, lastY = 0;
  const SENS = 0.0035;

  function pointerDown(x, y) { dragging = true; lastX = x; lastY = y; }
  function pointerMove(x, y) {
    if (!dragging) return;
    const dx = x - lastX, dy = y - lastY;
    lastX = x; lastY = y;
    state.yaw -= dx * SENS;
    state.pitch -= dy * SENS;
    const limit = Math.PI / 2 - 0.05;
    state.pitch = Math.max(-limit, Math.min(limit, state.pitch));
  }
  function pointerUp() { dragging = false; }

  domElement.addEventListener("mousedown", e => pointerDown(e.clientX, e.clientY));
  window.addEventListener("mousemove", e => pointerMove(e.clientX, e.clientY));
  window.addEventListener("mouseup", pointerUp);

  domElement.addEventListener("touchstart", e => {
    const t = e.touches[0];
    pointerDown(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener("touchmove", e => {
    const t = e.touches[0];
    if (t) pointerMove(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener("touchend", pointerUp);

  function isMoving() {
    return keys["w"] || keys["arrowup"] || keys["s"] || keys["arrowdown"] ||
           keys["a"] || keys["arrowleft"] || keys["d"] || keys["arrowright"];
  }

  function update(speed = 0.06) {
    const forward = new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const right = new THREE.Vector3(Math.sin(state.yaw + Math.PI / 2), 0, -Math.cos(state.yaw + Math.PI / 2));

    const move = new THREE.Vector3();
    if (keys["w"] || keys["arrowup"]) move.add(forward);
    if (keys["s"] || keys["arrowdown"]) move.sub(forward);
    if (keys["a"] || keys["arrowleft"]) move.sub(right);
    if (keys["d"] || keys["arrowright"]) move.add(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed);
      state.pos.x += move.x;
      state.pos.z += move.z;
      state.pos.x = THREE.MathUtils.clamp(state.pos.x, -bounds, bounds);
      state.pos.z = THREE.MathUtils.clamp(state.pos.z, -bounds, bounds);
      state.moveYaw = Math.atan2(move.x, -move.z);
    }

    camera.position.set(state.pos.x, state.pos.y, state.pos.z);
    const lookDir = new THREE.Vector3(
      Math.sin(state.yaw) * Math.cos(state.pitch),
      Math.sin(state.pitch),
      -Math.cos(state.yaw) * Math.cos(state.pitch)
    );
    camera.lookAt(state.pos.x + lookDir.x, state.pos.y + lookDir.y, state.pos.z + lookDir.z);

    return state;
  }

  return { state, update, isMoving };
}

// Layer index used to mark "own body" objects that this client's camera
// should never render (so you don't see yourself in first person), while
// remaining visible to OTHER cameras (which don't exclude that layer).
export const SELF_LAYER = 10;

export function hideFromOwnCamera(camera, object3D) {
  camera.layers.disable(SELF_LAYER);
  object3D.traverse(o => o.layers.set(SELF_LAYER));
}
