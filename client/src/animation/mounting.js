export function findMountPoint(vehicleModel, mountName) {
  let found = null;
  vehicleModel.traverse((o) => {
    if (o.name === mountName) found = o;
  });
  return found;
}

export function mountInfantryToVehicle(infantryModel, vehicleModel, mountPointName) {
  const mount = findMountPoint(vehicleModel, mountPointName);
  if (!mount) return false;
  mount.add(infantryModel);
  infantryModel.position.set(0, 0, 0);
  infantryModel.quaternion.set(0, 0, 0, 1);
  return true;
}
