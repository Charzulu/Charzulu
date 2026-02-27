# Iron Silhouettes Prototype

Basic but working local multiplayer-ready prototype with:
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
- `shared/` constants + message schemas
- `client/` Three.js renderer, interpolation, UI, controls

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

## Game modes

Menu lets you pick:
- **Test Range:** lanes + enemies around 50/100/200/400m, walls, crate
- **Sandbox:** mostly empty, spawn objects via debug panel

## Implementation notes

- Server runs authoritative simulation at **20Hz fixed tick** (`TICK_DT = 0.05`).
- Client renders at browser frame rate and performs **snapshot interpolation** with a 100ms delay buffer.
- Projectile collision uses per-tick segment progression and simple overlap checks vs entities/walls/ground.
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
