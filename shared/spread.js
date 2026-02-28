export function applyConeSpread(dir, spreadRad, rng = Math.random) {
  const u = rng();
  const v = rng();
  const theta = 2 * Math.PI * u;
  const cosPhi = 1 - v * (1 - Math.cos(spreadRad));
  const sinPhi = Math.sqrt(1 - cosPhi * cosPhi);

  let up = { x: 0, y: 1, z: 0 };
  if (Math.abs(dir.y) > 0.9) up = { x: 1, y: 0, z: 0 };

  const rx = dir.y * up.z - dir.z * up.y;
  const ry = dir.z * up.x - dir.x * up.z;
  const rz = dir.x * up.y - dir.y * up.x;
  const rlen = Math.hypot(rx, ry, rz) || 1;
  const r = { x: rx / rlen, y: ry / rlen, z: rz / rlen };

  const ux = r.y * dir.z - r.z * dir.y;
  const uy = r.z * dir.x - r.x * dir.z;
  const uz = r.x * dir.y - r.y * dir.x;
  const ulen = Math.hypot(ux, uy, uz) || 1;
  const up2 = { x: ux / ulen, y: uy / ulen, z: uz / ulen };

  const c = Math.cos(theta), s = Math.sin(theta);
  const ox = r.x * c + up2.x * s;
  const oy = r.y * c + up2.y * s;
  const oz = r.z * c + up2.z * s;

  const nx = dir.x * cosPhi + ox * sinPhi;
  const ny = dir.y * cosPhi + oy * sinPhi;
  const nz = dir.z * cosPhi + oz * sinPhi;
  const nlen = Math.hypot(nx, ny, nz) || 1;
  return { x: nx / nlen, y: ny / nlen, z: nz / nlen };
}
