# Nebula

Ambient geluiden om te focussen, ontspannen en slapen: een donkere app met sferen, een geluidenmixer, een
ruisgenerator, ambient radio, timers en bewegende achtergronden. Alles wordt gesorteerd op **soort** (regen, zee,
vuur, vogels, café, jazz, film, kerst, gregoriaans, ...) en **sfeer** (focus, ontspanning, slapen, natuur, koffiehuis, feestelijk,
cinematisch, stad, muziek).

De geluiden komen uit twee hoeken:

1. **Nebula's eigen geluiden** (82 stuks, `public/synth.js`): live gemaakt met Web Audio, dus geen bestanden en
   geen herhaling. Deze zitten altijd in de app, ook direct na installatie.
   - **Natuur**: regen met losse resonerende druppels; haardvuur waarin elke knap een korte ruisexplosie is
     (een gestemde knap klinkt onherroepelijk als popcorn) met daaronder een fijn geknetter dat nooit
     stilvalt; wind waarin windstoten het volume, de kleur, het fluiten en het ritselen samen aansturen;
     branding waarin elke golf aanrolt, breekt, seconden nabruist en over het zand terugtrekt, in sets van
     een paar kleine en dan een grote; een beek van losse belletjes; onweer dat rolt in onregelmatige
     vlagen; vogelzang met harmonischen en vibrato; krekels en kikkers.
   - **Mensen**: café en kerstmarkt met échte stemmen. Elke spreker heeft een eigen toonhoogte en tempo en
     praat klinkers via formantfilters, dus je hoort gesprekken zonder woorden. Plus kopjes, bestek, stoelen
     en de espressomachine. Verkeer met dopplereffect: de toonhoogte zakt op het moment dat een auto
     voorbij is, en de motor komt eerder aan dan het bandengeruis.
   - **Muziek**: acht ambient stukken en elf jazzvarianten uit één combomotor met echte jazzharmonie
     (ii-V-I, blues, bossa, modaal): pianojazz, pianotrio, coffee table jazz met vibrafoon, saxofoontrio met
     een blazende rietstem, late-avondblues, bossa nova op nylon gitaar en lo-fi jazz.
   - **Kerst**: negen sfeerbeelden, van een vierstemmig koor en een kerkorgel tot een carillon, een arrenslee
     met hoefslag in de sneeuw, knerpende sneeuw onder je voeten, een kerstmarkt met draaiorgel en de speeldoos.
     De melodieën zijn kerstliederen uit het publieke domein.
   - **Filmmuziek**: twintig atmosferische stukken. Zeven komen uit één motor met drie handschriften:
     trage strijkers met een lage drone en heel langzame akkoordwisselingen; een postminimalistisch
     pianomotief dat blijft herhalen en waarin af en toe één noot verschuift; en brede analoge pads met
     een trage filterveeg, een arpeggio door de echo en een zingende lead. Onder alles ligt lichte bandruis.
     Daarnaast vier stukken kamermuziek rond een viltpiano: het vilt tussen de hamers en de snaren maakt
     de aanslag zacht, en je hoort het mechaniek meespelen, de hamer die neerkomt en de demper die loslaat.
     Daarboven ligt een klein strijkkwartet, en er vallen cascades van hoge tonen als vanzelf uit het akkoord.
     En drie stukken voor cello: aangehouden tonen die traag aanzwellen, met de kastresonanties van het
     instrument, hoorbaar strijkgeruis dat toeneemt naarmate de stok dichter bij de kam komt, glijdende
     tonen en soms twee cello's zo dicht naast elkaar dat je ze hoort zweven. In de industriële variant
     staat de cello in een grote betonnen ruimte, met verre machines en aangeslagen metaal.
     Tot slot zes donker-elektronische stukken: strak, koud en vuil, met een dreunende sub eronder. Drie
     daarvan draaien om een sequencer die bewust monofoon is gebouwd zoals een echte analoge: één
     oscillator die nooit stopt, één filter, één versterker, en het hele patroon in de automatisering.
     Je hoort het glijden tussen de tonen en een resonante filter die over minuten opent en weer dichtgaat.
     Twee stukken zetten daar een hard aangeslagen pianomotief tegenover, dubbel gespeeld met een tweede
     die er net naast staat — die onzuiverheid maakt het koud. En één stuk is een machinehal zonder
     melodie: metaal op een raster dat net niet klopt, perslucht en een motor die nooit gelijk loopt.
     Alles gaat door een bandloop met wow en ruis, want zonder die degradatie klinkt dit steriel.
   - **Middeleeuwse kerkmuziek**: zeven gezangen in kerktoonsoorten (dorisch, frygisch, lydisch, mixolydisch),
     met de opbouw van echt gregoriaans: een intonatie omhoog, de tekst op de reciteertoon en een cadens terug
     naar de finalis, met melismen en vrije ritmiek. Gregoriaans gezang, Completen, Vespers, Lauden, Organum
     (vroege meerstemmigheid in kwinten), Hildegard von Bingen (hoge stemmen, wijde sprongen, lange melismen
     boven een bourdon) en Stille kapel. De zangstemmen worden met formantfilters op Latijnse klinkers gevormd,
     in een kerkgalm van acht seconden. Het orgel wisselt per couplet van registratie (prestant, fluit,
     plenum, tongwerk), het balgwerk laat de toon licht zweven en soms staat de tremulant aan.

   Wat een geluid echt maakt, zit steeds in dezelfde drie dingen. Gebeurtenissen moeten belangrijker zijn
   dan het ruisbed: vuur is knappen, geen geruis. Niets mag exact zijn: toonhoogte, tempo en volume zwerven
   altijd een beetje. En de sterkte van gebeurtenissen is scheef verdeeld: de meeste knappen, druppels of
   golven zijn nauwelijks hoorbaar en af en toe zit er een stevige tussen. Voor stemmen komt daar de
   bronklank bij: een zaagtand valt 6 dB per octaaf af en echte stembanden ongeveer twee keer zo snel, dus
   alle zang en spraak gebruikt een eigen golfvorm met dat verloop (`stemGolf`). Zonder die correctie
   klinkt formantsynthese blikkerig en nasaal.

2. **Opnames van gratis bronnen** (optioneel te downloaden): veldopnames en muziek van BBC Sound Effects,
   Internet Archive, Wikimedia Commons en Mixkit. Zie [Bronnen en licenties](#bronnen-en-licenties).

Werkt als website (in de browser) en als Windows-app (Electron).

## Snel starten (browser)

Vereist: Node.js 20 of nieuwer.

```bash
npm install
npm run fetch          # snelle selectie, ±500 MB
npm run dev            # http://127.0.0.1:8790
```

Alles ophalen wat de bronnen aan ambient geluid bieden (standaard tot 8 GB, gebalanceerd over alle soorten):

```bash
npm run fetch -- --all --max-gb=8
```

`node server.js --lan` maakt de site ook bereikbaar op je telefoon binnen hetzelfde wifi-netwerk.

## Windows-app

```bash
npm start              # app starten vanuit de projectmap (gebruikt public/ als bibliotheek)
npm run dist           # versienummer +1 en dan installer + portable exe bouwen in dist/
```

`npm run dist` verhoogt eerst het patch-nummer in `package.json` en zet dat in de bestandsnamen, zodat elke
build zijn eigen versie heeft: `Nebula Setup 1.0.1.exe` en `Nebula-portable-1.0.1.exe`. De versie staat ook
onderaan **Instellingen** in de app.

```bash
npm run bump minor     # 1.0.4 -> 1.1.0 (of: major, patch, of een nummer als 2.0.0)
npm run dist:keep      # opnieuw bouwen zonder het nummer te verhogen, bijvoorbeeld na een mislukte build
npm run release        # versienummer +1, bouwen én als release op GitHub zetten
```

### Bijwerken

De app werkt zichzelf bij. Acht seconden na het starten, en daarna elke zes uur, kijkt hij of er een nieuwere
release op GitHub staat, haalt die op de achtergrond binnen en installeert hem zodra je Nebula afsluit. Je hoeft
de vorige versie dus niet te de-installeren, en bijwerken onderbreekt nooit waar je naar aan het luisteren bent.
Staat er een versie klaar, dan verschijnt bovenin een balk met **Nu herstarten** voor wie niet wil wachten. De
gedownloade bibliotheek staat in de gebruikersmap en blijft bij een update gewoon staan.

Publiceren kan handmatig met `npm run release` (vereist een `GH_TOKEN` in de omgeving), of door een tag te
pushen: `.github/workflows/release.yml` bouwt dan op een GitHub-runner en hangt de installer aan de release.
Eigenaar en repo leidt electron-builder af uit de git-remote, dus er staat geen naam hard in de configuratie.
Builds met `npm run dist` publiceren nooit en werken zichzelf ook niet bij; die zijn om te testen.

`npm run dist` maakt `dist/Nebula Setup 1.0.0.exe` (installer) en `dist/Nebula-portable.exe`. De 82 eigen geluiden
zitten in de exe en werken direct. Opnames zitten er niet in (dat zouden gigabytes zijn); die haal je erbij via
**Instellingen › Bibliotheek**:

- **Alle ambient geluiden ophalen** of **Snelle selectie**: downloadt naar `%APPDATA%\Nebula\library`, met
  voortgang en een stopknop. Later hervatten kan; bestaande geluiden worden overgeslagen.
- **Bestaande bibliotheekmap gebruiken…**: wijs een map met `library.json` en `sounds` aan (bijvoorbeeld de
  `public`-map van dit project). De app leest die direct, zonder kopiëren of opnieuw downloaden.

De exe is niet ondertekend. Windows SmartScreen kan bij de eerste start waarschuwen: kies "Meer informatie" en
"Toch uitvoeren".

## Wat zit erin

- **Sferen**: rijen kaarten per sfeer, een rij met Nebula's eigen geluiden, plus samengestelde mixen
  (bijvoorbeeld "Regenachtige leeskamer" = regen + open haard + huisgeluid). Elke soort heeft een eigen
  kleurenpalet en deeltjes-effect (regen, sneeuw, bladeren, vuurvliegjes, vonken, bellen, sterren).
- **Mixer**: alle geluiden gegroepeerd per soort, met per geluid een schakelaar en volumeslider, zoeken en filters.
- **Ruisgenerator**: witte, roze, bruine, blauwe, violette en grijze ruis met klank- en dieptefilter en presets.
- **Radio**: SomaFM- en Radio Paradise-streams (ambient, downtempo, lounge).
- **Sonos** (alleen in de Windows-app): stuur precies wat je hoort naar je speakers. Zie hieronder.
- **Timer**: presets, eigen tijd, uitfaden en pomodoro (25/5).
- **Volumemixer**: hoofd, sferen, mixer-lagen, ruis en radio apart.
- **Volledig scherm** met grote titel en verwante geluiden; de bediening verdwijnt na een paar seconden.
- Sneltoetsen: spatie afspelen/pauze, F volledig scherm, M dempen, S willekeurig, pijltjes volume.
- De laatste mix en alle instellingen worden onthouden.

## Sonos

Klik in de Windows-app op het speaker-icoon rechtsboven. Nebula zoekt je speakers met SSDP en zet per kamer
een schakelaar; het volume per kamer regel je in hetzelfde lijstje.

Hoe het werkt: een Sonos haalt audio zelf op van een URL, je kunt er niets naartoe duwen. Nebula wordt daarom
een radiozender op je eigen netwerk. De gemengde audio (mixen, eigen geluiden, ruis) wordt in een aparte thread
live naar MP3 omgezet (128 kbps, `public/lib/lame.min.js`) en aangeboden op `http://<jouw-ip>:34872/stream.mp3`.
De speaker krijgt via UPnP de opdracht die zender te spelen. Geen account, geen cloud, alles binnen je netwerk.

- Die zender start pas als je hem echt gebruikt en biedt **alleen** `/stream.mp3` aan; de rest van de app blijft
  op `127.0.0.1`. Windows Firewall vraagt de eerste keer om toestemming, want de speaker moet erbij kunnen.
- Reken op twee tot vijf seconden vertraging: een Sonos buffert een radiostream. Tegelijk op je pc en je Sonos
  luisteren klinkt daardoor rommelig; dempen op je pc (M) stopt de uitzending niet.
- De slaaptimer werkt ook op de Sonos, want de aftakking zit ná het uitfaden en vóór je pc-volume.
- Je pc moet aan blijven en Nebula open staan; die is immers de zender. Bij afsluiten stopt Nebula je speakers.
- Radio gaat niet mee in de uitzending (die stream loopt buiten de mixer om). Een Sonos kan zulke zenders zelf
  afspelen.

## Bronnen en licenties

| Bron | Wat | Licentie |
| --- | --- | --- |
| Nebula zelf (`public/synth.js`) | 82 eigen geluiden en muziekstukken, live gemaakt met Web Audio | onderdeel van dit project |
| [BBC Sound Effects](https://sound-effects.bbcrewind.co.uk/) | 33.000+ opnames, waaronder duizenden sferen en natuuropnames | RemArc-licentie: persoonlijk, educatief en niet-commercieel gebruik |
| [Internet Archive](https://archive.org/) | veldopnames (o.a. radio aporee) en ambient muziek van netlabels | Creative Commons, per opname vermeld |
| [Great 78 Project](https://archive.org/details/georgeblood) | gerestaureerde 78-toerenplaten: jazz, swing en kerstmuziek uit de jaren 1920–1950 | historische opnamen, per plaat vermeld |
| [Wikimedia Commons](https://commons.wikimedia.org/) | geluidsopnames | Creative Commons of publiek domein, per bestand vermeld |
| [Mixkit](https://mixkit.co/free-sound-effects/) | sfeergeluiden | Mixkit Sound Effects Free License |
| [Mixkit muziek](https://mixkit.co/free-stock-music/) | ambient, chillout, new age, jazz, lounge en kerstmuziek (volledige mp3's) | Mixkit Stock Music Free License |
| [Freesound](https://freesound.org/) | optioneel, met gratis API-sleutel | Creative Commons (CC0 en BY) |

Per geluid staan bron, licentie en link in `library.json` en in de app (klik op het bronlabel van een kaart).
Voor Freesound zet je `FREESOUND_KEY=...` in `.env` (sleutel aanmaken op freesound.org/apiv2/apply).

## Hoe het ophalen werkt

`scripts/fetch-sounds.js` werkt in twee fases:

1. **Zoeken**: bij elke bron worden kandidaten verzameld (alleen metadata). Titels, tags en beschrijvingen worden
   met woordenlijsten ingedeeld in een soort; spraak, effecten en harde geluiden worden overgeslagen. Elke soort
   krijgt vaste sferen (regen hoort bij focus, ontspanning, slapen en natuur, enzovoort).
2. **Downloaden**: gebalanceerd, om de beurt per soort en per bron, langste opnames eerst, met drie parallelle
   downloads, tot de schijflimiet. Zo krijgt elke sfeer een eerlijk deel, ook als een bron enorm is.

Opties: `--all`, `--max-gb=N`, `--only=bbc,mixkit,archive,music,jazz,kerst,gregoriaans,commons,freesound`, `--drop=muziek`
(soort weggooien en opnieuw ophalen), `--dir=map`, `--dry`.
Het script is herstartbaar: wat er al staat wordt overgeslagen. Titels worden opgeschoond (bestandsnamen,
catalogus­codes, tracknummers, datums en HOOFDLETTERS verdwijnen; de originele titel blijft bewaard als
`rawTitle`). Met `node scripts/fetch-sounds.js --retitle` schoon je bestaande titels opnieuw op.

## Vormgeving

Nebula heeft een eigen gezicht: een warm schemerpalet (inkt, zand, koraal), het serif-lettertype Fraunces
(meegeleverd, OFL-licentie) voor koppen en titels, een bovenbalk met tabs, een zwevende spelercapsule en een
achtergrond met lucht en heuvels in de kleuren van de soort die speelt. Elk geluid krijgt een eigen
procedureel getekende illustratie (regenstrepen, golven, vlammen, boomsilhouetten, skyline, planeet, notenbalk),
deterministisch per geluid, zodat kaarten herkenbaar blijven zonder foto's of emoji.

## Bestanden

- `public/`: de webapp (`index.html`, `style.css`, `app.js`, `audio.js`, `visuals.js`, `data.js`).
- `public/library.json` en `public/sounds/`: de bibliotheek (browserversie en `npm start`).
- `scripts/fetch-sounds.js`: geluiden ophalen en classificeren (ook als module gebruikt door de Windows-app).
- `scripts/make-icon.js`: maakt `build/icon.ico` en `build/icon.png`.
- `server.js`: statische server met range-requests; wordt ook door de Windows-app gebruikt.
- `electron/main.cjs`, `electron/preload.cjs`: de Windows-app.
