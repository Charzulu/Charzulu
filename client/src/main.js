import * as THREE from 'three';
import { io } from 'socket.io-client';
import { SNAPSHOT_DELAY_MS, TEAM, UNIT_TYPES } from '@shared/constants.js';

const socket = io('http://localhost:3001');
const canvas = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#7f9db8');
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 2500);

scene.add(new THREE.HemisphereLight(0xffffff, 0x202030, 1));
const dir = new THREE.DirectionalLight(0xffffff, 0.8); dir.position.set(30, 80, 10); scene.add(dir);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: '#425847' }));
ground.rotation.x = -Math.PI / 2; scene.add(ground);
[-50, -100, -200, -400].forEach((z) => {
  const lane = new THREE.Mesh(new THREE.BoxGeometry(30, 0.05, 0.3), new THREE.MeshBasicMaterial({ color: '#d8d39e' }));
  lane.position.set(0, 0.03, z);
  scene.add(lane);
});

const map = new Map();
let doorMeshes = [];
let state = { entities: [], projectiles: [], explosions: [], walls: [], doors: [], crates: [], stats: {}, debug: {} };
const snapshots = [];
let selected = [];
let possessed = null;
let directMode = false;
let dragging = false;
let dragStart = null;
const input = { forward: 0, right: 0, fire: false, reload: false, mountToggle: false, action: false };
const mouseNdc = new THREE.Vector2();
const raycaster = new THREE.Raycaster();

const menu = document.getElementById('menu');
menu.querySelectorAll('button').forEach((b) => b.onclick = () => { socket.emit('setMode', b.dataset.mode); menu.classList.add('hidden'); });

socket.on('snapshot', (s) => {
  snapshots.push(s);
  while (snapshots.length > 20) snapshots.shift();
});
socket.on('pingEstimate', (t) => socket.emit('pongEstimate', t));

function buildDebugUI() {
  const el = document.getElementById('debug');
  const sliders = [
    ['bulletGravity', -30, 0, 0.1], ['muzzleVelocity', 40, 300, 1], ['drag', 0, 0.05, 0.001],
    ['spread', 0, 0.2, 0.001], ['explosionRadius', 1, 30, 0.1], ['penetrationMultiplier', 0.2, 3, 0.1], ['ricochetThreshold', 0.1, 1, 0.01]
  ];
  const spawns = [['infantry', 'Spawn infantry dummy'], ['light', 'Spawn light vehicle'], ['heavy', 'Spawn heavy vehicle'], ['wall', 'Spawn wall'], ['crate', 'Spawn ammo crate']];
  el.innerHTML = '<h3>Debug F1</h3><div id="stats"></div>';
  sliders.forEach(([k, min, max, step]) => {
    el.innerHTML += `<label>${k}<input id="dbg-${k}" type="range" min="${min}" max="${max}" step="${step}"></label><span id="val-${k}"></span>`;
  });
  spawns.forEach(([kind, txt]) => {
    const btn = document.createElement('button'); btn.textContent = txt;
    btn.onclick = () => socket.emit('spawn', { kind, pos: { x: (Math.random() - 0.5) * 20, y: 0, z: -60 + Math.random() * 20 } });
    el.appendChild(btn);
  });
  el.addEventListener('input', () => {
    const d = {};
    sliders.forEach(([k]) => { d[k] = Number(document.getElementById(`dbg-${k}`).value); document.getElementById(`val-${k}`).textContent = d[k].toFixed(3); });
    socket.emit('setDebug', d);
  });
}
buildDebugUI();

function renderInventory() {
  const inv = document.getElementById('inventory');
  if (!possessed) return;
  const unit = state.entities.find((e) => e.id === possessed);
  if (!unit) return;
  inv.innerHTML = `<h3>Inventory ${unit.id}</h3><div>Primary: ${unit.inventory.primary}</div>`;
  unit.inventory.slots.forEach((item, i) => {
    const d = document.createElement('div');
    d.className = 'slot'; d.draggable = true; d.dataset.slot = `slot${i}`; d.textContent = `${i}: ${item || '(empty)'}`;
    d.ondragstart = (e) => e.dataTransfer.setData('text', d.dataset.slot);
    d.ondragover = (e) => e.preventDefault();
    d.ondrop = (e) => { e.preventDefault(); socket.emit('inventoryMove', { unitId: unit.id, fromSlot: e.dataTransfer.getData('text'), toSlot: d.dataset.slot }); };
    inv.appendChild(d);
  });
}

function getInterpolated() {
  const now = Date.now() - SNAPSHOT_DELAY_MS;
  while (snapshots.length >= 2 && snapshots[1].time <= now) snapshots.shift();
  if (snapshots.length < 2) return snapshots[0] || state;
  const a = snapshots[0], b = snapshots[1];
  const t = THREE.MathUtils.clamp((now - a.time) / Math.max(1, b.time - a.time), 0, 1);
  // Snapshot interpolation: authoritative snapshots are buffered and lerped by render timestamp.
  const entities = b.entities.map((be) => {
    const ae = a.entities.find((x) => x.id === be.id) || be;
    return { ...be, pos: { x: THREE.MathUtils.lerp(ae.pos.x, be.pos.x, t), y: THREE.MathUtils.lerp(ae.pos.y, be.pos.y, t), z: THREE.MathUtils.lerp(ae.pos.z, be.pos.z, t) } };
  });
  return { ...b, entities };
}

function meshFor(entity) {
  let geo = new THREE.BoxGeometry(1, 1, 1);
  if (entity.type === UNIT_TYPES.INFANTRY) geo = new THREE.CapsuleGeometry(0.3, 0.8, 4, 8);
  if (entity.type === UNIT_TYPES.TANK) geo = new THREE.BoxGeometry(2.4, 1.1, 3.4);
  if (entity.type === UNIT_TYPES.MECH) geo = new THREE.BoxGeometry(1.7, 2.1, 1.7);
  const mat = new THREE.MeshStandardMaterial({ color: entity.team === TEAM.PLAYER ? '#3ea7ff' : '#ff7043' });
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(mesh);
  return mesh;
}

function syncScene() {
  state = getInterpolated();
  for (const e of state.entities) {
    if (!map.has(e.id)) map.set(e.id, meshFor(e));
    const m = map.get(e.id);
    m.position.set(e.pos.x, e.pos.y + 0.6, e.pos.z);
    m.lookAt(e.pos.x + e.forward.x, e.pos.y + e.forward.y, e.pos.z + e.forward.z);
    if (e.incapacitated === 'downed') m.material.color.set('#ffd166');
    else if (e.incapacitated === 'unconscious') m.material.color.set('#bdbdbd');
    else m.material.color.set(e.team === TEAM.PLAYER ? '#3ea7ff' : '#ff7043');
    m.scale.y = Math.max(0.2, e.hp / e.maxHp);
  }
  [...map.keys()].forEach((id) => {
    if (!state.entities.find((e) => e.id === id)) { scene.remove(map.get(id)); map.delete(id); }
  });

  scene.children.filter((o) => o.userData.temp).forEach((o) => scene.remove(o));

  doorMeshes.forEach((x) => scene.remove(x));
  doorMeshes = [];
  state.doors?.forEach((door) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2, 0.2), new THREE.MeshStandardMaterial({ color: door.open ? '#6fa07a' : '#8b4f3c' }));
    mesh.position.set(door.pos.x, 1, door.pos.z);
    if (door.open) mesh.rotation.y = Math.PI / 2;
    doorMeshes.push(mesh);
    scene.add(mesh);
  });

  state.projectiles.forEach((p) => {
    const pts = [new THREE.Vector3(p.prevPos.x, p.prevPos.y, p.prevPos.z), new THREE.Vector3(p.pos.x, p.pos.y, p.pos.z)];
    const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffd166' }));
    l.userData.temp = true; scene.add(l);
  });
  state.explosions.forEach((e) => {
    const r = new THREE.Mesh(new THREE.RingGeometry(e.radius * 0.3, e.radius * 0.35, 24), new THREE.MeshBasicMaterial({ color: '#111', side: THREE.DoubleSide }));
    r.rotation.x = -Math.PI / 2; r.position.set(e.pos.x, 0.02, e.pos.z); r.userData.temp = true; scene.add(r);
  });
}

function updateCamera() {
  const focus = state.entities.find((e) => e.id === (possessed || selected[0]));
  if (!focus) return;
  if (directMode) camera.position.set(focus.pos.x - focus.forward.x * 5, focus.pos.y + 3, focus.pos.z - focus.forward.z * 5);
  else camera.position.set(focus.pos.x + 18, 20, focus.pos.z + 18);
  camera.lookAt(focus.pos.x, focus.pos.y + 1, focus.pos.z);
}

function sendInput() {
  if (!directMode || !possessed) return;
  const aim = rayToGround();
  socket.emit('input', { unitId: possessed, seq: Date.now(), move: { forward: input.forward, right: input.right }, aim, fire: input.fire, reload: input.reload, mountToggle: input.mountToggle, action: input.action });
  input.mountToggle = false;
  input.action = false;
}

function rayToGround() {
  raycaster.setFromCamera(mouseNdc, camera);
  const p = new THREE.Vector3();
  raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p);
  return { x: p.x, y: p.y, z: p.z };
}

window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') { e.preventDefault(); directMode = !directMode; document.getElementById('modeLabel').textContent = `Mode: ${directMode ? 'Direct' : 'RTS'}`; }
  if (e.key === 'w') input.forward = 1; if (e.key === 's') input.forward = -1; if (e.key === 'a') input.right = -1; if (e.key === 'd') input.right = 1;
  if (e.key === 'r') input.reload = true;
  if (e.key === 'v') input.mountToggle = true;
  if (e.code === 'Space') { e.preventDefault(); input.action = true; }
  if (e.key === 'q' || e.key === 'e') {
    const mine = state.entities.filter((x) => x.team === TEAM.PLAYER);
    if (!mine.length) return;
    let idx = Math.max(0, mine.findIndex((u) => u.id === possessed));
    idx = (idx + (e.key === 'e' ? 1 : mine.length - 1)) % mine.length;
    possessed = mine[idx].id;
  }
  if (e.key === 'F1') { e.preventDefault(); document.getElementById('debug').classList.toggle('hidden'); }
  if (e.key === 'i') { document.getElementById('inventory').classList.toggle('hidden'); renderInventory(); }
  if (e.key === 'f' && possessed) socket.emit('loot', possessed);
});
window.addEventListener('keyup', (e) => { if (['w', 's'].includes(e.key)) input.forward = 0; if (['a', 'd'].includes(e.key)) input.right = 0; if (e.key === 'r') input.reload = false; });
window.addEventListener('mousemove', (e) => { mouseNdc.x = (e.clientX / window.innerWidth) * 2 - 1; mouseNdc.y = -(e.clientY / window.innerHeight) * 2 + 1; });
window.addEventListener('mousedown', (e) => {
  if (e.button === 0) {
    input.fire = directMode;
    if (!directMode) {
      dragging = true; dragStart = { x: e.clientX, y: e.clientY };
      const hit = pickEntity(e.clientX, e.clientY);
      if (hit) selected = e.shiftKey ? [...new Set([...selected, hit])] : [hit];
      if (!possessed) possessed = selected[0];
    }
  }
  if (e.button === 2 && !directMode) {
    const targetId = pickEntity(e.clientX, e.clientY, true);
    if (targetId) socket.emit('order', { unitIds: selected, type: 'attack', targetId });
    else socket.emit('order', { unitIds: selected, type: 'move', targetPos: rayToGround() });
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button !== 0) return;
  input.fire = false;
  if (dragging && dragStart && !directMode) {
    const dx = Math.abs(e.clientX - dragStart.x);
    const dy = Math.abs(e.clientY - dragStart.y);
    if (dx > 8 || dy > 8) {
      const minX = Math.min(e.clientX, dragStart.x);
      const maxX = Math.max(e.clientX, dragStart.x);
      const minY = Math.min(e.clientY, dragStart.y);
      const maxY = Math.max(e.clientY, dragStart.y);
      const hits = state.entities
        .filter((ent) => ent.team === TEAM.PLAYER)
        .filter((ent) => {
          const v = new THREE.Vector3(ent.pos.x, ent.pos.y + 1, ent.pos.z).project(camera);
          const sx = (v.x * 0.5 + 0.5) * window.innerWidth;
          const sy = (-v.y * 0.5 + 0.5) * window.innerHeight;
          return sx >= minX && sx <= maxX && sy >= minY && sy <= maxY;
        })
        .map((u) => u.id);
      if (hits.length) selected = e.shiftKey ? [...new Set([...selected, ...hits])] : hits;
    }
  }
  dragging = false;
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

function pickEntity(x, y, enemyOnly = false) {
  const ndc = new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const intersects = [...map.values()].map((m) => ({ obj: m, hit: raycaster.ray.distanceToPoint(m.position) < 1.5 })).filter((x) => x.hit);
  if (!intersects.length) return null;
  const id = [...map.entries()].find(([, m]) => m === intersects[0].obj)?.[0];
  if (!id) return null;
  if (enemyOnly) return state.entities.find((e) => e.id === id && e.team !== TEAM.PLAYER)?.id || null;
  return id;
}

function loop() {
  syncScene();
  updateCamera();
  sendInput();
  const stats = document.getElementById('stats');
  if (stats) stats.textContent = `Tick:${state.stats.tickRate || 0} RTT:${Math.round(state.stats.rttMs || 0)}ms\nEntities:${state.stats.entityCount || 0} Projectiles:${state.stats.projectileCount || 0}\nHit:${JSON.stringify(state.stats.lastHit || {})}`;
  if (state.debug && document.getElementById('dbg-bulletGravity')) {
    Object.entries(state.debug).forEach(([k, v]) => { const r = document.getElementById(`dbg-${k}`); if (r && document.activeElement !== r) r.value = v; const s = document.getElementById(`val-${k}`); if (s) s.textContent = Number(v).toFixed(3); });
  }
  renderInventory();
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
