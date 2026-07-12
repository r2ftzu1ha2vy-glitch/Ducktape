// ---------------------------------------------------------------------------
// Ducktape — shared duck model loader
// ---------------------------------------------------------------------------
// Your uploaded Duck_Baby.fbx can't be loaded directly by a browser — Three.js
// needs glTF/GLB. Convert it once, then this file will pick it up automatically:
//
//   1. Open Duck_Baby.fbx in Blender (free, blender.org)
//   2. File > Import > FBX, select Duck_Baby.fbx
//   3. File > Export > glTF 2.0 (.glb), name it duck_baby.glb
//   4. Drop duck_baby.glb into /assets/ next to index.html
//
// Until that file exists, DUCK_MODEL_URL below will 404 and every client
// silently falls back to buildPlaceholderDuck(), so the game stays playable.
// ---------------------------------------------------------------------------

export const DUCK_MODEL_URL = "./assets/duck_baby.glb";

export function buildPlaceholderDuck(color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 });
  const billMat = new THREE.MeshStandardMaterial({ color: 0xff8c3d, flatShading: true, roughness: 0.6 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1b2a2f, flatShading: true });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), bodyMat);
  body.scale.set(1, 0.85, 1.2);
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), bodyMat);
  head.position.set(0, 0.9, 0.7);
  g.add(head);

  const bill = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.5, 6), billMat);
  bill.rotation.x = Math.PI / 2;
  bill.position.set(0, 0.85, 1.25);
  g.add(bill);

  [-0.22, 0.22].forEach((x) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), eyeMat);
    eye.position.set(x, 1.05, 1.05);
    g.add(eye);
  });

  [-0.55, 0.55].forEach((x) => {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 6), bodyMat);
    wing.scale.set(0.4, 0.9, 0.9);
    wing.position.set(x, 0.1, 0);
    g.add(wing);
  });

  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, mixer: null, actions: {} };
}

/**
 * Loads the real duck GLB if present; falls back to the placeholder duck.
 * Applies a color tint to the fallback only (the real model keeps its own
 * baked materials — use tintRealDuck() separately if you want to recolor it).
 */
export function loadDuck(color, onReady) {
  if (typeof THREE.GLTFLoader === "undefined") {
    onReady(buildPlaceholderDuck(color));
    return;
  }
  const loader = new THREE.GLTFLoader();
  loader.load(
    DUCK_MODEL_URL,
    (gltf) => {
      const group = gltf.scene;
      group.scale.setScalar(1.0); // adjust once you see real-world scale
      const mixer = new THREE.AnimationMixer(group);
      const actions = {};
      gltf.animations.forEach((clip) => {
        actions[clip.name] = mixer.clipAction(clip);
      });
      // Play the first available animation (usually idle/walk) if any exist.
      const first = gltf.animations[0];
      if (first) actions[first.name].play();
      onReady({ group, mixer, actions });
    },
    undefined,
    () => {
      // 404 or parse failure — fall back silently so the prototype keeps working.
      onReady(buildPlaceholderDuck(color));
    }
  );
}

/** Optional: tints a loaded real duck's materials (call after loadDuck resolves). */
export function tintRealDuck(group, color) {
  group.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.color) {
          m.color = new THREE.Color(color);
        }
      });
    }
  });
}
