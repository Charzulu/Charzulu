import * as THREE from 'three';

export class InfantryAnimController {
  constructor({ model, mixer, actions }) {
    this.model = model;
    this.mixer = mixer;
    this.actions = actions;
    this.state = { stance: 'stand', speed01: 0, aimYaw: 0, aimPitch: 0, isAiming: false };
    this.spine = this.findBone('Spine');
    this.chest = this.findBone('Chest');
    this.neck = this.findBone('Neck');
    this.head = this.findBone('Head');
  }

  findBone(name) {
    let found = null;
    this.model.traverse((o) => {
      if (o.isBone && o.name === name) found = o;
    });
    return found;
  }

  playLoop(name, fade = 0.15) {
    const clip = this.actions[name];
    if (!clip) return;
    Object.entries(this.actions).forEach(([k, a]) => {
      if (k !== name && !k.endsWith('_upper') && a.isRunning()) a.fadeOut(fade);
    });
    clip.setLoop(THREE.LoopRepeat, Infinity);
    clip.reset().fadeIn(fade).play();
  }

  trigger(name) {
    const clip = this.actions[name];
    if (!clip) return;
    clip.setLoop(THREE.LoopOnce, 1);
    clip.clampWhenFinished = true;
    clip.reset().fadeIn(0.05).play();
  }

  updateFromSim(simState) {
    this.state = { ...this.state, ...simState };
    const s = this.state;
    const loco = s.stance === 'prone' ? (s.speed01 > 0.1 ? 'prone_crawl' : 'prone_idle')
      : s.stance === 'crouch' ? (s.speed01 > 0.1 ? 'crouch_walk' : 'crouch_idle')
      : s.speed01 > 0.6 ? 'run_fwd'
      : s.speed01 > 0.1 ? 'walk_fwd'
      : 'idle';
    this.playLoop(loco, 0.12);
    if (s.isAiming && this.actions.aim_upper && !this.actions.aim_upper.isRunning()) this.actions.aim_upper.reset().play();
    if (!s.isAiming && this.actions.aim_upper?.isRunning()) this.actions.aim_upper.fadeOut(0.1);
  }

  applyAimOffset() {
    const yaw = THREE.MathUtils.clamp(this.state.aimYaw, -1.2, 1.2);
    const pitch = THREE.MathUtils.clamp(this.state.aimPitch, -0.8, 0.8);
    if (this.spine) { this.spine.rotation.y = yaw * 0.35; this.spine.rotation.x = pitch * 0.2; }
    if (this.chest) { this.chest.rotation.y = yaw * 0.45; this.chest.rotation.x = pitch * 0.4; }
    if (this.neck) { this.neck.rotation.y = yaw * 0.15; this.neck.rotation.x = pitch * 0.25; }
    if (this.head) { this.head.rotation.y = yaw * 0.05; this.head.rotation.x = pitch * 0.15; }
  }

  update(dt) {
    this.mixer.update(dt);
    this.applyAimOffset();
  }
}
