# Writing new artifacts for Low Pass

Low Pass is a three.js r170 browser game with no build step (plain ES modules). You fly a
small ship low over a dark, foggy spruce forest at dusk and scan artifacts standing in
clearings. The picture is rendered small and dithered, through fog, so what matters is: a
strong silhouette that reads from 300 m, one clear idea, slow motion that rewards watching.

## Hard art rules (the owner's taboos)
- No robots. No humanoid figures of any kind: no statues, no people, no faces, hands, masks.
- No pentagrams and no star polygons anywhere (no {5/2}, {7/2}, {8/3}… star shapes, neither
  as geometry nor drawn in light; no star-shaped outlines). Circles, spirals, plain convex
  polygons, rosettes of arcs, lines and grids are fine.
- No letters, digits or writing; no religious symbols; no flags of nations.
- Themes that fit: seeking, signals, listening, measuring, time, memory, patience, fog and
  forest, mathematics made physical (primes, Fibonacci numbers, the harmonic series, the
  golden angle, cellular automata, ratios), instruments left running where nobody watches.
  Quiet, a little melancholy, never cute, never sci-fi junk.
- Everything is decided by the seed: seeded randomness only (never Math.random / Date.now);
  motion only from the `t` handed to update.

## Surface families: a set file, src/artifacts/sets/<name>.js, exporting `SET`
Model: src/artifacts/instruments.js (four families in the wanted style), parts.js (STONE, RIM,
PULSE, beam, slab, flatSeg, motes), render/build.js (the Builder), and the finished sets in
src/artifacts/sets/. Dark masses in the STONE ramp, pale RIM, ONE light (the accent color A;
emissive 0 unlit, ~1 steady, PULSE on the rhythm); pure light is a glowMaterial mesh or
pointsMaterial points on LAYER_FX with frustumCulled = false, returned in `mats`, its
uOpacity set every update to base * c.reveal. Under ~20k triangles, ~10 draw calls.

    export const SET = { <id>: {
      code: 'ABC', cls: 'Class name', nouns: [six nouns],
      place: 'any' | 'mountain' | 'autumn' | 'river' | 'lake',
      kin: [2-3 deep forms it is at heart],  voice: [two of glass fm grains breath whale chirp glitch],
      params(R, size) { return { ..., text }; },      // text: one or two concrete sentences for the Codex
      build(d, A, mats, ctx) { return { group, update(t, beat, c), light, focus, span, height, clear, solid: { r, top, low }, mats }; },
    } };

d: { seed: [8 uint32], params, size, accent, grand }; ctx: { ground(lx, lz) (0 at the origin),
ringY, river: { rw } | null }; c: { pulse, reveal, near (0..1), shipLocal (Vector3) }.
Check: `node --import ./tools/check/reg.mjs tools/check/settest.mjs src/artifacts/sets/<name>.js [id]`

## Deep forms: src/artifacts/deepforms2.js (or deepforms3.js…), exporting `NEW_FORMS`
What a deeper-attuned pilot sees over an artifact: large (40-110 m), strange, luminous, in
the colors of a stratum. Read src/artifacts/deepkit.js (the Kit and the shared shapes), then
src/artifacts/deepforms.js (corolla, armillary, nest, geode, medusa, sun, chandelier,
helicon, prism, turning, leaffall are the model for richness and motion), deep.js
(formParams: how parameters grow with depth, how the Codex sentence is worded), strata.js.

    export const NEW_FORMS = { <id>: {
      code: 'ABC', cls: 'Class name', nouns: [six nouns], set: 'any'|'mountain'|'autumn'|'river'|'lake'|'plus', from: 1..4,
      params(R, depth) { return { ..., text }; },     // more of everything with depth, capped (< ~45k triangles)
      build(k, P, S, art, mini) { return { light, focus, span, height, solid, low }; },
    } };

k: its Kit (k.stone dark masses, k.shell the iridescent sheen: most of its surface, k.lit
solid glowing parts, k.glow pure additive light; k.sub(x, y, z) for each moving part; about
12 kits at most). S: scale (1.45 at depth 1 to 2.6 at depth 11; multiply all lengths).
art: { R (seeded random), pal { stone[4], light, second, third, shellLo, shellHi }, st, depth,
updates (push (t, dt, ctx, beat) => {}), ground(x, z), unique(), mats, fades }; cloud() for
motes, strips() for ribbons. mini: true when it must hang in the air centered on the origin
with NOTHING on the ground (no stems, stands, roots, pools); false: it stands on the ground
at the origin. Returns light, focus (Vector3), span (half-width), height (top), solid
(radius of its mass), low (lowest y of its mass if it floats, else 0).
Check: `node --import ./tools/check/reg.mjs tools/check/formtest.mjs src/artifacts/deepforms2.js [id]`
(in the hanging case the measured y range must be roughly centered on 0).

You cannot see the picture from the checks: work out where every part is in meters, compare
the measured extents with what you intended, and reread your geometry for parts that would
float, sink, intersect badly or face the wrong way.

## Rarity tiers (what each tier's art must feel like)
Every site has a tier, the same for every ship: COMMON, UNCOMMON, RARE, EPIC, LEGENDARY,
MYTHIC (MYTHIC so rare that among a hundred pilots perhaps one ever finds one). Each tier
has its own families at the surface and its own true forms below; the higher the tier,
the more a pilot must feel, on arriving, that the flight was worth it.
- EPIC (sets/epic.js; forms in deepforms4.js): 40-80 m at the surface, one unforgettable
  idea, more parts in motion than an ordinary family, a second light color allowed (the
  tier's violet, 0xb48cff, beside the accent A).
- LEGENDARY (sets/legendary.js; forms in deepforms4.js): 70-130 m, monumental and slow,
  gold as its second light (0xffd27a), something that keeps changing over a minute so it
  rewards circling it.
- MYTHIC (sets/mythic.js; forms in deepforms5.js): a landmark, 120-260 m, unlike anything
  else in the game, seen from far through the fog (tall glowing parts, LAYER_FX light),
  prismatic second light (cycling hue is fine), a slow event that unfolds over minutes.
Tier families stand on any ground ('any'); set `floats: true` on one that hangs in the air
with nothing on the ground, so it may stand out on a lake too. Their `kin` may name any
existing form: the tier's own forms are assigned centrally (src/artifacts/tiers.js).
Tier forms use set: 'plus' and from: 1.

## The two reaches (biomes): the Grey Waste and the Great Lake
Rare regions several kilometers across (src/world/terrain.js: desertEnv, lakeEnv). Each
has families of its own for EVERY tier, in its own set file, each entry carrying
`tier: 0..5` (0 COMMON, 1 UNCOMMON, 2 RARE, 3 EPIC, 4 LEGENDARY, 5 MYTHIC) and its place:
- **The Grey Waste** (`place: 'desert'`, sets/desert.js): the dark spruce forest gives
  out to a pale grey desert, flat and wide, ridged in long dunes, nothing growing but a
  dead snag here and there, the same fog over it. Alien, quiet, bleached: what is out
  there was half buried, scoured by wind, glazed, salted, abandoned. Ideas: glass fused
  where something struck, wind-cut stone pillars that sing, a mirage that stands and
  wavers, a field of stones that have slid leaving tracks, a buried ring of which an arc
  shows, salt pans that pattern themselves, a sundial of a whole dune, dust devils held
  still. The ground is gentle dunes (ctx.ground small slopes); sand is pale grey, so
  dark masses read well against it.
- **The Great Lake** (`place: 'greatlake'`, sets/greatlake.js): a lake to the horizon,
  dark and still, wooded islands in it. Its families stand in or on the water, as the
  lakes' own in sets/waters.js do (the ground there is the water's surface, y 0; things
  may rise from below it, float on it, or hang over it). Ideas: a drowned tower with
  light still in its windows under the surface, a ring of standing waves, a raft of
  lanterns that drifts and returns, a gate of reeds of light, a lens of water lifted
  into the air, an island that is a shell, a bridge that ends in the middle of the lake.
Scale and light by tier as above (COMMON/UNCOMMON 15-40 m, RARE 30-60 m, EPIC 40-80 m
with violet, LEGENDARY 70-130 m with gold, MYTHIC 120-260 m prismatic, seen from afar).
Check: `node --import ./tools/check/reg.mjs tools/check/settest.mjs src/artifacts/sets/<file>.js`
