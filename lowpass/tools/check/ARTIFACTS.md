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
