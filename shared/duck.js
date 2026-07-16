// ---------------------------------------------------------------------------
// Ducktape — shared duck model loader
// ---------------------------------------------------------------------------
// The real model ("Duck Baby - Animated Low Poly" by WildPoly3D, CC-BY-4.0 —
// see assets/duck_model_license.txt) ships already converted and extracted as
// assets/scene.gltf + assets/scene.bin, so DUCK_MODEL_URL below resolves out
// of the box. If those files are ever removed, loadDuck() 404s silently and
// every client falls back to buildPlaceholderDuck(), so the game stays
// playable either way.
// ---------------------------------------------------------------------------

export const DUCK_MODEL_URL = "./assets/duck_baby_-_animated_low_poly.glb";

// Name of the clip to loop while the duck stands still / walks. Falls back to
// whatever clip index 0 happens to be if these names aren't present in the file.
const IDLE_CLIP = "Duckling_Rig|Duckling_Rig|Duckling_Rig|stand_idle";
const WALK_CLIP = "Duckling_Rig|Duckling_Rig|Duckling_Rig|walk";

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
 * Either way the result is tinted with `color` so the three ducks stay
 * visually distinguishable (blind = white, mute = gold, deaf's own view = cyan,
 * etc.) — pass `null` if you want the real model's baked colors untouched.
 *
 * onReady receives { group, mixer, actions, setMoving }:
 *   - mixer must be advanced every frame with mixer.update(deltaSeconds),
 *     otherwise the model stays frozen even though clips are "playing".
 *   - setMoving(bool) crossfades between the walk and idle clips; call it
 *     once per frame with the result of rig.isMoving().
 */
export function loadDuck(color, onReady) {
  if (typeof THREE.GLTFLoader === "undefined") {
    onReady(withNoopAnimation(buildPlaceholderDuck(color)));
    return;
  }
  const loader = new THREE.GLTFLoader();
  loader.load(
    DUCK_MODEL_URL,
    (gltf) => {
      const group = gltf.scene;
      group.scale.setScalar(1.0); // adjust once you see real-world scale
      if (color != null) tintRealDuck(group, color);

      const mixer = new THREE.AnimationMixer(group);
      const actions = {};
      gltf.animations.forEach((clip) => {
        actions[clip.name] = mixer.clipAction(clip);
      });

      const idle = actions[IDLE_CLIP] || actions[gltf.animations[0]?.name];
      const walk = actions[WALK_CLIP];
      let current = idle;
      if (current) current.play();

      function setMoving(isMoving) {
        const next = (isMoving && walk) ? walk : idle;
        if (!next || next === current) return;
        next.reset().play();
        if (current) current.crossFadeTo(next, 0.25, false);
        current = next;
      }

      onReady({ group, mixer, actions, setMoving });
    },
    undefined,
    () => {
      // 404 or parse failure — fall back silently so the prototype keeps working.
      onReady(withNoopAnimation(buildPlaceholderDuck(color)));
    }
  );
}

/** Placeholder duck has no clips — give it the same shape as the real duck's result. */
function withNoopAnimation(duck) {
  duck.setMoving = () => {};
  return duck;
}

/** Tints a duck's materials (used automatically by loadDuck; exported in case you need it again later). */
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
