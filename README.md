# Iron Silhouettes Prototype

Local multiplayer-ready prototype with:
- **Client:** Three.js (Vite, ESM)
- **Server:** Node.js + Express + Socket.IO
- **Shared:** JSON message schemas validated with zod

## Quick start

```bash
npm install
npm run dev
```

- Client: http://localhost:5173
- Server health: http://localhost:3001/health

## Project structure

- `server/` authoritative fixed-step simulation and networking
- `shared/` constants, schemas, spread math utility
- `client/` Three.js renderer, interpolation, UI, controls
- `client/src/animation/` infantry animation architecture modules (loader/controller/mounting helpers)

## Controls

### Global
- `F1` toggle debug overlay
- `TAB` toggle RTS / Direct Control
- `I` inventory panel

### RTS
- Left click unit = select
- Shift + left click = add to selection
- Drag left mouse = box select
- Right click ground = move order
- Right click enemy = attack order

### Direct control
- Possess selected unit (or cycle with `Q` / `E`)
- `WASD` move
- Mouse aim
- Left click fire
- `R` reload intent
- `V` mount / dismount nearest mount point
- `F` loot nearby crate
- `Space` contextual **Action**

## Infantry contextual Action (Space)

Infantry `Action` is server-authoritative and resolves contextually in this order:
1. Drop currently dragged downed ally.
2. Start dragging a nearby downed ally (BattleBit-style dragging).
3. Open/close nearby door.
4. Mount nearby vehicle.
5. Mantle across nearby wall cover.

## Downed / unconscious infantry

Infantry now have incapacitation states:
- `active`: normal behavior
- `downed`: cannot act; can be dragged by another infantry (timer ~15s)
- `unconscious`: after downed bleed-out, remains unconscious (timer ~20s), then removed

Downed/unconscious states are replicated to clients and shown with debug colors:
- downed: yellow
- unconscious: gray

## Game modes

Menu lets you pick:
- **Test Range:** lanes + enemies around 50/100/200/400m, walls, door, crate
- **Sandbox:** mostly empty, spawn objects via debug panel

## Implementation notes

- Server runs authoritative simulation at **20Hz fixed tick** (`TICK_DT = 0.05`).
- Client renders at browser frame rate and performs **snapshot interpolation** with a 100ms delay buffer.
- Projectile simulation is server-side and uses fixed-step update: `position += velocity * dt`, `velocity += gravity * dt`.
- Projectile collision checks are simple overlap tests against entities/walls/ground each tick.
- Penetration model:
  - armor zone from hit direction vs target forward
  - effective thickness = `thickness / max(0.2, cos(angle))`
  - penetration success if projectile power >= effective thickness
  - otherwise apply reduced spall/shock damage and optional ricochet chance

## Debug overlay (F1)

Includes sliders for:
- bullet gravity
- muzzle velocity
- drag
- spread
- explosion radius
- penetration multiplier
- ricochet threshold

And buttons to spawn:
- infantry dummy
- light vehicle
- heavy vehicle
- walls
- ammo crates

Live stats:
- tick rate
- RTT estimate
- entity count
- projectile count
- last hit details

## Notes / MVP scope

- In-memory only; no database.
- Visual style is low-poly primitives + flat colors.
- Explosion craters are visual ring decals only.
- Pathing is straight-line steering and intentionally simple.
