import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export async function loadInfantryRig(url) {
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = Object.fromEntries(gltf.animations.map((clip) => [clip.name, mixer.clipAction(clip)]));
  return { model, mixer, actions };
}
