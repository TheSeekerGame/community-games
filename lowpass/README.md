# Low Pass

A slow survey flight over the Fog Belt, an endless taiga on The Seeker's planet, where
the warmth under the ice keeps a forest alive and the steam it breathes never lifts.
3D, single player, in the browser, from a fully static website.

You fly low over the canopy and steer left and right; the ship keeps its own height.
Artifacts stand in the forest, each at a place of its own, the same for every ship:
nothing is spawned for you, and nothing is lost by staying in the cabin a while. The
ship hears the ones you have not recorded, and a mark along the top of the view shows
the way. Each holds more than stands at the surface, and how much of it you see is your
attunement. And when a SEEKER NET seeker moves on chain while you fly, that seeker
itself rises out of the fog, giant: witnessed, the same for every ship in the fog at
that moment. Steer to one and hold the scanner on it, and the visor photographs it into
your Codex. Inside the ship
there is room to walk, a coffee machine (you will need it: alertness runs down), the
Codex computer, where your records are, where holders share scans on a public board,
rank on a leaderboard and see their seekers' charge, live, and room for one of your own
seekers to come aboard and talk.

**Play it at <https://theseekergame.github.io/community-games/lowpass/>.**

*Low pass*: a flight close to the ground. Also the filter that softens a sound, as fog
softens light.

It is a compatible extension of [The Seeker](https://github.com/TheSeekerGame/the-seeker)'s
world, not an official release. The reasoning behind it is in [DESIGN.md](DESIGN.md).

## Play locally

There is no build step. Serve this folder with any static server (browsers do not run
JavaScript modules from `file://`); from inside it:

```bash
node tools/serve.mjs 8140
```

Then open http://localhost:8140. Requires WebGL 2 (any current Chrome, Edge, Firefox or
Safari). Keyboard and mouse, gamepad, or touch.

## Controls

| | |
| --- | --- |
| A D, or the arrows | steer (outside, and at the controls) |
| W, or ↑ (hold) | boost: the core burns plasma and the ship flies faster (outside, and at the controls) |
| SPACE (hold) | scan what is in your sights |
| 1 2 3 4 | fire the effects bought in the SHOP at what is in your sights: GLITCH, CHAOS, VOXEL, SHATTER |
| V | go inside the ship, or back out (and, when an alert is up, out from the Codex or the coffee) |
| C | camera: chase, far, low, cinematic (it goes cinematic by itself after a minute idle) |
| W A S D, mouse | walk and look inside (click to capture the mouse); SHIFT runs |
| E | use what is in front of you: the coffee machine, the Codex computer (on the cabin's right wall), the controls, a seeker aboard (E again, facing nothing else: its next line); at the controls, stand up |
| K | where the Codex computer is |
| M | keep the music playing now: that section will come back, as it is |
| R | save the last minute of sound as a WAV file |
| H | hide the interface |
| ESC | pause: volumes, pixel size, light shafts, controls, credits |

Gamepad: left stick steers and walks, right stick looks, the right trigger boosts, A scans
and uses, B stands up (and closes the Codex), X goes in and out, Y changes the camera,
the cross fires the effects (up, right, down, left), Start pauses. On a touch screen the
effects are buttons over SCAN, there only while something is in reach of them.

On a phone or tablet: hold the left or right side of the screen to steer (a mark at that
edge shows which way), and hold SCAN while something is in your sights; it lights up when
there is, and fills as it records. BOOST is a switch: touch it to burn, again to ease off. Inside, drag on the left to walk (a ring follows your
thumb) and on the right to look. Buttons appear only for what you can do right then, named
for what they do: CABIN or OUTSIDE, CAMERA, STAND UP, and, when you walk up to something,
MAKE COFFEE, OPEN THE CODEX, TAKE THE CONTROLS or LISTEN (NEXT while a seeker talks); the
alerts have GO OUTSIDE. A tap skips the coffee scene,
and a tap on a seeker's words brings its next line. There are no key hints on a touch
screen; the hints follow whichever you used last, touch or keys. The first tap asks for
the full screen where the browser allows it (the pause menu turns it off), and the
interface is sized for fingers, the same whichever way the phone is held.

The game teaches itself, one thing at a time: a line above the keys says what to press
next until it has been done once (remembered in the browser), and inside, marks hang over
the coffee machine, the Codex computer and a seeker aboard until each has been used (over
the coffee machine again whenever you are tired). The keys that work right now show along
the bottom for a while after each change of place (always, on foot), and again whenever
a key that does nothing there is pressed. The Codex lives on the cabin's computer: walk
to it and press E.

## How it plays

- **The forest.** Spruce and fir over rolling hills, black lakes and frosted ridges, the
  same for everyone. Now and then (about one part in twenty of it) a **turned stand**:
  birches gone gold, amber and rust among the dark spruce, in any weather with banks of
  mist drifting between the trunks under the crowns, the ground russet with fallen leaves
  and the fog a little warmer; a few hundred meters to a kilometer across, its edges
  turning over a couple of hundred. Rarer still (about a third as often) and larger (one
  to three kilometers with its foothills), **mountains**: ridged peaks up to some 320
  meters over the forest, rising out of the fog, the trees thinning up their flanks to a
  treeline, bare rock on every steep face and snow above a ragged line. The ship climbs
  them steadily (it starts early enough to pass just over the top) and drifts down the
  far side. Now and then a **river** (a quarter of an hour or so of straight flight
  apart): from a spring in the hills, two to four kilometers down to a lake of its own
  at its mouth, meandering; through high ground it runs in a **canyon** as deep as the
  hills are high, its head a wall where the cut begins, its walls stepped in ledges of
  layered rock, trees only on the ledges. As one comes
  into view the HUD says so; turn along it, and the ship follows it: down into its cut,
  low over the water, along its bends by itself, no faster than they allow (on, too,
  while you are inside the ship), until you steer firmly away, turn off it, or it ends in
  its lake. Ground and trees newly built come out of the fog in the dither, over a
  couple of seconds, rather than all at once.
- **Flight.** The ship flies on at 24 m/s, its height following the canopy ahead. You
  steer, and you can **boost**: the core at the tail burns plasma, flares, and sheds a
  pale blue-violet trail, and the ship climbs to about 58 m/s while the view widens. The
  **PLASMA** meter, over the alertness, runs out after five seconds of burning at first
  (up to fifteen, with a larger tank from the SHOP) and gathers back over about twenty
  seconds (a larger tank fills faster too, so it takes the same twenty); spent, the boost
  waits until some has gathered again. However fast it flies, it looks as many
  seconds ahead, foresees the curve of a turn, starts a climb sooner at speed, and never
  goes into the ground; the camera keeps over the trees and never has a ridge between it
  and the ship.
- **The Obelisk.** Every ship's first flight takes off from the roof of the Obelisk, a
  slab of dark stone some nine hundred meters tall standing out of the forest (its
  trees reach a thirty-fifth of it), split down one side by a narrow slit, after the
  cover of qntm's *There Is No Antimemetics Division*. Its roof has the pad (rings of
  light) and red lights on its corners; it stands out of the fog over the horizon from
  tens of kilometers. The ship rises along it coming in and comes down off it going out.
  It is home, and the reason to come back:
  - **the uplink**: scans are transmitted for DATA (and a holder's finds told to the
    relays) only within 12 km of it. Farther off, TRANSMIT at the top of the Codex says
    how far (UPLINK · 20 km) and takes you to the OBELISK page. So the first to bring a
    find home is its first finder;
  - **commissions**: three a day, the same for every pilot (the day by UTC): an artifact
    of a tier or rarer from a kind of place (a RARE on a river, an EPIC on a mountain,
    anything in a turned stand...), or the things about a clearing. A scan recorded that
    day that answers one is claimed at the Obelisk for its bonus (60 to 4,800 DATA), once.
  The strip along the top marks it far off (a small dark slab, outlined), the MAP shows
  it, and the OBELISK page sets a course home (or teleports, with a jump). Pilots who
  have flown before go on from where they were.
- **Sites.** Every wild artifact stands at a **site**: a place that is a pure function of
  the world's seed and its coordinates, the same for every ship, today or in a year.
  Nothing appears for anyone and nothing dissolves behind you: fly past one, stay inside
  over coffee, come back tomorrow, and it is where it was. The forest at large is a grid
  of cells 2.2 km on a side, about one in seven holding one site, set where the cell is
  most itself (on a summit if it has mountains, in a turned stand, out on a lake, else on
  plain ground); some rivers have one more down their course, and a few one on the lake
  they end in. About four sites in a hundred square kilometers: few enough that each is
  worth the flight, and no hurry.
- **Teleporting.** A TELEPORTER KIT from the SHOP (1,000 DATA, three jumps) puts
  TELEPORT beside every place you can set a course to (the LOG, the MAP, the BOARD's
  posts and FINDS). Pressed twice (the second time to be sure), it takes you out to the
  ship's view: rings of light close about the ship and spin up, the view stretches, a
  white flash, and the ship is somewhere else, about 400 m short of the place and
  facing it, so what stands there is just ahead in the fog. Not from the ground.
- **Signals.** The ship's receiver hears the sites you have not recorded (and the ones
  that now hold more than you recorded) out to 2.5 km (to 5, with SIGNAL GAIN from the
  SHOP): each is a mark on the strip along the top of the view, at its bearing, in its
  tier's color, the one it leads with large and named (its tier and distance); every
  other has its distance under it, the nearer ones larger. One behind you, or off to a
  side past the strip's end, is an arrow at that end pointing round. An artifact within
  what the fog lets you see has a yellow ring about its mark. The course is a hollow
  square. With nothing in range the nearest one within
  nine kilometers is still heard, faintly, so there is always a way to fly. Where to go
  is yours to choose. Within about a kilometer a site's artifact is built where it
  stands, coming out of the ordered dither; left far behind, it is put away, and is
  there when you come back. A site recorded stands on as it was. In the LOG every site's
  record carries its **place** (a short code of its coordinates, like `N5G-E3K`), to
  tell another pilot.
- **Two reaches.** Rarely (each about a third as common as the mountains, and three
  times the size of a turned stand, a few kilometers across), the forest gives way:
  - **the Grey Waste**: a pale grey desert of long dunes, glazed pans, nothing growing
    but a dead snag here and there;
  - **the Great Lake**: water to the horizon under the fog, wooded islands in it.
  Each has its own artifacts, every tier of them. (The sites stood where they stand
  before the reaches came, and stand there still; one that a reach now lies over holds
  that reach's own.) The HUD says when you come into one.
- **A course.** Choose a place (on the Codex's MAP, a record in the LOG, a place named on
  the BOARD, or a code typed in) and SET COURSE: the ship turns toward it whenever nobody
  steers and flies there by itself, so you can set one and go make coffee. The strip along
  the top marks it as a hollow square (COURSE · 3.4 km). Setting one says so at once: the
  button turns to COURSE SET, and a line along the bottom of the Codex says where and how far. Steering takes the controls back
  while you steer; steering firmly for a moment lets the course go. Arrived with nobody at
  the controls, the ship circles the place (HOLDING) until you come to the controls, then
  turns in toward it and hands them over.
- **What stands there.** Mostly an artifact, of one of eighty-two families, by the place:
  - in the forest at large, forty-six: standing stones, monoliths, ringed orbs,
    cellular-automaton arrays, shells, crystal blooms, tethers, luminous groves, gates to
    fly through, nested polyhedra, geoglyphs, harmonic chimes, lighthouses whose beams
    turn through the fog, orreries that keep Kepler's law, helices whose lit rungs spell a
    number, the shadows of four-dimensional solids, derelict hulls, stairs to a door that
    opens on fog, pale elder trees, level pools under a hanging stone, cloaked sentinels
    whose eyes follow the ship, swarms on a torus knot, cradles of bone round a cracked
    egg, lanterns hung on nothing, listening dishes, a pendulum drawing a flower of light,
    an hourglass of light that turns itself over, a mobile of balanced arms, a lens
    burning a point into the ground; instruments of signal and measure: a sundial whose
    shadow is a blade of light, tuning forks in the harmonic series, a field of mirrors
    burning the tip of a tower, a grove of aerials passing lights along their wires, a
    seismograph writing a helix of light, weathervanes that turn to the ship, a carillon,
    an abacus counting without end; and places somebody built and left: a labyrinth with a
    light walking its one path, a well lights rise out of, an archive of scored tablets
    read row by row, an amphitheatre of seated lights, a broken aqueduct pouring light, a
    garden of raked stone, bell jars each keeping a small flame, a tensegrity mast;
  - on a mountain, set on the summit, thirteen: cairns marching up the slope, wind lines
    of banners, an old relay mast, a door cut into the rock, a stone arch hung with
    threads of light, an observatory following a star, a wind harp, a frozen fall of ice,
    a wall of prayer wheels, a bivouac with one lit window, a horn pointing out over the
    valley, an eyrie with eggs of light, a derelict cable car swinging over the drop;
  - in a turned stand, among the gold birches, ten: a column of leaves held turning in
    the air, a bare birch hung with lanterns, a drop of amber with something dark in it,
    a ring of white birches, a cold fire, a leaf of gold as tall as the trees, sheaves
    stood in stooks, a swing swinging by itself, a ring of amber mushrooms, a tree hung
    with chrysalides of amber glass;
  - on a river or in a canyon (follow one to find them), worth two and a half times as
    much, eight: water falling from a shelf of rock, a bridge of stone high enough to fly
    under (threaded, worth half as much again), a wheel of stone turning in the current,
    a ferry with nobody aboard, a colonnade standing in the water, a gauge reading the
    river's level in lights, a flotilla of lantern boats drifting down without end, a
    fish ladder lights leap up;
  - out on a lake, five of the lakes' own (buoys passing a light from one to the next, a
    hut on stilts with one lit window, a ring of giant reeds, the crown of a sunken bell
    with rings going out from it, glass floats in a net), or one of the few that hang in
    the air and need no ground.
  These are the COMMON and UNCOMMON (below); about one in seven is **grand**: larger,
  with a column of its own light over it.
  Now and then a site holds something else: life (below), a creature that flees, or a
  **CLEARING** to land in.
- **Clearings.** As common as an UNCOMMON artifact: lanterns in a ring in the forest,
  named on the strip in lantern orange (CLEARING). Hold the scanner on it and the ship comes down;
  walk out, and fourteen to twenty things stand about it, found only on foot, the same
  for everyone who lands (their places about the clearing differ from one landing to
  the next). All of them together are worth twice an UNCOMMON artifact's scan at your
  attunement, shared out among them. Every one is recorded, told and found as the
  clearing (its place is the clearing's), so the first pilot to a clearing shares in
  everyone who comes after, and FINDS and the MAP show it as a CLEARING. It stays on the
  strip until everything about it is recorded. Out in the Grey Waste a clearing is on
  the sand, its things the Waste's own; on the Great Lake, on an island, its things the
  island's own.
- **Rarity.** Every artifact site has a **tier**, the same for every ship, and each tier
  has its own art at the surface and its own true forms below:
  - **COMMON** (about two in three): the forest's first families;
  - **UNCOMMON** (about one in four): the instruments, the places somebody left, the
    lakes' and the newer mountains', stands' and rivers' own;
  - **RARE** (one in thirteen): the grandest of both, always grand (orreries, hypersolids,
    lighthouses, elder trees, burning lenses, derelicts, carillons, labyrinths,
    amphitheatres, tensegrity masts, bell jars, heliostats; on the mountains the
    observatory, the frozen fall, the cable car, the eyrie; the cold fire, the
    chrysalides, the fairy ring; the drowned colonnade, the stone bridge, the lantern
    boats; the sunken bell); and at heart the newest forms (a clock with no face, a
    fountain of light, a radiolarian, a ringing plate, a ringed planet, a moth, a
    dandelion, a storm of pages);
  - **EPIC** (one in fifty): families of their own, and the **traces** (next to nothing at
    the surface, a great deal under it); at heart a Hopf fibration of linked rings of
    light, a glass Klein vessel, a drum writing a cellular automaton;
  - **LEGENDARY** (one in four hundred): monuments of their own, gold; at heart a tree of
    light, a maelstrom, a band with one side, a Menger sponge, a sky whale, a great
    seed-head ripening along its spirals, a loom weaving cloths of light;
  - **MYTHIC** (one in four thousand: among a hundred pilots, perhaps one ever finds
    one): landmarks two hundred meters tall (a tower of strands drawn up and twisted to a
    waist of fire, a forest of glass needles ringing in waves under an aurora, a seed
    hanging in the sky that opens into a lattice of light); at heart the shadow of a
    four-dimensional solid passing through itself, a barrel of irises opening on a sun,
    a dome of pendulums falling into waves and back into line.
  The rarer, the more layers it holds, the more its scan is worth (RARE five times as
  much, EPIC fifteen, LEGENDARY sixty, MYTHIC four hundred), the farther off it is heard
  (MYTHIC four times as far), and the higher a pillar of its tier's light stands over the
  forest (RARE and up, seen from as far as it is heard), so a pilot told where one is
  can find it by eye. The strip along the top names the tier of what it hears, in its
  color, and a rare one heard leads it.
- **Finders.** A holder who has linked a wallet tells the relays, by transmitting, which
  sites they found, and every reader puts each site's finders in the same order. The
  first to find a site gets a tenth of its whole worth every time another pilot finds
  it after; the second, a twentieth; the third, a fortieth; and so on down eight
  finders. Nobody pays it: it is new DATA, credited as the later finds come in (FINDER'S
  SHARE). And when anyone finds an EPIC, LEGENDARY or MYTHIC, every ship flying in the
  next hours is told where (MYTHIC FOUND · 38 km), with SET COURSE.
- **Attunement and resonance.** What stands at a site is the same for everyone; what
  differs is how far into it you see. Under its surface an artifact holds **layers**, as
  many as its **resonance**: about one in six has none, most have one to three, and each
  one more is rarer than the last, without end. Your **attunement** (bought in the
  Codex's SHOP, without end) is how many of them you see:
  - **I**: its echo: its own shape again in light, larger, standing about it, a ring of
    that light on the ground;
  - **II**: its true form, what it is at heart: one of the deep's forty-three forms, the
    one its family is kin to (a shell's is a nautilus, standing stones' an armillary or a
    choir of monoliths, a wreck's an archipelago of floating islands), hanging in the air
    over it, a thread of light between them;
  - **III and further**: what gathers about that, one thing more with every layer: rings
    of light, a figure drawn on the ground, orbiting bodies, a pillar, sweeping beams,
    hanging shards, rain of light, an aurora veil, a second form crowning it, a court of
    small ones about it, its double hanging upside down in the sky, a ring in the sky,
    its own echoes; and everything of it larger and richer with every layer.
  All of it is drawn in the colors of the **stratum** you see to (I Gilt, II Nacre, III
  Ember, IV Aurora, V Ultraviolet, VI Solar, VII Abyssal, VIII Prism, then others without
  end), and it sings in that stratum's harmonics (below). So the same artifact, at the
  same coordinates, is a ring of stones to one pilot and a burning armillary turning
  over it to another; and every level you attune changes most of the places you have
  already been: a site that now holds more than you recorded is heard again (MORE TO
  SEE), and scanning it again is worth the difference. Where more lies in one than you
  see, small lights flicker over it, one for each layer still hidden (six at most), each
  in the color of the stratum it waits in; the brackets say how far you see into it and
  how far it goes (III/VI). A trace's true form does not hang over it: it stands on the
  ground beside the little there is, larger than any. The forms: corollas that open as the ship
  nears, spines of turning crowns, nested solids, armillaries, choirs of monoliths,
  geodes, corals, knots and linked rings, nautilus shells, floating archipelagos with
  falls of light, strange attractors traced by thousands of motes, medusae, star engines,
  eyes that follow the ship, chandeliers, stairs winding about a column of light, prisms;
  a clock with no face, its wheels meshed in the air; a fountain of light falling from
  basin to basin; a radiolarian's lattice; a plate whose grains of light gather on the
  figures it rings in; a ringed planet; a dandelion letting its seeds go; a storm of
  pages; the mountains' crystal spires, sky temples, stone halos, aurora looms, storm
  crowns, wind serpents and ice cathedrals; the turned stands' tree of leaves of light,
  pyre, seed, leaf-fall and great moth; the rivers' lotus and tide-gate.
  Witnessed seekers are never touched by any of it.
- **Effects.** Bought in the SHOP three uses at a time (and bought again), fired at
  whatever the scanner holds, in flight or on foot: **GLITCH** tears it
  into bands of broken signal, **CHAOS** sets it running like water, **VOXEL** sets it in
  blocks the way the seekers themselves are drawn, **SHATTER** breaks it into its faces,
  hanging in the air. Any number on one artifact, in any order, on anything wild, however
  far into it you see (never a witnessed seeker); the scan records it as it is then, and is worth half
  as much again for every effect it took.
- **Anomalies.** The world itself changed for four minutes, from the SHOP: every
  artifact not yet recorded wears the anomaly's mark while it lasts, and every scan made in one is worth half as much again. **INVERSION** rolls the ship over into a stranger world (a pale
  forest hanging overhead, drawn out and twisting, the ground a negative of itself
  ringed with lines of light, an abyss of violet below), and what stands unrecorded is its own
  negative; **SLOW TIME** slows everything but the ship, and it is a burst
  stopped in time; **LONG NIGHT** holds midnight with the aurora at its full, and it
  burns with its own light; **DISCHARGE** sends lightning walking through the
  forest and fills the core faster, and it crackles with charge. Any of them at
  once: then it wears every mark, and the mark of where they meet besides (waves
  rolling through it, bands, rings or a spiral of their colors, the same for the same
  combination and its own for each), and the music changes with each of them together
  (an inversion turns the chord upside down and makes its notes swell in backward, slow
  time lowers and draws it out, the long night darkens it and hangs bells of the aurora
  over it, a discharge makes it tremble and crackle; two or more turn the chord to
  another mode). Landed, they go on: the things found on foot wear them all the same,
  and the world stays as strange (only the ship rights itself). LONG NIGHT and
  DISCHARGE answer only to a pilot whose
  wallet holds a seeker of the right kind: one with the Nightfall background, one that
  has discharged (read from Robinhood Chain, nothing written).
- **Life in the forest.** Some sites hold something living, and it keeps to its place: a
  flock turning over the canopy that lifts and streams away when the ship comes near
  (slower than the ship: it can be followed and held in the sights), a herd grazing at a
  lake's shore that bolts for the trees, an owl on a dead spruce turning its head to
  keep the ship in sight (met by night only), a shoal leaping on a lake. Each can be
  scanned (for half of what an artifact is worth), and takes effects and marks like
  anything else; some have layers too, and to a pilot attuned they are their kin of the
  strata: birds of glass, stags with antlers of light, owls with lantern eyes, fish of
  light. A creature that flees keeps to its site until it is recorded, and is gone for
  that pilot after.
- **Witnessed seekers.** When a SEEKER NET seeker moves on Robinhood Chain while you
  fly, that seeker itself rises out of the fog, giant: its voxel model built from its own
  collection art as it is on the chain now (dormant ones dark by their stage, their
  battery for an eye; activated ones bright; 30 to 60 meters tall, larger for more charge
  released), hovering over a figure drawn in light on the forest floor, turning to watch
  the ship, under a gold column of light and a crown. It is seeded by the move's
  transaction (one of a sweep's, by the transaction and its token), the same for every
  ship flying at that moment, and its marks are gold, its number on the brackets. When
  several seekers move together
  (a sweep, one transaction or many at once), each rises, all at once, spread across a
  broad front ahead: more than one ship can scan before it has flown past, so you choose.
  (Twelve at a time; a larger sweep comes in waves.) Moves made while you were away are
  not replayed. Inside the ship, at the Codex or over coffee, an alert says so over
  everything, with the way out (GO OUTSIDE, or V; NOT NOW waves it off until the next
  move), and they rise farther off to give you time.
- **The cabin's call.** Nothing wild calls you out of the cabin: it will be there. A
  site heard for the first time is a low swell from its side; one come into sight says
  what it is (RESONANCE III · EMBER, and whether it goes deeper than you are attuned).
  Only witnessed seekers call: anywhere aboard, a golden rising call, twice, over a low
  swell.
- **Their voices.** Every artifact has a voice of its own, from its seed and family
  (src/core/voices.js), and unlike the music: where the score holds long notes, an
  artifact pulses in time with its own light. A soft bed (breath through drifting
  resonances, slowly beating glass, an inharmonic warble, a voice that glides between
  notes) throbs open on each step of its rhythm and sinks between, and over it come soft
  ticks, short chirping sweeps like a signal reporting home, or now and then a burst of
  tiny stuttering blips, like data coming apart; under a witnessed one, a slow chord.
  Quiet, in the game's tuning; heard from the ship (the nearest four at a time, under
  the EFFECTS volume, nearly dry, so it sits where it is): nearer is louder and
  brighter, farther is darker and a little wetter, panned by where it lies from the
  nose, quieter behind. You hear one before you see it. One whose layers you see sings
  instead, on a chord of the root's harmonics: the palette's own, and one more for every
  layer seen (a pure third, then the eleventh, the thirteenth, the seventeenth...),
  so the further in, the stranger its intervals; in layers that open with it, more of
  them the further (struck bells, a slow chord, high twinkling, a figure on its steps, a resonator
  struck by noise, overtone song, a second rhythm against the first, swells that stop, a
  voice moving from vowel to vowel, a drifting cluster, falling cascades). It arrives
  with a call of its own, its chord struck upward like bells. Every artifact's voice
  passes a guard that leaves it untouched at its own levels and holds anything past
  them under a ceiling.
- **Scanning.** Bring it into the brackets and hold SPACE (SCAN on a touch screen, A on
  a gamepad) for a couple of seconds; it works through the windshield at the controls
  too. Once a scan is under way it holds on as you fly close past (and wider still right
  beside one), and if it slips for a moment the progress drains slowly rather than
  vanishing. With several out there, the scanner takes the one most nearly ahead, and the
  bearing strip along the top marks every one. The visor photographs it (288 x 162,
  through the same fog), names it, and writes the Codex's notes.
- **Alertness.** It runs down over about ten minutes. Tired, the edges close in, blinks
  grow long, and at the end come short sleeps in which the ship wanders and nothing can
  be scanned. Coffee fills it again.
- **A seeker aboard.** Connect a wallet at the Codex computer (SEEKERS: CONNECT shares
  your address and signs nothing) and bring one of your SEEKER NET seekers aboard. It
  hovers by the computer, built in voxels from its own art (after Soundings), dark and lit
  by stage while dormant, bright and blinking once activated, and turns to watch you.
  Walk up and press E and it talks: every one of SEEKER NET's 119 visual traits has two
  lines of its own (src/companion/dialogue.js), so each seeker's voice is the sum of its
  parts, dealt in a new order every time, with now and then a word about its charge, the
  hour or you. It stays aboard while the address that brought it still holds it.
- **The coffee.** At the machine, E: a short scene from outside yourself. The Seeker
  presses the button, the water warms and gurgles through, it lifts the carafe by the
  handle and pours, sets it back hissing on the plate, and takes the cup in both hands
  to the window. Every sound in it is synthesized foley (src/core/foley.js): the click,
  the heating, the drips, the pour, the sip, the breath after.
- **The sky.** The planet keeps Robinhood Chain's time: a day is 14,400 blocks (about
  24 minutes), three quarters of it sun, with long golden hours. Everyone flying at the
  same moment shares the hour and the weather. Light falls in shafts through the crowns
  and the gaps in the overcast; at night the aurora pulses with every move on the
  network.

## The music

Generative and endless, synthesized in the page. Its tuning keeps The Seeker's rule
(every pitch is the fundamental times X / 2^N, just intonation) on a fundamental of 42 Hz:
the music lives on 21/16 of it, an A at 55.125 Hz, in the palette 1, 9/8, 19/16, 3/2, 7/4.
A deep drone on the root; over it five voices that each change on their own clock, swell
in over seconds and fade over more, some dissolving into breath at their pitch, some heard
only as the hall's wash; now and then a far, soft tone; and every few minutes a rest. All
of it through a wide chorus into a moving plate reverb (its tail swept like a chorus, its
reflections turning). The hour, the fog, drowsiness, the cabin's walls and nearby
artifacts steer it. The effects carve it, as SeekerAudio's kick carves its layers: the
music is multiplied by one minus an effect's own level, sample by sample (a ring-mod cut
that leaves it through where the effect's wave crosses zero, so nothing pumps), and dips
a little under the effect's envelope, so a scan, a seeker's murmur or an alert is never
lost under a swell. **M** keeps what is playing (it comes back); **R** saves the last
minute as a WAV file.

## The Codex computer

Five tabs: LOG, MAP, BOARD, OBELISK, SHOP. Along the top, always: your **DATA**,
**TRANSMIT** while there are scans not yet sent (for DATA; they stay in the LOG; only
within reach of the Obelisk's uplink, else how far it is), and the pilot (your name or
address once linked, else LINK WALLET), which opens your seekers.

- **OBELISK**: home. Whether its uplink is in reach (and how far it is), TRANSMIT, SET
  COURSE HOME (and TELEPORT, with a jump); and today's three commissions, each with what
  it asks, its bonus, and CLAIM once a scan of yours from today answers it (at the
  Obelisk). A mark on the tab says one is ready to claim.

- **LOG**: every artifact you recorded: its photograph, its name, its tier and how far
  into it you saw, what it is and where it stands (its place code and how far), where
  you stand among its finders (FIRST TO FIND IT · 3 came after you), what it is worth;
  SET COURSE back to it, SHARE it to the board. The Codex's notes and the particulars
  (seed, resonance, effects, for a witnessed one its block and transaction, linked to
  the explorer) are folded away under NOTES.
- **MAP**: the forest about the ship, north up (3, 8 or 20 km to its edge; Z), drawn from
  the terrain itself: lakes, rivers, mountains and their snow, the turned stands. On it,
  only what you know of: what you recorded (in the color you saw it to, ringed where
  there is more to see now), the signals the receiver hears (its reach is the dashed
  ring), and what other pilots found or named on the BOARD, in their tiers' colors. The
  rest stays to be found.
  Choose one, or anywhere, and SET COURSE; or type a place code and FLY THERE.
- **BOARD**, three pages: CHAT, FINDS and LEADERS.
  **FINDS**: everything found and shared, one row a thing: every scan shared on the board
  (with its photograph) and every find told to the relays, gathered by what they are of
  (a site's artifact; a clearing's things all under the clearing; a witnessed seeker),
  newest first (ALL, RARE AND UP, CLEARINGS, WITNESSED). Each row: the photograph of the
  first who shared one, its tier, what a scan of it would bring you (exactly: every site
  can be worked out from where it is, and you would see as far into it as you are
  attuned; RECORDED, or + MORE, if you have been), who found it first, how many pilots
  and photographs, its place, how far, SET COURSE; open it for everyone's photographs of
  it in a row to scroll, each with who and when and their words; and what your own finds have
  brought you as finder's shares.
  **CHAT**: words only (shared scans are on FINDS): the seekers' board, on six free public Nostr relays (relay.damus.io, nos.lol,
  relay.primal.net, offchain.pub, nostr.mom, relay.nostr.net; no account). Anyone can read
  it, in the game or in any Nostr client (kind 1 notes tagged `#lowpasscodex`). Holders
  post scans and words (text only, no links), take a **name** (shown instead of their
  address on all their posts, old ones too, for everyone; same names are told apart by a
  small colored mark), and **delete** their own posts (gone for every player, and from
  the relays that honor deletions). One post every 20 seconds (the button counts down).
  It reads like a conversation, newest at the bottom. A
  scan's photograph shows as a thumbnail beside its words; a click or touch anywhere on
  the message opens it where it is, and again closes it. A shared scan of a site carries
  its place, with FLY THERE, and its tier and what it would bring you (likewise on the
  MAP, and in the news of a rare find); any place code written in a post becomes a button that sets
  a course there, and + WHERE I AM writes your own into what you are about to send.
- **SEEKERS** (the pilot, at the top right): your name on the board, and the seekers an address holds (connect or link your wallet, or type any
  address to view), and, for your own, BRING ABOARD / SEND BACK: live charge, stage,
  status, Discharge, Uplink, shares received since the last move, when it last moved, the
  date it should activate at +50 a day and with the last day's shares, its traits, and the
  network's totals.
  A seeker of an address only viewed offers CONNECT TO BRING ABOARD right on its page. A
  phone's own browser has no wallet in it: there, connecting offers OPEN IN METAMASK,
  which opens Low Pass in MetaMask's own browser, where it connects. Held upright, the
  page scrolls as one, and touching a seeker goes to its page.
- **LEADERS** (on the BOARD): the leaderboard. Holders submit their own scans (one button, after the
  same one-time wallet link as the board); holders are ranked by witnessed scans, then
  by the rest, then by name, and a holder with none does not appear. Names follow the
  board's. Each holder's scans open in a gallery (a click on their row, or ENTER).
- **SHOP**: what DATA buys. (TRANSMIT, at the top, sends every scan not yet sent for DATA;
  they stay in the LOG and on the leaderboard; each counts once: a wild scan is worth
  10, and 10 more for every layer of it that was seen, times its tier's worth; a
  site scanned again further in brings only the difference; a
  witnessed one 40; an effect or an anomaly makes a scan worth half as much again, each.
  Four shelves, UPGRADES, EFFECTS, ANOMALIES and SHIPS (left and right). Three upgrades:
  - **ATTUNEMENT**, without end: the first level costs 120 (twelve plain scans), each
    next one twice the last. Every level shows you one layer more of every artifact
    that has it, and makes those scans worth more.
  - **PLASMA TANK**, five levels (40, 80, 130, 200, 300): seconds of a full boost, from
    5 to 15 (7, 9, 11, 13 between), and the core gathers it back faster with each level
    (from a quarter of a second's burn every second to about two thirds), so an empty
    tank of any size is full again in about twenty seconds; the PLASMA meter is as long
    as the tank is large.
  - **SIGNAL GAIN**, five levels (80, 150, 250, 380, 550): how far off the ship hears a
    site, from 2.5 km to 5 (2.9, 3.3, 3.8, 4.4 between).
  The effects: three uses of GLITCH for 9 DATA, CHAOS 15, VOXEL 21, SHATTER 30, times
  one more than your attunement (bought again when they run out). The
  anomalies:
  60 DATA for every level of attunement and one more, each time one is started;
  a keyed one says which seeker opens it, and CONNECT TO CHECK asks the wallet for its
  address only.
  And the hangar: five ships, each with its portrait, its pips (speed, turn, plasma,
  scan, room) and what is inside it. BUY takes you aboard at once; a ship bought is
  boarded again with BOARD, whenever you like, from the Codex computer (it is the same
  place in every ship):
  - **SEED** (yours from the start): the survey craft, even in everything.
  - **HERON** (400): long and pale, fast on the straight, slow to turn; a gallery with a
    bench under the windows, a map table and two books.
  - **MOTH** (800): round, with banded wings; turns on a leaf, a deeper tank, a quick
    scanner; a reading nook with shelves of books, an armchair and a lamp.
  - **KESTREL** (1,500): low, black and sharp, the fastest, with the smallest tank.
  - **ARK** (3,000): a house that flies; slow, the deepest tank and the quickest
    scanner; a lounge, a library of every book and a garden under lamps, lanterns under
    its belly and a dome on its back.
  The books are read at their shelves (E): a field guide, a scholar on the strata, a
  pilot's log, small poems, an essay on coffee, the tales pilots tell. Each keeps its
  page. Up and down choose, ENTER selects. Saved in this browser.

Linking a wallet from LOG, BOARD or LEADERS brings you back where you were. A quiet mark
on a tab says there is something new there: words on the board, or (SHOP) something you
can buy. TAB changes page, the arrows choose, ESC closes (in a gallery, goes back).

### The leaderboard: how scans are checked

A submission is the browser's ledger: every scan in its Codex, listed without the
photographs, signed with the board's key and carrying the same wallet proof as a post
(Nostr kind 30078, app data, replaceable, so the newest ledger from a key stands; long
ledgers go in pages). The photographs follow, one small event each, and are fetched only
when someone opens that holder's gallery. Every reader counts a ledger only if its
signatures and proof are right and the address holds a seeker now; a witnessed scan only
if that seeker moved in that transaction in that block (read from Robinhood Chain) and it
was scanned within a few hours of the move; the rest only no closer than 40 seconds
apart (no artifact comes sooner); and each artifact once per address. A determined holder
could still fake wild scans, as with any game's leaderboard; witnessed ones are tied to
the chain.

### Posting: how holders are checked, with no server

Free relays accept anything from anyone, so every reader checks every post in the page:

1. Its Nostr id and BIP-340 signature.
2. A wallet signature (EIP-191 `personal_sign`) on a plain message that links the post's
   Nostr key to an Ethereum address, recovered with keccak-256 and secp256k1.
3. That the address holds at least one SEEKER NET seeker now (`balanceOf` on Robinhood
   Chain, read only).
4. Text only: links are refused when writing and blanked out when reading.

Names and deletions carry the same proof. A name is a Nostr profile event (kind 0, with
the proof and an `lp-name` tag): readers show the newest name for each address on every
post from it, and never the address of a holder who has a name (it stays in the proof,
which readers need, but out of sight). A deletion is a NIP-09 event (kind 5) and counts
only from the post's own key or address. Names are 2 to 20 letters, numbers and simple
punctuation, with no links, nothing invisible and nothing like an address.

Free relays promise nothing, so the board does not lean on any one: every note goes to
all six and is read from all six; each player's game keeps what it has read (IndexedDB),
so the board shows at once and survives an outage; and when a relay answers without a
note the game holds, the game passes that note on to it, unchanged and still signed by
its author (a few per session). A post is lost only if every relay and every player's
cache lose it.

A scan's note carries its origin in its `lp-scan` tag (transaction or seed, block, seekers,
name, code, family, and `wild` / `witnessed`): a wild one names no transaction, since no
one else will ever meet it.

Bringing a seeker aboard needs only your address: CONNECT asks the wallet for it
(`eth_requestAccounts`) and signs nothing; the game checks with `ownerOf`, read only, that
the address still holds it each time it starts. To post or to submit scans, the game asks
your browser wallet (MetaMask, Rabby, any EIP-6963 wallet) for that one signature, once.
Signing is free and is not a transaction: it sends nothing, approves nothing and cannot
move anything you own. The game never asks for a transaction, an approval, a permit or a
seed phrase. The posting key lives in this browser only. On a phone, whose browser has
no wallet, the game says so and offers to open it in MetaMask's own browser.

### Wallet safety

The game can ask a wallet for exactly two things, both in `src/net/wallet.js`, and only
when you press a button:

- `eth_requestAccounts` (CONNECT): the wallet shares your address. Nothing is signed.
- `personal_sign` (CONNECT AND SIGN, or SIGN ONCE once connected): one signature on a
  plain-language message that says what it is for, names your address and the board key,
  and says it is not a transaction. It cannot authorize a transfer, an approval or a
  permit, and the message is useless anywhere else: it only ties a posting key to your
  address for the board and the leaderboard.

The code contains no `eth_sendTransaction`, no typed-data signing (`eth_signTypedData`,
permits), no raw `eth_sign`, no `approve` or `setApprovalForAll`, and no network
switching; it never asks for a seed phrase or a private key, and reads the chain only
through public RPCs. Text and pictures from the relays are put in the page as text and
checked JPEG data, never as markup. The page carries a Content Security Policy: only its
own files may run (no third-party scripts, no inline code), and it may connect only to
the two Robinhood Chain RPCs and the six board relays. The two vendored libraries are
byte-identical to their releases (three.js r170 `build/three.module.min.js`,
@noble/secp256k1 2.1.0 `index.js`).

## SEEKER NET, read only

Everything comes from public RPCs (`https://rpc.mainnet.chain.robinhood.com`, then
`https://robinhood.drpc.org`): `eth_call`, `eth_getLogs`, block reads. Moves are polled
every 30 seconds; only moves made while the game is open are witnessed (they wait up to
an hour, across a reload, for their artifact). A witnessed seeker's look is read when it
rises (its charge and status); the leaderboard reads the block of each witnessed scan to
confirm it, and `balanceOf` for each holder. Offline, every artifact is wild, and the
sky's clock starts from the block in `assets/moves.json` until the chain answers. The
collectibles are art and membership, not investments; nothing here is financial advice.

## Host it

Upload the folder as it is to any static host (GitHub Pages, Netlify, Cloudflare Pages,
itch.io). Everything is relative, so it works from a subfolder. `tools/`, `DESIGN.md`
and this file are not needed at runtime.

## Development

- `?dev` adds `window.__lp`: `look('orb')` to orbit a fresh artifact of a family,
  `layer('ring', 3, 6)` one as a pilot attuned to III sees it, holding six layers
  (`sitesOff(false)` brings the sites back after), `att(4)` to attune, `sites()` what is
  heard and built, `goto(x, z)`,
  `deep(4, 'medusa')` a form of the deep standing alone,
  `fake('orb', 300, witness)` one ahead, `witness(token)` as if a seeker moved this
  moment, `sweep(7)` as if seven moved in one transaction, `clear()` to take them all
  away, `coffeeAt(seconds)` the coffee scene frozen at a moment, `freeze()`, `spawn(i)`
  one of the shipped moves, `time(0.15)` a sunrise, `run(seconds)` to step without the
  browser's frames, `mockWallet(testKeyHex)` a stand-in wallet with a throwaway key.
  `?stats` shows frame numbers (F3 toggles them). `?play` skips the title, `?t=0.3`
  starts at an hour of the day, `?x=&z=` at a place.
- `?offline` skips the chain: no witnessed seekers rise.
- `node tools/relay.mjs 7777` runs a tiny Nostr relay in memory; open the game with
  `?dev&relay=ws://localhost:7777` to try the board without writing to public relays
  (the `relay` option works only with `?dev`, and only for a relay on this machine).
- `index.html`'s Content Security Policy carries the hash of its import map: change
  one, change both. A new RPC or relay must be added to its `connect-src` too.
- `node tools/snapshot_moves.mjs 72` refreshes `assets/moves.json` (read only).
- After changing `style.css`, run `node tools/stamp.mjs` before publishing: it stamps the
  stylesheet with a hash of itself in `style.css`, `src/build.js` and `index.html`. A
  browser that brings back an old tab can hand over an old stylesheet with new code; the
  code checks the stamp and fetches the stylesheet that goes with it.

## Files

```
index.html, style.css     the page and the interface
src/main.js, src/game.js  start-up (and the stylesheet check, src/build.js), the modes,
                          the frame
src/render/               the pipeline (opaque, fog and sky, glows, grade and dither),
                          materials, the geometry builder
src/world/                terrain, the sites (where every artifact stands), trees, chunks
                          with a floating origin, the canopy map for light shafts, day,
                          night and fog, the anomalies
src/ground/               what happens off the ship
src/ship/                 the ships (their designs and hulls) and their flight, cameras,
                          the cabins and their books, the Seeker, the coffee scene, the
                          ships' portraits for the SHOP
src/artifacts/            from a seed or a move to an artifact: generation, models (the
                          first families, the witnessed seeker, the auras), the newer
                          families, their shared parts, the field, the photograph; the
                          mountains' own, the turned stands' own, the rivers' own, the
                          instruments; life in
                          the forest; a few more (the field flies them); the effects
                          (fx.js); the deep: its strata, its descriptions, its forms and
                          their kit, the layers of a site; more families (sets/); the
                          tiers (tiers.js: each tier's own families and forms) and the
                          pillars of light over the rare ones (beacons.js)
src/companion/            a seeker aboard: its voxel model (after Soundings, also the
                          witnessed giants'), its lines, its hovering and talking
src/chain/                Robinhood Chain reads, the move watcher, the block clock, the
                          seekers' art
src/net/                  BIP-340 Schnorr, Nostr, the wallet link, the board, the
                          leaderboard, the finds (who came first, finders' shares)
src/core/                 math, palette, input, storage, keccak, the score, the artifacts'
                          voices, the foley, progress (DATA, attunement, upgrades, ships)
src/ui/                   HUD, the Codex computer, menus, reading, touch
assets/                   fonts, SEEKER NET art atlas and metadata, shipped moves
vendor/                   three.js r170, noble-secp256k1
tools/                    local server, test relay, moves snapshot, the stylesheet stamp;
                          check/: headless checks (the world, site density, a set of
                          families, a file of forms) and how to write new artifacts
```

## Credits and licenses

Low Pass is set in the universe of [The Seeker](https://github.com/TheSeekerGame/the-seeker),
an open-source sci-fi brand. It is not an official release of The Seeker.

> Includes or adapts assets from The Seeker by The Seeker contributors, licensed CC BY
> 4.0: https://creativecommons.org/licenses/by/4.0/ . Original project:
> https://github.com/TheSeekerGame/the-seeker . Changes were made where applicable.

- From The Seeker: its pixel font and display font (as web fonts), the Tektur typeface
  (SIL OFL 1.1), the palette, and the tuning rule (every pitch a fundamental times
  X / 2^N), here on a 42 Hz fundamental.
- SEEKER NET art, layers and data from [TheSeekerGame/collections](https://github.com/TheSeekerGame/collections),
  MIT OR Apache-2.0 (the baked atlas in `assets/seekernet/`).
- Code adapted from Soundings (in this repository) and SeekerCraft (by the same
  contributors), MIT OR Apache-2.0: the geometry builder, the palette tools, the Seeker's
  model and poses, the seeker art module, the SEEKER NET seekers' voxel models and their
  floating objects and the voxel mesher (Soundings), chain reads and the wallet proof
  (SeekerCraft).
- [three.js](https://threejs.org) r170, MIT. [noble-secp256k1](https://github.com/paulmillr/noble-secp256k1), MIT.

License texts are in `licenses/`. Low Pass itself: code MIT OR Apache-2.0, project assets
CC BY 4.0, fonts SIL OFL 1.1, as the rest of community-games.

Everything else, the forest, the sky, the ship, the artifacts, the sound and the music,
is made in code here.
