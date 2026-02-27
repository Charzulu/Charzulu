import { ORDER_TYPES, TEAM, TICK_DT, UNIT_TYPES, MODES } from '../shared/constants.js';

let nextEntityId = 1;
let nextProjectileId = 1;
const id = (prefix) => `${prefix}-${nextEntityId++}`;

const unitConfigs = {
  infantry: { hp: 100, speed: 7, radius: 0.5, weapon: 'rifle', range: 90, armor: { front: 12, side: 8, rear: 6, top: 5 } },
  mech: { hp: 300, speed: 5, radius: 1.2, weapon: 'cannon', range: 180, armor: { front: 55, side: 45, rear: 35, top: 20 } },
  tank: { hp: 500, speed: 4, radius: 1.5, weapon: 'tankGun', range: 240, armor: { front: 90, side: 70, rear: 45, top: 25 } }
};

const weaponConfigs = {
  rifle: { cooldown: 0.2, damage: 22, penetrationPower: 16, blast: 0 },
  cannon: { cooldown: 1.2, damage: 95, penetrationPower: 80, blast: 5 },
  tankGun: { cooldown: 1.8, damage: 130, penetrationPower: 110, blast: 8 }
};

const vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const add = (a, b) => vec3(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a, b) => vec3(a.x - b.x, a.y - b.y, a.z - b.z);
const mul = (a, s) => vec3(a.x * s, a.y * s, a.z * s);
const len = (v) => Math.hypot(v.x, v.y, v.z);
const norm = (v) => {
  const l = len(v) || 1;
  return vec3(v.x / l, v.y / l, v.z / l);
};
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;

export class Simulation {
  constructor() {
    this.tick = 0;
    this.lastHit = null;
    this.entities = new Map();
    this.projectiles = new Map();
    this.explosions = [];
    this.walls = [];
    this.crates = [];
    this.mode = MODES.TEST_RANGE;
    this.debug = {
      bulletGravity: -9.81,
      muzzleVelocity: 140,
      drag: 0.005,
      spread: 0.02,
      explosionRadius: 8,
      penetrationMultiplier: 1,
      ricochetThreshold: 0.4
    };
    this.spawnScenario();
  }

  spawnScenario(mode = this.mode) {
    this.entities.clear();
    this.projectiles.clear();
    this.walls = [];
    this.crates = [];
    this.mode = mode;
    this.spawnUnit(UNIT_TYPES.MECH, TEAM.PLAYER, vec3(-5, 0, 10));
    this.spawnUnit(UNIT_TYPES.TANK, TEAM.PLAYER, vec3(-1, 0, 10));
    for (let i = 0; i < 4; i++) this.spawnUnit(UNIT_TYPES.INFANTRY, TEAM.PLAYER, vec3(3 + i, 0, 10));

    if (mode === MODES.TEST_RANGE) {
      [50, 100, 200, 400].forEach((z, idx) => {
        this.spawnUnit(UNIT_TYPES.INFANTRY, TEAM.ENEMY, vec3((idx % 2) * 4 - 2, 0, -z));
      });
      this.spawnWall(vec3(0, 0, -60));
      this.spawnWall(vec3(0, 0, -160));
      this.spawnCrate(vec3(8, 0, 8));
    }
  }

  spawnUnit(type, team, position) {
    const cfg = unitConfigs[type];
    const eid = id('u');
    const unit = {
      id: eid,
      type,
      team,
      hp: cfg.hp,
      maxHp: cfg.hp,
      pos: position,
      vel: vec3(),
      forward: vec3(0, 0, -1),
      radius: cfg.radius,
      order: null,
      fireCooldown: 0,
      mountedOn: null,
      mountPoint: null,
      inventory: {
        primary: cfg.weapon,
        ammo: { rifle: 120, cannon: 20, tankGun: 16 },
        slots: ['medkit', 'repair_kit', 'grenade', null, null, null]
      },
      mountPoints: type === 'infantry' ? [] : [{ name: 'hull_top', offset: vec3(0.3, 1.8, 0) }, { name: 'turret_side', offset: vec3(-0.8, 1.5, 0.4) }]
    };
    this.entities.set(eid, unit);
    return unit;
  }

  spawnWall(position) {
    this.walls.push({ id: id('wall'), pos: position, hp: 120, size: vec3(4, 2, 0.8) });
  }

  spawnCrate(position) {
    this.crates.push({ id: id('crate'), pos: position, size: vec3(1, 1, 1), loot: ['grenade', 'medkit', 'rifle_ammo'] });
  }

  applyInput(input) {
    const unit = this.entities.get(input.unitId);
    if (!unit || unit.team !== TEAM.PLAYER) return;
    unit.input = input;
  }

  applyOrder(order) {
    for (const id of order.unitIds) {
      const unit = this.entities.get(id);
      if (!unit || unit.team !== TEAM.PLAYER) continue;
      unit.order = { type: order.type, targetPos: order.targetPos, targetId: order.targetId };
    }
  }

  inventoryMove(req) {
    const unit = this.entities.get(req.unitId);
    if (!unit) return false;
    const from = Number(req.fromSlot.replace('slot', ''));
    const to = Number(req.toSlot.replace('slot', ''));
    if (Number.isNaN(from) || Number.isNaN(to)) return false;
    [unit.inventory.slots[from], unit.inventory.slots[to]] = [unit.inventory.slots[to], unit.inventory.slots[from]];
    return true;
  }

  tryLoot(unitId) {
    const unit = this.entities.get(unitId);
    if (!unit) return;
    const nearby = this.crates.find((c) => len(sub(c.pos, unit.pos)) < 3);
    if (!nearby) return;
    const empty = unit.inventory.slots.findIndex((s) => !s);
    if (empty >= 0 && nearby.loot.length) unit.inventory.slots[empty] = nearby.loot.pop();
  }

  toggleMount(unitId) {
    const infantry = this.entities.get(unitId);
    if (!infantry || infantry.type !== 'infantry') return;
    if (infantry.mountedOn) {
      infantry.mountedOn = null;
      infantry.mountPoint = null;
      infantry.pos = add(infantry.pos, vec3(1.5, 0, 0));
      return;
    }
    const host = [...this.entities.values()].find((e) => e.type !== 'infantry' && len(sub(e.pos, infantry.pos)) < 3);
    if (!host) return;
    infantry.mountedOn = host.id;
    infantry.mountPoint = host.mountPoints[0]?.name;
  }

  tickStep() {
    this.tick++;
    for (const unit of this.entities.values()) {
      if (unit.hp <= 0) continue;
      unit.fireCooldown = Math.max(0, unit.fireCooldown - TICK_DT);
      if (unit.mountedOn) {
        const host = this.entities.get(unit.mountedOn);
        if (host) {
          const mp = host.mountPoints.find((m) => m.name === unit.mountPoint) || host.mountPoints[0];
          unit.pos = add(host.pos, mp.offset);
          unit.forward = host.forward;
        }
        continue;
      }
      const cfg = unitConfigs[unit.type];
      let desired = vec3();
      if (unit.input) {
        desired.x = unit.input.move.right;
        desired.z = -unit.input.move.forward;
        unit.forward = norm(sub(unit.input.aim, unit.pos));
        if (unit.input.mountToggle) this.toggleMount(unit.id);
        if (unit.input.fire) this.fire(unit, unit.forward);
      }
      if (unit.order) this.applyOrderLogic(unit, desired);
      const v = norm(desired);
      unit.vel = mul(v, cfg.speed);
      unit.pos = add(unit.pos, mul(unit.vel, TICK_DT));
      unit.pos.y = 0;
    }
    this.stepProjectiles();
    this.cleanup();
  }

  applyOrderLogic(unit, desired) {
    if (unit.order.type === ORDER_TYPES.MOVE && unit.order.targetPos) {
      const to = sub(unit.order.targetPos, unit.pos);
      if (len(to) < 1) unit.order = null;
      else Object.assign(desired, to);
    }
    if (unit.order?.type === ORDER_TYPES.ATTACK && unit.order.targetId) {
      const target = this.entities.get(unit.order.targetId);
      if (!target || target.hp <= 0) return;
      const to = sub(target.pos, unit.pos);
      unit.forward = norm(to);
      if (len(to) > unitConfigs[unit.type].range) Object.assign(desired, to);
      else this.fire(unit, unit.forward);
    }
  }

  fire(unit, dir) {
    if (unit.fireCooldown > 0) return;
    const weapon = weaponConfigs[unit.inventory.primary];
    if (!weapon || unit.inventory.ammo[unit.inventory.primary] <= 0) return;
    unit.inventory.ammo[unit.inventory.primary] -= 1;
    unit.fireCooldown = weapon.cooldown;
    const spread = this.debug.spread * (unit.mountedOn ? 1.8 : 1);
    const noisy = norm(add(dir, vec3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)));
    const velocity = mul(noisy, this.debug.muzzleVelocity);
    const pid = `p-${nextProjectileId++}`;
    this.projectiles.set(pid, {
      id: pid,
      owner: unit.id,
      pos: add(unit.pos, vec3(0, 1.1, 0)),
      prevPos: add(unit.pos, vec3(0, 1.1, 0)),
      vel: velocity,
      damage: weapon.damage,
      penetrationPower: weapon.penetrationPower * this.debug.penetrationMultiplier,
      blast: weapon.blast
    });
  }

  stepProjectiles() {
    for (const [pid, p] of this.projectiles) {
      p.prevPos = { ...p.pos };
      p.vel.y += this.debug.bulletGravity * TICK_DT;
      p.vel = mul(p.vel, 1 - this.debug.drag);
      p.pos = add(p.pos, mul(p.vel, TICK_DT));

      const hitEntity = [...this.entities.values()].find((e) => e.id !== p.owner && e.hp > 0 && len(sub(e.pos, p.pos)) < e.radius + 0.3);
      if (hitEntity) {
        this.resolveHit(hitEntity, p);
        this.projectiles.delete(pid);
        continue;
      }

      const hitWall = this.walls.find((w) => Math.abs(p.pos.x - w.pos.x) < w.size.x / 2 && Math.abs(p.pos.z - w.pos.z) < w.size.z / 2 && p.pos.y < w.size.y);
      if (hitWall) {
        hitWall.hp -= p.damage;
        if (p.blast > 0) this.spawnExplosion(p.pos, p);
        this.projectiles.delete(pid);
        continue;
      }

      if (p.pos.y <= 0) {
        if (p.blast > 0) this.spawnExplosion(p.pos, p);
        this.projectiles.delete(pid);
      }
    }
  }

  resolveHit(entity, p) {
    const toShot = norm(sub(entity.pos, p.prevPos));
    const fwd = entity.forward;
    const sideVal = dot(toShot, vec3(fwd.z, 0, -fwd.x));
    const frontVal = dot(toShot, mul(fwd, -1));
    const topVal = Math.abs(toShot.y);
    const zone = topVal > 0.7 ? 'top' : frontVal > 0.5 ? 'front' : frontVal < -0.5 ? 'rear' : sideVal > 0 ? 'side' : 'side';
    const thickness = unitConfigs[entity.type].armor[zone] || 10;
    const incidence = Math.abs(dot(norm(p.vel), mul(toShot, -1)));
    const effective = thickness / Math.max(0.2, incidence);
    const penetrated = p.penetrationPower >= effective;
    const ricochet = !penetrated && incidence < this.debug.ricochetThreshold && Math.random() < 0.45;
    const damage = penetrated ? p.damage : Math.max(4, p.damage * 0.12);
    entity.hp -= damage;
    if (p.blast > 0) this.spawnExplosion(entity.pos, p);
    this.lastHit = { entity: entity.id, zone, thickness, effectiveThickness: Number(effective.toFixed(2)), penetrationPower: p.penetrationPower, penetrated, ricochet, damage: Number(damage.toFixed(1)) };
  }

  spawnExplosion(pos, p) {
    const radius = this.debug.explosionRadius;
    this.explosions.push({ id: id('exp'), pos, radius, ttl: 0.4 });
    for (const e of this.entities.values()) {
      const d = len(sub(e.pos, pos));
      if (d > radius) continue;
      const falloff = 1 - d / radius;
      e.hp -= p.damage * 0.35 * falloff;
      if (e.type === 'infantry') {
        const push = mul(norm(sub(e.pos, pos)), 10 * falloff);
        e.pos = add(e.pos, push);
      }
    }
  }

  cleanup() {
    this.walls = this.walls.filter((w) => w.hp > 0);
    this.explosions.forEach((e) => (e.ttl -= TICK_DT));
    this.explosions = this.explosions.filter((e) => e.ttl > 0);
    for (const e of this.entities.values()) if (e.hp <= 0) this.entities.delete(e.id);
  }

  snapshot(rttMs = 0) {
    return {
      tick: this.tick,
      time: Date.now(),
      mode: this.mode,
      debug: this.debug,
      stats: {
        tickRate: Math.round(1000 / (TICK_DT * 1000)),
        rttMs,
        entityCount: this.entities.size,
        projectileCount: this.projectiles.size,
        lastHit: this.lastHit
      },
      entities: [...this.entities.values()],
      projectiles: [...this.projectiles.values()],
      explosions: this.explosions,
      walls: this.walls,
      crates: this.crates
    };
  }
}
