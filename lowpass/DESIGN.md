# Low Pass: design

A slow survey flight over an endless fog forest on The Seeker's planet. 3D, single
player (but for the Codex board), in the browser, from a fully static website.

**Relationship to the canon: compatible extension.** It keeps the recognizable world
(the icy planet, Seekers, Theorem's Codex, the visor, SEEKER NET) and adds a place of its
own: the Fog Belt, a warm band where the heat under the ice lets a taiga grow and the
steam never lifts. It invents nothing about the main story.

**Departures from the codex's open-brand rules, on purpose, at the project's request.**
The codex asks works never to ask anyone to connect a wallet or sign, and to gate
nothing. Three things here go further: posting on the Codex board needs one wallet
signature (`personal_sign`, free, never a transaction) that ties a posting key to an
address holding a SEEKER NET seeker; the board admits only such holders; and holders can
connect a wallet (it shares its address, signs nothing) to bring one of their own seekers
aboard. The flight, the artifacts, the Codex, the music, reading the board and viewing any
address's seekers stay open to everyone, owning nothing.

## The feeling

Quiet, vast, a little eerie. Cold pale light, a dark ship like a seed with ribs grown over
it, a warm window, the core's pale light on the treetops it passes over; fog lying in
every valley, dark spires coming out of it, the sun through it in beams at the ends of the
day. Something glowing far ahead that was not there before.

## The loop

1. **Fly.** The ship flies on by itself at canopy height; you only steer. Nothing hurries
   you and nothing hurts you.
2. **A signal.** Artifacts stand in the forest at places of their own, the same for
   every ship; the ship hears the ones not yet recorded and marks their bearings. You
   choose one and fly to it, or not: it will wait. When a SEEKER NET seeker moves on
   chain while you fly, that seeker itself rises out of the fog, giant: witnessed, the
   same for every ship in the fog at that moment (and only these call you out).
3. **Scan.** Steer it into the brackets and hold. The visor photographs it into the Codex,
   names it, notes it.
4. **Stay awake.** Alertness runs down; the view closes in, blinks grow long, short sleeps
   come. Go inside and make coffee.
5. **Share.** At the Codex computer, holders put their scans on the board and on the
   leaderboard, and everyone sees what the others found.

## Artifacts: a world to find together, and the network's moments

Two kinds. **Wild** artifacts stand at **sites**: places that are a pure function of the
world's seed and their coordinates (src/world/sites.js), so the same thing stands at the
same place for every pilot, for good. This replaced an earlier rule, where a wild
artifact was grown from a seed the player's own browser drew and rose ahead of the ship
every minute or two, to be lost if it was not scanned. That rule made the forest feel
like a feed: things were handed to you, you had to take each one or lose it, and there
was nothing to tell anybody. Fixed sites turn all three around:

- **Discovery.** Nothing is spawned for anyone. What you find was there; what you pass
  stays; what is ahead is unknown until you go.
- **No hurry.** Nothing is lost by staying in the cabin, drinking coffee, reading, or
  talking on the board. The receiver keeps the bearings; the forest waits.
- **A shared world.** A place code (N5G-E3K) names a site for everyone. A pilot can say
  where the deepest thing they know of stands, and another can fly there and see it.

About four sites in a hundred square kilometers. (At first there were three times as
many, one every minute or two at cruise; the owner found they answered "way too often",
so that none felt special. Now the forest's grid gives about one in seven of its 2.2 km
cells a site, placed where the cell is most itself (a summit, a turned stand, a lake,
else plain ground), some rivers one more, a few lakes one.)

### Rarity: a reason to fly somewhere

With every artifact equally likely there was no reason to fly to any particular one, or
to follow another pilot's find. So every artifact site has a **tier** (src/artifacts/
tiers.js), drawn from its seed: COMMON (about two in three), UNCOMMON (one in four), RARE
(one in thirteen), EPIC (one in fifty), LEGENDARY (one in four hundred), MYTHIC (one in
four thousand: at four sites in a hundred square kilometers, a hundred pilots exploring
for a while will find perhaps one). Each tier is its own selection of art, at every
layer: its own families at the surface (the first families, the sets, the grandest of
both, then sets of their own for EPIC, LEGENDARY and MYTHIC, the MYTHIC ones landmarks two
hundred meters tall) and its own true forms below (the newest forms are RARE's alone;
EPIC, LEGENDARY and MYTHIC have their own; the old marked (+) forms became LEGENDARY's).
The rarer, the more:
- **it is worth**: a scan is multiplied by its tier (1, 2, 5, 15, 60, 400), on top of
  the layers seen;
- **it holds**: the least resonance rises with the tier (a MYTHIC holds five layers at
  least), so attuning further pays most at the rare ones;
- **it is heard and seen from afar**: heard farther (up to four times as far), and a
  pillar of its tier's light stands over it (RARE and up), seen through the fog from as
  far as it is heard, so a place code is enough to find it by eye;
- **it is told**: when anyone finds an EPIC or rarer, every ship flying in the next
  hours is told where, with SET COURSE.

### Finders: the early ones share in the later

Who comes first should matter, and telling others should pay. A linked holder's
transmitted sites go to the relays as finds (src/net/finds.js: one small signed event per
address and site, with the board's wallet proof), and every reader orders each site's
finders the same way. Each finder shares in everyone after them: the first gets a tenth
of the site's whole worth for each later finder, the second a twentieth, and so on, down
eight finders (a pyramid, as the owner put it). Nobody pays: it is new DATA, credited as
later finds come in. So the first to a MYTHIC does very well, and does better the more
people it brings there; the second does well too. The order rests on each finder's own
clock (a reader cannot know better); a find dated ahead of now is not counted, and only
holders count, which keeps it to people with something at stake.

### Attunement and resonance: one world, seen to different depths

The earlier progression ("depth": the scanner reached deeper, and deeper artifacts came
up for that player) cannot live in a shared world: if what stands at a place depends on
who looks, a place code means nothing. So the thing at a site is one thing, and
progression moved from the world into the pilot: **attunement** is how far into every
artifact you see.

Each artifact holds layers under what stands at the surface, as many as its
**resonance** (none for about one in six; else one, and each one more with two chances
in three, without end: so most have a few, and a deep one is rare and worth a journey).
A pilot attuned to n sees the first n: at I its echo (its own shape again in light,
larger, about it), at II its true form (one of the deep's forms, the one its family is
kin to, hanging over it), then one thing more with every layer (rings, figures, beams, a
crown, a court, its double in the sky...), all in the colors of the stratum seen to, and
larger and richer with each. The core never changes, so two pilots at the same place are
looking at the same artifact and can talk about it; what they see of it differs, and
that difference is the thing to talk about.

Why this shape:

- **Every level is felt everywhere at once.** Buying a level adds something to most of
  the artifacts already found (three in four have at least one layer). They are heard
  again (MORE TO SEE), and scanning one again brings the difference in DATA: old places
  become new, which a world of fixed places needs.
- **What is hidden is advertised.** Where more lies in an artifact than the pilot sees,
  small lights flicker over it, one for each layer still hidden, in the colors of the
  strata they wait in: an unattuned pilot's first artifact already says there is more.
- **Deep sites are destinations.** A resonance of VIII is one site in fifty; it is the
  same site for everyone, so its place code is worth passing on, and worth more to those
  attuned further.
- **The climb is the old climb.** A scan is worth 10 and 10 more for every layer seen;
  levels cost 120, 240, 480... The economy of the deep is unchanged; only what it buys
  reads differently.
- **Traces.** Some EPIC sites show next to nothing (one small stone, a ring of pebbles, a
  crack with light in it) and are deep: the least at the surface, the most below, and
  their true form stands on the ground beside them, larger than any. They reward the
  pilot who looks at a small thing twice.

### Two reaches, laid over the forest

The Grey Waste (a pale desert) and the Great Lake (water to the horizon) are rare and
wide (src/world/terrain.js: each about a third as common as the mountains, three times
the size of a turned stand), each with families of its own for every tier, so a pilot who
finds one has found a new set of things. They came after the sites: the owner asked that
no site move, only what it holds, so sites are still placed on the ground as it was
(heightBase), and a site a reach now lies over becomes that reach's own.

### Teleporting

A dear shortcut for the long flights rarity asks for: a kit of three jumps (1,000 DATA)
puts TELEPORT beside every place one can set a course to. It is a spectacle on purpose
(the ship gathered up in rings of light, the view stretched, a flash) and lands the ship
short of the place, facing it, so the arrival is still seeing the thing come out of the
fog rather than appearing on top of it.

### Telling one another where

A place code (`N5G-E3K`: north or south, east or west of the origin, in tens of meters,
in base 36) is short enough to say. Everything that names a place lets you go there: a
shared scan of a site carries its code with FLY THERE, a code written in any board post
is a button, the LOG sets a course back to anything recorded, and the MAP shows the
places others named beside what you know yourself (and nothing else: the map fills in as
you fly and as others talk). A **course** then flies the ship there by itself whenever
nobody steers, and circles the place on arrival until someone comes to the controls, so
"go and see what someone found" is a thing to set and then sit back from: the cozy loop is
set a course, make coffee, read the board, come out when the ship has arrived.

What still comes to the ship, on its own time, is the network: witnessed seekers.

**Witnessed** artifacts are the network's moments, and they are the seekers themselves.
When a seeker moves on chain while you are flying, it rises out of the fog, giant: its
voxel model built from its own art as it is on the chain now (dormant and dark by stage,
or activated and bright), hovering over a figure drawn in light, turning to watch the
ship, under a gold column and a crown. You see exactly which seeker moved. Its
transaction (and, in a sweep, its token) is the seed, so every player who was flying then
meets the same thing, and anyone can trace it to the chain from its Codex entry. When many
move at once, they all rise at once, across a broad front, more than one ship can scan
before it has flown past: a sweep fills the fog, and each player chooses. Moves made while
you were away are not replayed; a witnessed move waits an hour at most, across a reload.
Moves come a few dozen times a day, so a witnessed seeker is an event: its marks and its
Codex entry are gold, the forest answers with a slow chord, and aboard, an alert reaches
you wherever you are, with the way out.

The rest comes from the seed: counts from the primes and the Fibonacci numbers, a
cellular automaton's rule, a spiral's growth ratio, Kepler's law, the golden angle, a
set of polygons one inside another, a number spelled in binary. Mathematics to look at, not to read about.

Each has a voice: two or three quiet layers chosen by its family and seed (breath through
drifting resonances, beating glass, an inharmonic warble, a gliding voice, soft ticks on
its own light's rhythm, and a chord under a witnessed one), in the 42 Hz tuning, heard
from the ship by distance and bearing, darker and wetter far off, never loud.

### DATA: progression without a ceiling

Every scan can be transmitted once for DATA, and DATA attunes the pilot further (above).
Costs double (120, 240, 480...) while a scan's worth grows only by the layers seen (10
more a layer), so each level takes longer than the last, without a ceiling. Transmitting
never takes a scan away: the Codex is a collection, and the leaderboard counts it either
way. A site scanned again further in is paid only the difference.

Two smaller upgrades have an end. The plasma tank starts at five seconds of boost and
grows to fifteen, and fills faster with each level (a larger tank that refilled at the
old rate was no help once spent); the signal gain is how far the receiver hears a site (2.5 km to 5), so
a pilot with more gain has more bearings to choose from, and none is ever left without
one (with nothing in range, the nearest is heard faintly). Five levels each. Witnessed
seekers are the network's, and stay exactly as they are.

Creatures (a few sites hold one, until it is recorded) are the chase the forest
otherwise lacks: everything else stands still and
waits to be flown past. One flees, so the ship's handling finally matters, and the scan
becomes a skill (close in, line up, hold it there for several seconds while it swerves;
lose it and start again). Its speed is the world's own, but close by it paces the ship's
cruising speed, so the ship can neither run it down nor simply overtake it; a creature
faster than the ship must be kept up with on the boost. It always tires (spent, it is
slower than any ship, swerves hardly at all and flies on ahead), so every ship can scan
every one, but each species leans on one thing (speed, a tight turn, a hard boost, a
quick scanner), and which ships chase which best was settled by simulating the chase,
every ship against every species, with a player's hands a little late. The game says
nothing of creatures at all, not in the HUD, the shop or this game's README: one simply
flies off one day, and the rest is for players to find out (a rush of air when it bolts,
two falling notes when its scan is lost, are all the help there is).

Landing was the other secret: clearings were seen only once attuned to III. The owner
asked for them to be part of the shared world instead: a **CLEARING** is a site as common
as an UNCOMMON artifact (every old clearing site, and about half the artifacts out on
plain ground already flat enough to come down on, none of them moved), seen by
everyone, named on the strip, the MAP and FINDS in lantern orange. All its things
together are worth twice an UNCOMMON's scan (each a share), each is told as the clearing, and the first to land
there shares in the later ones, as for any find. A clearing in a reach has the reach's
own things (the Grey Waste's on the sand, the Great Lake's on an island). Lanterns in a
ring, a column of light. Held in the scanner, it is landed in: a short scene in still shots,
each ship coming in its own way (the Seed on a wide curve, the Heron on a long glide, the
Moth spiraling down, the Kestrel fast with a hard flare, the Ark slowly from high up),
its legs coming down, a breath of dust, its ramp folding down from the door on the right
(the same place in every ship, between the Codex computer and the cockpit), and the one
aboard walking out. Then first person on foot. The forest the ship flies over is too
dense to walk in, its spruces' boughs to the ground; so while the camera cuts away,
the forest about the clearing (320 meters) is rebuilt with fewer trees, their crowns
lifted up their trunks: a tall, clear wood in the fog, and rebuilt back as the ship
leaves. Between its trunks stand things found nowhere else: old instruments the forest
has grown over and things the scanner cannot account for, twenty kinds, the same things
in the same places for everyone who lands there (all from the site's seed), each with
layers of its own seen as far as the pilot is attuned, marked (+) now and then, none of
them moving off. They are
scanned by looking at them from close by. Aboard again (the ramp), the cabin is the
same, its controls say take off, and the ship lifts out of the clearing and flies on.

Ships are what DATA buys once the upgrades are done, and they are sideways, not up:
each trades one thing for another (the Kestrel's speed for its tank, the Ark's room and
scanner for its speed), so none is simply the best, and boarding another is free once
bought. Each is the Seed's hull changed (stretched at the nose and tail, rounder or
squarer, longer by whole three-meter bays between the galley and the bunk), so the
cockpit, the coffee and the Codex computer stand in the same place in every ship, and
the coffee scene, the seeker aboard and the walking all work unchanged; the bays are
where a larger ship keeps its rooms. The books are short and of the fog belt, there to
be read slowly while the ship flies on.

What attunement shows is built to be worth the climb. Each level is a stratum: three colors, a
dark, and a sheen that runs over every shell by angle and place (and, deeper, in time),
with veins of light wandering through it; drawn by hand for the first eight, made from
the level's number after (hues turned by the golden angle) without end. The true forms
(forty-three: corolla, spine, nested solids, armillary, choir, geode, coral, chandelier,
helicon, prism, knot, nautilus, archipelago, attractor, medusa, star engine, watcher,
clockwork, fountain, radiolarian, Chladni plate, ringed planet, dandelion, pages, and
the mountains', the turned stands', the rivers' and the marked ones' own) are richer the
further in they are seen (more whorls, rings, tiers, higher symmetries), and what
gathers about one comes a layer at a time, in an order drawn from the site's seed: a
second form crowning it from the fourth layer at the earliest, a court of small ones
from the fifth, its double hanging inverted in the sky, a ring in the sky, its echoes.
Size grows with the logarithm of the layers seen, forever and more slowly. Every count, symmetry, curve and
ornament comes from the seed, so no two are alike. They are built as a few
merged meshes per moving part (small crowns and courts flattened to a handful), so even a
deep one costs about what the forest around it does.

The sound follows the same ladder. The palette is harmonics 16, 18, 19, 24 and 28 of the
root; each layer seen adds one more (20, 22, 26, 17, 21, 23, 27, 29, 31, then every odd
one), and the chord always holds the newest. The intervals stay just and stay
in The Seeker's rule, and grow stranger the further in you see.

### Permutations: what the ship does, what the world does

Strangeness is the reward, and it should multiply rather than add. So the new things are
built as layers that all go together, instead of as more kinds of thing:

- **Effects** (fx.js) are what the ship does to an artifact: glitch, chaos, voxel,
  shatter. Each is a few lines added to every shader an artifact is drawn with, working
  on where each point of it stands about its heart, so one effect works on every family,
  form, layer, creature and animal there is, and any number of them on one artifact go
  together (a voxel sculpture shattering, a glitch running like water). Voxel is the one
  exception to the shader rule: the artifact is sampled into real blocks, colored from
  what they hold, the way the seekers are drawn. They are bought a few uses at a time
  (priced by the pilot's attunement, as what they are fired at is worth more), so they are
  spent and bought again, and each makes the scan worth half as much again: an
  investment the player chooses, never a chore. They work on foot too.
- **Anomalies** (anomaly.js) are what the world does, for four minutes: inversion, slow
  time, long night, discharge. Each changes the whole world (the view, time, the hour,
  the weather) and lays its own mark on every artifact not yet recorded (its negative, a stopped burst, its
  light many times over, charge), with the same machinery as the effects. Any number at
  once combine: everything wears every mark, and where two or more meet, a mark of the
  meeting whose pattern, colors and pace come from which anomalies they are, so every
  combination has artifacts of its own, in flight and on foot alike. The music answers
  the same way: each anomaly is one transformation of the score (inverted, slowed,
  darkened, trembling), and they compose, with each combination turning the chord to a
  mode of its own. Some are opened by holding a seeker of a kind (a trait of its art, or
  something it has done on the chain): the collection becomes keys to the world. They
  are a sink for DATA that grows with attunement, as its levels' costs do.
- **Places** have their own sets: the mountains, the turned stands, the rivers and the
  lakes each draw from their own families and true forms, so the same stratum looks
  different by where it is found. The rivers are the terrain to fly along, and rare
  enough to be found: one in about half the cells of a grid four and a half kilometers
  on a side, each from a spring in that cell's high ground down to a lake of its own at
  its lowest, meandering, so every river begins and ends and every canyon has a head.
  The channel is cut below the lakes' level so the lakes' own water stands in it, as
  deep as the ground is high (a canyon in the hills, ledged and layered), out of the
  mountains. Turned along one (the HUD says so
  as one comes into view), the ship follows it: its height from the river's own path
  ahead, not the straight line it points along, so it goes down between the walls and
  stays there through the bends, and a gentle hand on the steering toward the river's
  middle that the pilot's own steering overrides (steering firmly away lets it go); the
  rivers'
  sites lie in a river's middle, so they are found by following one, and are worth more
  for it.
- **Life** keeps to sites of its own: small things that move and must be followed (a
  flock fleeing slower than the ship), worth less, but taking effects and marks like
  anything else, and to be found again where they were.

An artifact in a pilot's Codex is then its family, times its true form, times how far
into it that pilot saw (its stratum), times where it stands, times the anomalies running,
times the effects the pilot chose: the place is everyone's, the record is one's own.

A site's artifact is built once the ship is within about a kilometer (well beyond what
the fog lets you see), materializing in the ordered dither, and put away once it is a
kilometer and a half behind. The scanner looks at whichever one is most nearly ahead.
Witnessed seekers alone still rise ahead of the nose, just past what can be seen, and go
back into the fog once passed: they are moments, not places.

## The look

Soundings' approach, taken outdoors: the world drawn at a low resolution and scaled up
by whole pixels, flat-shaded low-poly shapes in the codex's palette, posterized with
ordered dithering. Over it, a raymarched fog pass: height-layered (thick in the valleys),
drifting, lit by the sky, darker deep in the layer, and by the artifacts' lights in closed
form. The sun reaches the fog only where it can: each fog sample looks toward the sun
through a height map of the crowns and ridges and through the cloud deck, so low suns
throw beams between the trees and breaks in the overcast send shafts down by day; a
screen-space pass streams light from the sun past whatever stands in front of it. The
cloud deck's shadows roll over the forest in stepped bands.

The forest is spruce and fir, dark blue-greens. Rarely, a turned stand: one smooth field
over the world (about a twentieth of it, stands a few hundred meters to a kilometer
across) where most trees are birches, each a single lobed crown on a pale, marked trunk,
gold, deep gold, amber or rust by the tree, more of them still green toward the edges,
and fewer, so a stand fades out into the spruce. The ground under it goes russet, the fog
in it warms a little, and the giants stand dark over it. Whatever the weather, mist lies
in it: banks drifting between the trunks, under the crowns so their tops stand clear, and
only within a few hundred meters of the eye, so the horizon stays as the weather has it.
The canopy map carries how turned each place is beside the crowns' height; the fog pass
takes the mist along the stretch of each ray that can hold it, at even steps and not the
fog's jittered ones (a thin, thick layer would show the dither), and lays it over what is
behind. Three crown shapes, each tree
squashed, leaned and turned its own way. The bark is a true grey, which the tree shader
gives the tint's brightness and not its hue, so the trunks stay pale whatever the leaves.

Rarer still, mountains: another slow field over the world, about a third as many ranges as
there are turned stands and larger (a kilometer to three across with the foothills), each
a ridged massif up to some 320 meters over the forest, rising gently from its foothills and
steepest at its heart. The forest thins up their flanks to a treeline; every steep face is
bare rock (judged by the whole terrain square, so a face reads as one), and snow lies
above a ragged line, thinning on the steeps. They are what the fog's sea is for: peaks
standing out of it. The ship climbs a range at a steady slope, starting early enough to
pass just over the top, toward a height eased over a moment so the ridges coming into view
do not jolt it. High ground shows over the fog from as far as the world is built, so
every chunk built in flight (ground and trees alike) comes into view in the dither over a
couple of seconds rather than all at once; the canopy map that shades the fog now reaches
509 meters, for the peaks.

A mountain has its own artifacts, at the surface and at every depth: a wild one that rises
on a range is drawn from them alone and set on the highest ground near where it would have
been. At the surface, eight families (cairns, banners, a relay mast, a door in the rock, an
arch, an observatory, a harp of light, a frozen fall); below, seven forms the strata open
as they do the forest's (crystal spire, sky temple, halo, aurora loom from the first; storm
crown from the second; wind serpent and ice cathedral from the third), crowning and
holding court only among themselves; their voices always carry breath, like wind on a ridge.

## Time and weather, shared

The planet keeps Robinhood Chain's time: a day is 14,400 blocks (about 24 minutes), three
quarters of it daylight, with long golden hours. The fog's thickness and the breaks in the
clouds follow the same block clock, so everyone flying at the same moment shares the hour
and the weather. At night the aurora's strength follows the network, and every move sends
a pulse through it.

## The ship and the cabin

Seeker technology as the codex describes it: dark, minimal, fused with the organic, a pale
core of light. Inside: the windshield and the controls at the front (sit there to fly and
scan from inside), the coffee machine on the left wall, the Codex computer on the right,
a bunk, lockers, moss in a bowl, and the core breathing in a glass column at the back.

## A seeker aboard

The codex suggests activated seekers as companions and dormant ones as dark husks that
light up stage by stage; here one of your own comes aboard. It is built in voxels from its
exact collection art, the way Soundings builds them (the monitor rebuilt as a box from
the oblique picture, each add-on at its own depth, the floating object modeled as the
thing itself), shaded by its live charge stage, and hovers by the Codex computer, out of
the way, turning to watch you. It talks in monologues: every visual trait in the
collection (119 of them) has two lines of its own, so a seeker's voice is the sum of its
parts, dealt as a new permutation each time, with now and then a line about its charge,
the hour, or you. Computer-minded, quiet, mysterious, and sometimes dry or cheeky: a
tiny machine that has been waiting a long time and has opinions about the fog.

## Coffee

A tall machine after the Moccamaster, made matte black with pale edges: a water tank that
glows as it heats, a filter cone with a ring of light, a carafe on a warm plate, one
button. Making coffee is a short scene seen from outside yourself, in still shots with
hard cuts: the Seeker (the hooded figure, the only yellowish thing in view) presses the
button, watches it brew, pours, and drinks at the window while the fog goes by.

## The music

After a reference the project chose (an hour of ambient music in A minor over a deep
drone), measured rather than guessed: most of its energy under 60 Hz, almost none above
2 kHz, an event every half minute, loudness steady within two decibels, very wide.

The tuning keeps The Seeker's rule on another root: 42 Hz, with the music on 21/16 of it
(an A at 55.125 Hz, where the reference sits) and the palette 1, 9/8, 19/16, 3/2, 7/4, the
reference's own chord in just intonation. Tempo from the same root: 78.75 BPM.

A drone on the root; five voices that each move on their own clock to a near note,
swelling in and fading out over many seconds; some dissolve into breath at their pitch,
some are heard only in the hall, the rest sink slowly into darkness; a far soft tone now
and then; a tide, and every few minutes a rest. Through a chorus into a plate reverb whose
tail is swept like a chorus and whose reflections turn, so the space moves. Effects are
low swells, never bells. **M** keeps a passage (it returns); **R** saves the last minute.

## The Codex board

Nostr, because it needs no server of ours: kind 1 notes tagged `#lowpasscodex` on six
free relays, readable in any Nostr client. Free relays take anything, so readers keep the
board: every post is checked in the page (its signature; its wallet link, EIP-191, to an
address; that address holding a seeker now, read from the chain) and links are refused.
A scan travels as its origin (a transaction, or a wild artifact's seed) and its
photograph (a small JPEG).

Holders take names, and a name is the face they show: the newest name (a signed profile
event with the same proof) replaces the address on every post of theirs, past ones too,
for every reader, and the address stays out of sight. They can delete their posts too
(a NIP-09 deletion, honored by every reader and by most relays). Free relays promise
nothing, so no single one is trusted: notes go to all six and come from all six, every
game keeps what it has read and passes it back to any relay that lost it.

## Performance

Everything at a low resolution (auto: fewer pixels while frames are slow), instanced trees
in three levels of detail, chunks streamed around a floating origin, one shared lighting
model, no shadow maps (the sun's shadows come from the canopy height map, in the fog pass),
procedural audio, no build step. About 5 ms a frame on a laptop.

The forest must never visibly change around the ship. Each tree chooses its level of detail
on the GPU, at its own distance inside a band (from 250 m, and from 560 m), dissolving from
one level to the next over 16 m on the same 4x4 dither as everything else; a chunk only
decides which levels it may need, so no block of forest ever switches at once. The rare
giants keep their full shape at every distance (all of them drawn in one mesh). The
birches cost about what the spruce do: one crown of about a hundred faces near, ten far.
Artifact clearings dissolve the trees standing in them the same way, in the shader, instead of
rebuilding the chunk's trees.
