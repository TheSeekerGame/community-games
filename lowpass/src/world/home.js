// The Obelisk: where every ship first takes off from, the same for every pilot. A slab
// of dark stone some nine hundred meters tall standing out of the forest (its trees come
// up to a thirty-fifth of it, as on the cover of qntm's "There Is No Antimemetics
// Division" that it is after), split down one side by a narrow slit. The ships' pad is
// on its roof. It is the uplink: scans are transmitted within sight of it (UPLINK_R), and
// it posts the day's commissions (commissions.js).
//
// Only numbers here, and the shape's footprint, so that anything (the terrain's trees,
// the ship's height) may ask without importing the world. obelisk.js builds it.

export const HOME = {
  x: 700, z: -1666,        // its middle (a place no site stands within a kilometer of)
  yaw: 0.35,               // turned so: its broad face looks a little east of south
  ground: 17,              // the lowest ground under it (it is sunk below)
  // the two slabs, along its length (x in its own frame), from the left: widths, heights
  slabs: [{ w: 320, h: 900 }, { w: 150, h: 872 }],
  slit: 14,                // the gap between them
  depth: 150,
};
export const HOME_W = HOME.slabs[0].w + HOME.slit + HOME.slabs[1].w;
export const ROOF = HOME.ground + HOME.slabs[0].h;     // the pad's height (the taller slab)
export const UPLINK_R = 12000;                         // within this, scans can be transmitted
export const HOME_CODE = 'THE OBELISK';

// (x, z) in the obelisk's own frame: u along its length (0 at its middle), v across
export function homeLocal(x, z) {
  const dx = x - HOME.x, dz = z - HOME.z, c = Math.cos(HOME.yaw), s = Math.sin(HOME.yaw);
  return [dx * c - dz * s, dx * s + dz * c];
}
// and back
export function homeWorld(u, v) {
  const c = Math.cos(HOME.yaw), s = Math.sin(HOME.yaw);
  return [HOME.x + u * c + v * s, HOME.z - u * s + v * c];
}

// how far (x, z) is outside its footprint (0 or less: under it)
export function homeOutside(x, z) {
  const [u, v] = homeLocal(x, z);
  const du = Math.abs(u) - HOME_W / 2, dv = Math.abs(v) - HOME.depth / 2;
  return du > 0 || dv > 0 ? Math.hypot(Math.max(du, 0), Math.max(dv, 0)) : Math.max(du, dv);
}

// the roof under (x, z) (the slab's own height), or -Infinity
export function roofAt(x, z) {
  const [u, v] = homeLocal(x, z);
  if (Math.abs(v) > HOME.depth / 2) return -Infinity;
  const a = -HOME_W / 2, b = a + HOME.slabs[0].w, c = b + HOME.slit;
  if (u >= a && u <= b) return HOME.ground + HOME.slabs[0].h;
  if (u >= c && u <= HOME_W / 2) return HOME.ground + HOME.slabs[1].h;
  return -Infinity;
}

// What the ship must fly over about it: its roof, and the air about it falling away at a
// slope it can climb (it rises along it coming in, and comes down off it going out).
const RAMP = 0.55;
export function homeTop(x, z) {
  const out = homeOutside(x, z);
  if (out > ROOF / RAMP) return -Infinity;
  return ROOF - Math.max(0, out) * RAMP;
}

// where a new ship stands at first: at the end of the taller slab's roof, facing along
// it, over the pad, the slit and the lower slab, and off the far end (the ship's
// heading: its way is (sin h, cos h); the obelisk's length runs (cos yaw, -sin yaw))
export function homeStart() {
  const [x, z] = homeWorld(-HOME_W / 2 + 30, 0);
  return { x, z, heading: Math.atan2(Math.cos(HOME.yaw), -Math.sin(HOME.yaw)) };
}
export const homeDist = (x, z) => Math.hypot(x - HOME.x, z - HOME.z);
