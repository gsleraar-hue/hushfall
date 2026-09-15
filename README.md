# Hushfall

Ambient sound for focus, calm and sleep: a dark app with moods, a sound mixer, a noise generator, ambient
radio, timers and moving backgrounds. Everything is sorted by **kind** (rain, sea, fire, birds, café, jazz,
film, christmas, gregorian, ...) and by **mood** (focus, calm, sleep, nature, coffee house, festive,
cinematic, city, music).

The sounds come from two directions:

1. **Hushfall's own sounds** (82 of them, `public/synth.js`): made live with Web Audio, so no files and no
   looping. These are always in the app, right after installing too.
   - **Nature**: rain with individual resonating drops; a hearth fire in which every pop is a short burst of
     noise (a tuned pop sounds inescapably like popcorn) over a fine crackle that never falls silent; wind in
     which the gusts drive volume, colour, whistling and rustling together; surf in which every wave rolls in,
     breaks, hisses for seconds and pulls back over the sand, in sets of a few small ones and then a big one;
     a brook of separate bubbles; thunder rolling in irregular bouts; birdsong with harmonics and vibrato;
     crickets and frogs.
   - **People**: a café and a christmas market with real voices. Every speaker has their own pitch and pace
     and speaks vowels through formant filters, so you hear conversation without words. Plus cups, cutlery,
     chairs and the espresso machine. Traffic with a doppler effect: the pitch drops the moment a car is past,
     and the engine arrives before the tyre noise.
   - **Music**: eight ambient pieces and eleven jazz variations out of one combo engine with real jazz harmony
     (ii-V-I, blues, bossa, modal): piano jazz, piano trio, coffee table jazz with vibraphone, sax trio with a
     breathy reed voice, late night blues, bossa nova on nylon guitar and lo-fi jazz.
   - **Christmas**: nine scenes, from a four-part choir and a church organ to a carillon, a sleigh ride with
     hoofbeats in the snow, snow crunching underfoot, a christmas market with a barrel organ, and the music
     box. The melodies are public domain carols.
   - **Film music**: twenty atmospheric pieces. Seven come out of one engine with three handwritings: slow
     strings over a low drone with very slow chord changes; a postminimalist piano motif that keeps repeating
     while one note shifts now and then; and wide analogue pads with a slow filter sweep, an arpeggio through
     the delay and a singing lead. Light tape noise sits underneath all of it. Next to those, four pieces of
     chamber music around a felt piano: the felt between the hammers and the strings softens the attack, and
     you hear the mechanism playing along, the hammer coming down and the damper letting go. A small string
     quartet sits above it, and cascades of high notes fall out of the chord as if by themselves. And three
     pieces for cello: sustained notes swelling slowly, with the body resonances of the instrument, audible
     bow noise that grows as the bow moves closer to the bridge, sliding notes, and sometimes two cellos so
     close together that you hear them beat. In the industrial variant the cello stands in a large concrete
     space, with distant machines and struck metal. Finally six dark electronic pieces: tight, cold and dirty,
     with a pounding sub underneath. Three of them revolve around a sequencer deliberately built monophonic
     like a real analogue one: a single oscillator that never stops, one filter, one amplifier, and the whole
     pattern in the automation. You hear the glide between notes and a resonant filter opening and closing
     over minutes. Two pieces set a hard-struck piano motif against that, doubled with a second one that sits
     just beside it — that impurity is what makes it cold. And one piece is a machine hall without a melody:
     metal on a grid that is not quite in time, compressed air and a motor that never runs true. All of it
     goes through a tape loop with wow and noise, because without that degradation this sounds sterile.
   - **Medieval church music**: seven chants in church modes (dorian, phrygian, lydian, mixolydian), built the
     way real plainchant is: an intonation rising, the text on the reciting tone, and a cadence back to the
     finalis, with melismas and free rhythm. Gregorian chant, Compline, Vespers, Lauds, Organum (early
     polyphony in fifths), Hildegard von Bingen (high voices, wide leaps, long melismas over a drone) and
     Quiet chapel. The voices are shaped onto Latin vowels with formant filters, in an eight second church
     reverb. The organ changes registration per verse (principal, flute, plenum, reed), the bellows let the
     tone waver slightly, and sometimes the tremulant is on.

   What makes a sound real always comes down to the same three things. Events have to matter more than the
   noise bed: fire is popping, not hissing. Nothing may be exact: pitch, tempo and volume always wander a
   little. And the strength of events is skewed: most pops, drops or waves are barely audible and every so
   often there is a solid one. For voices there is one more thing, the source waveform: a sawtooth falls off
   6 dB per octave and real vocal folds roughly twice as fast, so all singing and speech uses its own waveform
   with that slope (`stemGolf`). Without that correction formant synthesis sounds tinny and nasal.

2. **Recordings from free sources** (optional download): field recordings and music from BBC Sound Effects,
   the Internet Archive, Wikimedia Commons and Mixkit. See [Sources and licences](#sources-and-licences).

Runs as a website (in the browser) and as a Windows app (Electron).

## Quick start (browser)

Requires Node.js 20 or newer.

```bash
npm install
npm run fetch          # a quick selection, around 500 MB
npm run dev            # http://127.0.0.1:8790
```

To pull in everything the sources have to offer in ambient sound (up to 8 GB by default, balanced across all
kinds):

```bash
npm run fetch -- --all --max-gb=8
```

`node server.js --lan` also makes the site reachable from your phone on the same wifi network.

## Windows app

```bash
npm start              # run the app from the project folder (uses public/ as the library)
npm run dist           # bump the version by one, then build the installer and portable exe into dist/
```

`npm run dist` first raises the patch number in `package.json` and puts it in the file names, so every build
has its own version: `Hushfall Setup 1.0.1.exe` and `Hushfall-portable-1.0.1.exe`. The version also shows at
the bottom of **Settings** in the app.

```bash
npm run bump minor     # 1.0.4 -> 1.1.0 (or: major, patch, or a number like 2.0.0)
npm run dist:keep      # build again without raising the number, for instance after a failed build
npm run release        # bump the version, build, and put it on GitHub as a release
```

### Updating

The app updates itself. Eight seconds after starting, and every six hours after that, it checks whether there
is a newer release on GitHub, fetches it in the background and installs it once you quit Hushfall. So you do
not have to uninstall the previous version, and updating never interrupts whatever you are listening to. When
a version is ready, a bar appears at the top with **Restart now** for anyone who does not want
to wait. The downloaded library lives in your user folder and simply stays put across updates.

Publishing can be done by hand with `npm run release` (which needs a `GH_TOKEN` in the environment), or by
pushing a tag: `.github/workflows/release.yml` then builds on a GitHub runner and attaches the installer to
the release. electron-builder works out the owner and the repo from the git remote, so no name is hard-coded
in the configuration. Builds made with `npm run dist` never publish and never update themselves; those are for
testing.

### Microsoft Store (MSIX)

```bash
npm run dist:store     # makes the Store tiles and builds dist/Hushfall <version>.appx
```

This is deliberately a separate package, because the Store version behaves differently from the installer:

- **Self-updating is off.** The Store updates the app and the install folder is read-only, so updating itself
  would fail and the Store would reject it. The app recognises this on its own through
  `process.windowsStore`; there is no separate source code for it.
- **Only sources that allow commercial use.** The BBC RemArc licence allows personal, educational and
  non-commercial use only, and the free Mixkit licences forbid redistribution. The Store version leaves those
  two out (`STORE_BRONNEN` in `electron/main.cjs`) and keeps Creative Commons and public domain. The 82 own
  sounds are in there regardless.
- **The tiles** come from `scripts/make-icon.js`, which writes six PNGs into `build/appx/` next to the icon.

What you have to do yourself before submitting: reserve the name in Partner Center and put the three values it
gives you into the `appx` block of `package.json` — `identityName`, `publisher` and `publisherDisplayName`.
What is in there now is only good enough to build locally.

Building locally needs `makeappx.exe` from the Windows SDK. Without it the build ends in `spawn UNKNOWN`. The
GitHub runner does have the SDK, so the `store` job in `.github/workflows/release.yml` builds the package
without you installing anything locally.

The generated manifest declares `runFullTrust` with `EntryPoint="Windows.FullTrustApplication"`. Inside the
MSIX package the app therefore runs as a normal desktop application and not in an AppContainer. That matters:
it is what lets the local server on 127.0.0.1, the SSDP search for Sonos and the stream server work exactly as
they do in the regular installer, without extra capabilities.

### When the sound stutters

Web Audio does all of its work on a single processor core, and you can fill that core up. The most expensive
item is the convolution reverb, by a wide margin. Measured, as a fraction of one core:

| | cost |
|---|---|
| church reverb, 8 s, stereo | 0.36 |
| church reverb, 5 s, mono | 0.17 |
| 200 oscillators | 0.82 |
| compressor | 0.03 |

That is why all impulse responses are mono and shorter (church 5 s, hall 3 s, room 1.1 s): the cost rises
straight with the length and with the number of channels, while you cannot hear that a reverb tail is mono.
For a mix of three sounds that took the load from 0.77 to 0.27 of a core, measured over five runs.

If it stutters anyway, for instance because something heavy is running on your pc, switch on **Light mode**
under Settings › Visuals. That drops the per-sound room reverb and halves
the particles. You measure this with an `OfflineAudioContext`: it renders as fast as the machine can, so
render time divided by sound duration is exactly the fraction of a core a node really costs.

`npm run dist` makes `dist/Hushfall Setup 1.0.0.exe` (installer) and `dist/Hushfall-portable.exe`. The 82 own
sounds sit inside the exe and work right away. Recordings do not (that would be gigabytes); you add those
through **Settings › Library**:

- **Fetch all ambient sounds** or **Quick selection (~500 MB)**: downloads into `%APPDATA%\Hushfall\library`, with progress and a stop button. You can resume later; sounds
  that are already there are skipped.
- **Use an existing library folder…**: point at a folder with a
  `library.json` and a `sounds` directory (the `public` folder of this project, for example). The app reads it
  directly, without copying or downloading again.

The exe is not signed. Windows SmartScreen may warn you on first launch: choose "More info" and "Run anyway".

## What is in it

- **Moods**: rows of cards per mood, a row with Hushfall's own sounds, plus composed mixes ("Rainy reading
  room" = rain + open fire + room tone, for instance). Every kind has its own colour palette and particle
  effect (rain, snow, leaves, fireflies, sparks, bubbles, stars).
- **Mixer**: all sounds grouped by kind, with a switch and a volume slider per sound, search and filters.
- **Noise generator**: white, pink, brown, blue, violet and grey noise with tone and depth filters, and presets.
- **Radio**: SomaFM and Radio Paradise streams (ambient, downtempo, lounge).
- **Sonos** (Windows app only): send exactly what you hear to your speakers. See below.
- **Timer**: presets, your own time, fade-out and pomodoro (25/5).
- **Volume mixer**: master, moods, mixer layers, noise and radio separately.
- **Full screen** with a large title and related sounds; the controls disappear after a few seconds.
- Keyboard shortcuts: space to play/pause, F for full screen, M to mute, S for a random sound, arrows for
  volume.
- The last mix and all settings are remembered.

## Sonos

In the Windows app, click the speaker icon in the top right. Hushfall finds your speakers over SSDP and puts a
switch next to every room; the volume per room sits in that same list.

How it works: a Sonos fetches audio from a URL by itself, you cannot push anything to it. So Hushfall becomes
a radio station on your own network. The mixed audio (mixes, own sounds, noise) is converted to MP3 live on a
separate thread (128 kbps, `public/lib/lame.min.js`) and served at `http://<your-ip>:34872/stream.mp3`. The
speaker is told over UPnP to play that station. No account, no cloud, everything inside your network.

- That station only starts once you actually use it and serves **nothing but** `/stream.mp3`; the rest of the
  app stays on `127.0.0.1`. Windows Firewall asks for permission the first time, because the speaker has to be
  able to reach it.
- Expect two to five seconds of delay: a Sonos buffers a radio stream. Listening on your pc and your Sonos at
  the same time sounds messy because of that; muting on your pc (M) does not stop the broadcast.
- The sleep timer works on the Sonos too, because the branch sits after the fade-out and before your pc volume.
- Your pc has to stay on with Hushfall open; it is the station, after all. On quitting, Hushfall stops your
  speakers.
- Radio does not go into the broadcast (that stream runs outside the mixer). A Sonos can play stations like
  that by itself.

## Sources and licences

| Source | What | Licence |
| --- | --- | --- |
| Hushfall itself (`public/synth.js`) | 82 own sounds and pieces of music, made live with Web Audio | part of this project |
| [BBC Sound Effects](https://sound-effects.bbcrewind.co.uk/) | 33,000+ recordings, among them thousands of atmospheres and nature recordings | RemArc licence: personal, educational and non-commercial use |
| [Internet Archive](https://archive.org/) | field recordings (radio aporee among others) and ambient music from netlabels | Creative Commons, stated per recording |
| [Great 78 Project](https://archive.org/details/georgeblood) | restored 78 rpm records: jazz, swing and christmas music from the 1920s to the 1950s | historical recordings, stated per record |
| [Wikimedia Commons](https://commons.wikimedia.org/) | sound recordings | Creative Commons or public domain, stated per file |
| [Mixkit](https://mixkit.co/free-sound-effects/) | atmospheres | Mixkit Sound Effects Free License |
| [Mixkit music](https://mixkit.co/free-stock-music/) | ambient, chillout, new age, jazz, lounge and christmas music (full mp3s) | Mixkit Stock Music Free License |
| [Freesound](https://freesound.org/) | optional, with a free API key | Creative Commons (CC0 and BY) |

The source, licence and link for every sound are in `library.json` and in the app (click the source label on a
card). For Freesound, put `FREESOUND_KEY=...` in `.env` (create a key at freesound.org/apiv2/apply).

## How fetching works

`scripts/fetch-sounds.js` works in two phases:

1. **Searching**: candidates are gathered at every source (metadata only). Titles, tags and descriptions are
   sorted into a kind using word lists; speech, effects and harsh sounds are skipped. Every kind gets fixed
   moods (rain belongs to focus, calm, sleep and nature, and so on).
2. **Downloading**: balanced, taking turns per kind and per source, longest recordings first, with three
   parallel downloads, up to the disk limit. That way every mood gets a fair share, even when one source is
   enormous.

Options: `--all`, `--max-gb=N`, `--only=bbc,mixkit,archive,music,jazz,kerst,gregoriaans,commons,freesound`,
`--drop=muziek` (throw a kind away and fetch it again), `--dir=folder`, `--dry`.
The script is resumable: whatever is already there is skipped. Titles are cleaned up (file names, catalogue
codes, track numbers, dates and ALL CAPS go; the original title is kept as `rawTitle`). With
`node scripts/fetch-sounds.js --retitle` you clean up existing titles again.

## Design

Hushfall has a face of its own: a warm dusk palette (ink, sand, coral), the serif typeface Fraunces (bundled,
OFL licence) for headings and titles, a top bar with tabs, a floating player capsule, and a background of sky
and hills in the colours of whichever kind is playing. Every sound gets its own procedurally drawn
illustration (rain streaks, waves, flames, tree silhouettes, skyline, planet, staff), deterministic per sound,
so cards stay recognisable without photos or emoji.

## Files

- `public/`: the web app (`index.html`, `style.css`, `app.js`, `audio.js`, `visuals.js`, `data.js`).
- `public/library.json` and `public/sounds/`: the library (browser version and `npm start`).
- `scripts/fetch-sounds.js`: fetching and classifying sounds (also used as a module by the Windows app).
- `scripts/make-icon.js`: makes `build/icon.ico` and `build/icon.png`.
- `server.js`: static server with range requests; used by the Windows app as well.
- `electron/main.cjs`, `electron/preload.cjs`: the Windows app.

## A note on language

The app, this README and the code comments are in English. What is still Dutch is everything a user never
sees: the keys for kinds and moods (`regen`, `onweer`, `muziek`, ...), a handful of identifiers
(`STORE_BRONNEN`, `stemGolf`, `zangNoot`) and, because they are those same keys, the `--only` and `--drop`
values of the fetch script. Those keys are written into `library.json` and into saved settings, so renaming
them would break libraries and preferences that already exist.
