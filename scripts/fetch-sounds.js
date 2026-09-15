#!/usr/bin/env node
/**
 * Haalt gratis ambient geluiden op uit meerdere bronnen en sorteert ze op soort en sfeer.
 *
 * Sources (no API key needed):
 *   - BBC Sound Effects (RemArc licence: personal, educational, non-commercial)
 *   - Internet Archive: veldopnames en ambient netlabel-muziek (Creative Commons)
 *   - Wikimedia Commons (Creative Commons / publiek domein)
 *   - Mixkit (Mixkit Sound Effects Free License)
 * Optionally with a key in .env:
 *   - Freesound (FREESOUND_KEY): Creative Commons-geluiden
 *
 * How it works: candidates are gathered at every source first (metadata only), after which the
 * downloading is balanced: taking turns per kind (rain, sea, fire, ...) and per source, longest
 * recordings first, up to the limit. That way every mood gets a fair share.
 *
 * Gebruik:  node scripts/fetch-sounds.js [--all] [--max-gb=8] [--dir=map] [--only=bbc,mixkit,archive,music,jazz,kerst,commons,freesound] [--drop=muziek] [--dry] [--retitle]
 *   --all        fetch everything ambient (pages through all search results); the default is a quick selection (~500 MB)
 *   --max-gb=N   disk limit for the whole library (8 GB by default with --all, 0.5 GB when quick)
 *   --dir=folder folder holding sounds/ and library.json (public/ by default)
 *   --only=...   these sources only
 *   --dry        download nothing, only show what is found
 *
 * Kan ook als module gebruikt worden: runFetch({ dir, mode: 'all', log, progress, signal }).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'Hushfall/1.0 (persoonlijke ambient-speler)';
const MB = 1024 * 1024;

// ---------------------------------------------------------------------------
// Classificatie: soort (kind) en sfeer (mood)
// ---------------------------------------------------------------------------
const KINDS = [
  ['gregoriaans', /\b(gregorian\w*|plainchant|plain ?song|chant grégorien|cantus|antiphon\w*|responsor\w*|kyrie|gloria in excelsis|sanctus|agnus dei|magnificat|salve regina|veni creator|te deum|vespers|compline|matins|lauds|hildegard|von bingen|de bingen|monastic|monks? (?:sing|chant)|abbey choir|liber usualis|graduale|organum|ars antiqua|medieval (?:chant|choir|sacred)|middeleeuw\w*|gregoriaans\w*)\b/i],
  ['kerst', /\b(christmas|xmas|x-mas|noel|noël|yule\w*|sleigh|carols?|santa|advent|kerst\w*|winter wonderland|jingle bells|silent night|nativity|reindeer)\b/i],
  ['jazz', /\b(jazz\w*|swing|bebop|big band|bossa(?: nova)?|lounge|saxophone|blues|ragtime|dixieland|crooner)\b/i],
  ['onweer', /\b(thunder|thunderstorm|lightning|storms?|stormy)\b|onweer/i],
  ['vuur', /\b(fire|fires|fireplace|campfire|bonfire|crackl\w*|flames?|hearth|wood ?stove|log burner|embers?|burning)\b|haard/i],
  ['zee', /\b(sea|ocean|waves?|surf|beach|shore|shoreline|coast\w*|harbou?r|tide|tidal|seaside|seagulls?|shingle|rockpool|pier)\b/i],
  ['regen', /\b(rain\w*|drizzle|downpour|showers?|rainfall|gutter|monsoon)\b|regen/i],
  ['vogels', /\b(birds?|birdsong|bird song|dawn chorus|owls?|robin|blackbird|thrush|warblers?|wren|gulls?|crows?|rooks?|geese|ducks?|chirp\w*|songbirds?|nightingale|cuckoo|pigeons?|doves?|skylark|swallows?|finch\w*|tits?|starlings?|sparrows?|herons?|swans?|lapwing|curlew|oystercatcher|grouse|pheasant|woodpecker|jays?|magpie)\b|vogel/i],
  ['nacht', /\b(night\w*|crickets?|cicadas?|frogs?|toads?|insects?|nocturnal|evening|dusk|katydid|bats?)\b|nacht|krekel/i],
  ['water', /\b(river|rivers|stream|streams|brook|creek|waterfall|fountain|water|bubbl\w*|drip\w*|trickl\w*|rapids|lake|pond|canal|splash\w*|weir|spring)\b|beek|rivier/i],
  ['wind', /\b(wind\w*|breeze|gale|gusts?|gusty|blizzard|howling|snowstorm|draught|blustery)\b/i],
  ['bos', /\b(forest|woods?|woodland|jungle|rainforest|trees?|leaves|foliage|meadow|countryside|nature|garden|grassland|moor\w*|heath\w*|park|rustl\w*|fields?|marsh|swamp|mountain\w*|valley|hillside|orchard|hedgerow|wetland|savann\w*|bush|reeds?)\b|\bbos\b/i],
  ['cafe', /\b(cafe|café|coffee ?shop|restaurant|bar|pub|crowds?|chatter|people|voices|market|library|canteen|diner|babble|murmur|conversation|waiting room|office|reception|hotel lobby|shop|store|supermarket|mall|school|playground|swimming pool|pool|museum|gallery|classroom|foyer|lobby|hall)\b/i],
  ['stad', /\b(city|cities|traffic|street|urban|cars?|trains?|railway|station|airport|tram|subway|metro|underground|highway|motorway|road|bus|boats?|ships?|ferry|engine|town|square|dock\w*|construction|bells?|clock tower|village|suburb\w*|plane|aircraft|jet|helicopter|port)\b/i],
  ['huis', /\b(kitchen|clock|ticking|fan|washing machine|dishwasher|fridge|refrigerator|home|house|room|typing|keyboard|typewriter|pages?|paper|vinyl|record player|radiator|heater|air ?con\w*|shower|bath|kettle|boiling|cooking|sizzl\w*|frying|hum\w*|tumble dryer|central heating|boiler)\b/i],
  ['dieren', /\b(cats?|dogs?|cows?|cattle|sheep|lambs?|goats?|horses?|whales?|dolphins?|animals?|farm|wolf|wolves|elephants?|monkeys?|lions?|bees?|hive|purring|barking|pigs?|chickens?|hens?|deer|seals?|penguins?|zoo)\b/i],
  ['ruimte', /\b(drone|space|ambien\w*|atmosphere|atmos|tunnel|cave|cavern|church|cathedral|interior|room tone|reverb|hangar|warehouse|basement|cellar|ventilation|industrial|factory|machine\w*|generator|electric\w*|static|noise|spaceship|sci-?fi|dark|eerie|haunted|mine|quarry|power station|air conditioning|exterior|general)\b/i],
];
export const KIND_LABELS = {
  regen: 'Rain', onweer: 'Thunder & storm', wind: 'Wind', water: 'Water & streams', zee: 'Sea & shore',
  vuur: 'Fire', vogels: 'Birds', bos: 'Forest & nature', nacht: 'Night & insects', dieren: 'Animals',
  stad: 'City & traffic', cafe: 'Café & people', huis: 'Indoors', ruimte: 'Rooms & drones', muziek: 'Ambient music',
  jazz: 'Jazz', kerst: 'Christmas', gregoriaans: 'Medieval church music',
};
export const MOOD_LABELS = {
  focus: 'Focus & work', ontspanning: 'Unwind', slaap: 'Sleep', natuur: 'Nature', koffie: 'Coffee house',
  feest: 'Festive', cinematisch: 'Atmospheric & cinematic', stad: 'City & people', muziek: 'Ambient music',
};
const KIND_MOODS = {
  regen: ['focus', 'ontspanning', 'slaap', 'natuur'],
  onweer: ['slaap', 'natuur', 'cinematisch'],
  wind: ['ontspanning', 'slaap', 'natuur', 'cinematisch'],
  water: ['focus', 'ontspanning', 'natuur'],
  zee: ['ontspanning', 'slaap', 'natuur'],
  vuur: ['ontspanning', 'slaap', 'focus', 'feest'],
  vogels: ['ontspanning', 'natuur'],
  bos: ['ontspanning', 'natuur', 'focus'],
  nacht: ['slaap', 'natuur'],
  dieren: ['natuur'],
  stad: ['focus', 'stad'],
  cafe: ['focus', 'stad', 'koffie'],
  huis: ['focus', 'slaap'],
  ruimte: ['cinematisch', 'slaap', 'focus'],
  muziek: ['muziek', 'ontspanning', 'focus'],
  jazz: ['koffie', 'ontspanning', 'muziek'],
  kerst: ['feest'],
  gregoriaans: ['focus', 'ontspanning', 'cinematisch', 'muziek'],
};
// Anything that is not a calm background (speech, effects, harsh sounds) is skipped.
const EXCLUDE = /\b(speech|speaking|speaks?|interview|lecture|lyrics|podcast|sermon|poem|reading|narrat\w*|dialogue|comedy|laugh\w*|scream\w*|gunshots?|guns?|rifle|pistol|explosions?|war|battle|sirens?|alarm|crash\w*|horror|jingle|advert\w*|commercial|announcement|phone|telephone|ringtone|beep|notification|clapping|applause|cheering|shouting|shouts?|crying|toilet|fart|burp|vomit|whistle|footsteps|door|doors|slam|glass|smash|breaking|hit|hits|punch|knock\w*|coins?|keys|zip|click|buttons?|switch|bang|shot|impact|swoosh|whoosh|sword|monster|roar\w*|growl\w*|shriek|squeal|honk\w*|horn|brakes|skid|revving|motorbike|motorcycle|chainsaw|drill\w*|hammer\w*|sawing|jackhammer|scratch\w*|squeak\w*|creak\w*|scrape|ripping|tearing|cough\w*|sneez\w*|snor\w*|breath\w*|heartbeat|eating|chewing|slurp|kiss|moan|yawn|tv|television|radio play|game show|orbit|nasa|documentary|news|trailer|episode|lesson|tutorial)\b/i;

export function classify(text, forcedKind) {
  const t = String(text || '');
  if (!forcedKind && EXCLUDE.test(t)) return null;
  let kind = forcedKind || null;
  if (!kind) for (const [k, re] of KINDS) if (re.test(t)) { kind = k; break; }
  if (!kind) return null;
  return { kind, kindLabel: KIND_LABELS[kind], moods: KIND_MOODS[kind] };
}
const SOURCE_NAMES = {
  bbc: 'BBC Sound Effects', mixkit: 'Mixkit', archive: 'Internet Archive', music: 'Internet Archive (netlabels)',
  archive78: 'Internet Archive (78 rpm)', mixkitmusic: 'Mixkit (music)', commons: 'Wikimedia Commons', freesound: 'Freesound',
};
/** Duur uit Internet Archive-metadata: seconden ("148.46") of "mm:ss" / "h:mm:ss". */
function parseLength(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (/^[\d.]+$/.test(s)) return Number(s);
  const parts = s.split(':').map(Number);
  if (parts.some(isNaN)) return 0;
  return parts.reduce((a, b) => a * 60 + b, 0);
}

/**
 * Turns a raw title (often a file name) into a readable one. Returns '' when nothing
 * sensible is left; the caller then falls back to the kind.
 */
export function prettyTitle(raw) {
  let t = String(raw || '');
  t = t.replace(/\.(mp3|ogg|oga|wav|flac|aiff?|m4a|opus)$/i, '');
  t = t.replace(/[_]+/g, ' ');
  t = t.replace(/\/\S*\d\S*/g, ' '); // padstukken als /2015.12.18llrec22
  t = t.replace(/^\d{2,8}(?=[A-Za-z])/, ''); // "103Dj Deem", "20081202december"
  t = t.replace(/^\s*[\[(]\s*[^\])]{1,24}[\])]\s*/, ''); // (Petroglyph) / [45rpm033] vooraan
  t = t.replace(/[\[\]]/g, ' ');
  t = t.replace(/,?\s*\b(?:19|20)\d{2}\b\s*\)?/g, ' '); // jaartallen
  t = t.replace(/\s-\.\s/g, ' – ');
  t = t.replace(/\b\d+\s?(?:kb|kbps|khz|bit)\b/gi, ' ');
  t = t.replace(/["“”]/g, '').replace(/\(\s*[a-z]\s*\)\s*/gi, ' '); // aanhalingstekens, (a) (b)
  t = t.replace(/\b(?:vbr|cbr|mp3|ogg|wav|flac|mono|stereo|remaster\w*|edit|loop|loopable|seamless)\b/gi, ' ');
  t = t.replace(/\b([A-Za-z]{2,12})\d{1,6}[A-Za-z]{0,2}\b/g, (m, w) => (/^(?:mp|dj|mc|ep|lp|cd|b|u)$/i.test(w) ? m : w)); // Peacock03, cyc037, Mix2, kosmo066Ep -> Peacock, cyc, Mix, kosmo
  t = t.replace(/\b\d+[A-Za-z]+\d+\b/g, ' '); // 45rpm033
  t = t.replace(/\b(?:cyc|rest|pcr|slc|vkrsnl|dwk|mixg|puls|s27|fd|ca|ar)\b/g, ' '); // losse labelcodes
  t = t.replace(/\(\s*[A-Za-z]{1,6}[-\s]?\d{1,4}[a-z]?\s*\)/g, ' '); // (AR88), (PCR018)
  t = t.replace(/\((?:restored|remastered|mono|stereo|live|album version|original mix)\)/gi, ' ');
  t = t.replace(/(?<!\bM)([a-z])(?=[A-Z][a-z])/g, '$1 ').replace(/\b([A-Z])(?=[A-Z][a-z])/g, '$1 '); // CamelCase -> separate words (not McMaster)
  t = t.replace(/\b([A-Za-z]{2,12})\d{1,6}[A-Za-z]{0,2}\b/g, (m, w) => (/^(?:mp|dj|mc|ep|lp|cd|b|u)$/i.test(w) ? m : w)); // again, after splitting CamelCase (kosmo066EpDarsick)
  t = t.replace(/\b\d{1,2}(?:[.:]\d{2})?\s?(?:am|pm)\b/gi, ' '); // tijden: 9.30am, 5am
  t = t.replace(/\bv\d+\b/gi, ' ').replace(/\bvol\.?\s*$/i, ''); // v2, "Vol." at the end
  t = t.replace(/\b\d{1,2}(?=[A-Z][a-z])/g, ''); // 1Teleport
  t = t.replace(/^(?:[A-Z][A-Z/]{2,}(?:\s+[A-Z][A-Z/]{2,})*\s*[:.]?\s*)+(?=[A-Z][a-z]|With\b)/, ''); // BBC-labels: "SUMMER: EARLY MORNING. With ..."
  t = t.replace(/^With\s+/, '');
  t = t.replace(/,\s*[A-Z]{3,6}\s*$/, ''); // ", FWCC"
  t = t.replace(/\b(?!(?:BBC|NASA|USA|UK|DJ|LP|EP|CD|OEBB|NS|TV|VVAA|RPM)\b)([A-Z])([A-Z]{3,})\b/g, (m, a, b) => a + b.toLowerCase()); // losse HOOFDLETTERWOORDEN
  t = t.replace(/\b([a-z]{2,})(?:-[a-z]{2,}){2,}\b/g, (m) => m.replace(/-/g, ' ')); // rbh-thunder-storm
  t = t.replace(/\b\d{1,2}[.:]\s?\d{1,2}[.:]\s?\d{2,4}\b/g, ' '); // 29. 4. 2015
  t = t.replace(/\b\d{1,4}[a-z]\b/gi, ' '); // tijdcodes als 0815a, 3b
  t = t.replace(/\b\S*\d{4,}\S*\b/g, ' '); // alles met vier of meer cijfers erin (20130801th, id's)
  t = t.replace(/\b(?:MCU|CU|LS|MS|WS)\b/g, ' '); // camerajargon in BBC-beschrijvingen
  t = t.replace(/\[[^\]]*\]/g, ' '); // [TFN021]
  t = t.replace(/\((?=[^)]*(?:\d|\btrack\b|\bversion\b|\bloop\b|\bremix\b|\bedit\b|\bmix\b|\bmaster\w*|\bfeat\b|\btake\b|\bpart\b|\bexcerpt\b|\bfull\b|\bhq\b|\bhd\b|\bstereo\b|\bmono\b|kbps|\bver\b|\bdemo\b))[^)]*\)/gi, ' ');
  t = t.replace(/\b(?:19|20)\d{2}[-._]?(?:0[1-9]|1[0-2])[-._]?(?:0[1-9]|[12]\d|3[01])(?:[-_ ]?\d{2,6})*\b/g, ' '); // datums
  t = t.replace(/\b\d{4,}\b/g, ' '); // lange nummers (id's, tijdcodes)
  t = t.replace(/\b\d{2,3}(?=[A-Z][a-z])/g, ''); // "112Eugene"
  t = t.replace(/^\s*(?:[a-z]{1,6}[-_ ]?\d{2,4}[a-z]?[\s._-]+)+/i, ''); // catalogcodes: pcr089, ca200, VKRSNL037
  t = t.replace(/^\s*(?:\d{1,3}[\s._)-]+)+/, ''); // 01 - , 205.
  t = t.replace(/\b(?:track|tr|nr|no|pt|part)\.?\s*\d+\b/gi, ' ');
  t = t.replace(/\b(?:sound|audio|sfx)\s+(?:collection|file|clip|recording|sample|effect)s?\b/gi, ' ');
  t = t.replace(/\b(?:royalty[- ]free|no copyright|copyright free|free download|download|hq|hd|4k|1080p|asmr|\d+\s*(?:hours?|hrs?|h|minutes?|mins?|min))\b/gi, ' ');
  t = t.replace(/\s*[-–—:|]\s*(?:various(?: artists?)?|unknown(?: artist)?|onbekend|v\.?a\.?|untitled)\s*$/i, '');
  t = t.replace(/^\s*(?:untitled|track|audio|sound|recording|file)\s*$/i, '');
  t = t.replace(/(?<![#\w])\d{1,3}(?![\w%'"])/g, ' '); // loose numbers (not #2, 10%, 3'10")
  if (/;/.test(t)) { // "A - Part 1; A - Part 2; B" -> unieke delen
    const parts = t.split(/\s*;\s*/).map((p) => p.replace(/\s*[-–]+\s*$/, '').trim()).filter(Boolean);
    t = parts.filter((p, i) => parts.findIndex((o) => o.toLowerCase() === p.toLowerCase()) === i).join(', ');
  }
  t = t.replace(/(?:\s*[-–—]\s*){2,}/g, ' – '); // "- -" -> één streepje
  t = t.replace(/\(\s*\)/g, ' ').replace(/(^|\s)[()](?=\s|$)/g, ' '); // lege of losse haakjes
  t = t.replace(/\s*[-–]\s*\.\s*/g, ' – '); // "Oplus -. Ruido"
  t = t.replace(/^\s*[-–—:|,;./]+\s*/, '').replace(/\s*[-–—:|,;./]+\s*$/, '').replace(/\s{2,}/g, ' ').trim(); // restjes vooraan en achteraan
  t = t.replace(/[-–—:|,;./]+\s*$/g, '').replace(/^\s*[-–—:|,;./]+/g, '');
  t = t.replace(/\s+([,.;:])/g, '$1').replace(/\s{2,}/g, ' ').trim();
  // Long descriptions (BBC): the first sensible sentence, no loose labels like "Day." or "Weather:"
  if (t.length > 70) {
    const parts = t.split(/(?<=[.!?])\s+|:\s+/).map((p) => p.trim()).filter(Boolean);
    const good = parts.filter((p) => p.split(/\s+/).length >= 3 && !/^(?:day|night|dawn|dusk|weather|interior|exterior|atmosphere|int|ext)\b/i.test(p));
    t = (good[0] || parts[0] || t).replace(/[.:,;]+$/, '');
    if (t.length > 72) { t = t.slice(0, 68); t = t.slice(0, t.lastIndexOf(' ') > 30 ? t.lastIndexOf(' ') : 68).replace(/[,;:.\s]+$/, '') + '…'; }
  }
  t = t.replace(/^(.{3,}?)\s*[–\-:|]\s*\1$/i, '$1'); // "Thomas Park - Thomas Park" -> één keer
  const letters = t.replace(/[^a-zA-ZÀ-ɏ]/g, '');
  if (letters.length > 6 && letters.replace(/[^A-ZÀ-Þ]/g, '').length / letters.length > 0.7) { // HOOFDLETTERS -> Titelvorm
    t = t.toLowerCase().replace(/(^|[\s(\-–])([a-zà-ÿ])/g, (m, pre, ch) => pre + ch.toUpperCase()).replace(/\b(And|Of|The|In|On|At|To|For|A|An|De|Het|Een|Van|En|Op|Bij|Met)\b/g, (w) => w.toLowerCase()).replace(/^./, (ch) => ch.toUpperCase());
  }
  if (letters.length < 4) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}
const NO_ARTIST = /^(?:various(?:\s+artists?)?|unknown(?:\s+artist)?|onbekend|v\.?a\.?|vvaa|untitled|anonymous)$/i;
/** Title for a library item: cleaned up, falling back to kind + source. */
export function displayTitle(entry) {
  if (entry.kind === 'muziek' || entry.kind === 'jazz' || entry.kind === 'kerst') {
    const parts = String(entry.rawTitle || entry.title).split(/\s+–\s+/);
    const artistRaw = parts.length > 1 ? parts.pop() : '';
    let a = prettyTitle(artistRaw); if (NO_ARTIST.test(a)) a = '';
    let n = prettyTitle(parts.join(' – '));
    if (a && n.toLowerCase().startsWith(a.toLowerCase() + ' ')) n = n.slice(a.length).replace(/^[\s–-]+/, ''); // no doubled artist
    if (a && n.toLowerCase().startsWith(a.toLowerCase())) n = prettyTitle(n.slice(a.length)) || n;
    n = n || prettyTitle(entry.tags?.[1]) || KIND_LABELS[entry.kind];
    if (a && n.toLowerCase() === a.toLowerCase()) a = '';
    return a ? `${n} – ${a}` : n;
  }
  let t = prettyTitle(entry.rawTitle || entry.title);
  if (t) { // dubbele delen weghalen: "Bos – Bos", "Naam – Naam – Track"; codes en compilatienamen eruit
    let parts = t.split(/\s+–\s+/).map((p) => p.trim()).filter(Boolean);
    parts = parts.filter((p, i) => parts.findIndex((o) => o.toLowerCase() === p.toLowerCase()) === i);
    if (parts.length > 1) {
      const junk = (p) => /^\S{11,}$/.test(p) || (/\d/.test(p) && !/\s/.test(p)) || NO_ARTIST.test(p) || /^various artists\b/i.test(p);
      const kept = parts.filter((p) => !junk(p));
      if (kept.length) parts = kept;
      // drop later parts that largely repeat the first one ("Album – Album track 3")
      const words = (p) => new Set(p.toLowerCase().split(/[^a-z0-9à-ÿ]+/).filter((w) => w.length > 2));
      const w0 = words(parts[0]);
      parts = parts.filter((p, i) => {
        if (i === 0 || !w0.size) return true;
        const wp = words(p); let shared = 0; for (const w of w0) if (wp.has(w)) shared++;
        const lowercaseOnly = !/[A-Z]/.test(p);
        return shared / w0.size < 0.5 && !(lowercaseOnly && shared > 0);
      });
      parts = parts.map((p, i) => (i ? p.replace(/^[a-z]{2,8}\s+(?=[A-Z])/, '').trim() : p)); // "kosmo Darsick" -> "Darsick"
    }
    return parts.join(' – ');
  }
  const hint = prettyTitle(entry.tags?.[0]);
  return hint && hint.toLowerCase() !== KIND_LABELS[entry.kind].toLowerCase() ? `${KIND_LABELS[entry.kind]}: ${hint.toLowerCase()}` : `${KIND_LABELS[entry.kind]} (${SOURCE_NAMES[entry.source] || entry.source})`;
}

// ---------------------------------------------------------------------------
// Hulpfuncties
// ---------------------------------------------------------------------------
function loadDotEnv() {
  const p = path.join(ROOT, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 48) || 'geluid';
const hash = (s) => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const clean = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const decodeEntities = (s) => clean(s).replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const first = (v) => (Array.isArray(v) ? v[0] : v);
const joinArr = (v) => (Array.isArray(v) ? v.join(', ') : v);
function licenseLabel(url) {
  if (!url) return 'Onbekend (zie bronpagina)';
  const m = String(url).match(/licenses\/([a-z-]+)\/([\d.]+)/i);
  if (m) return `CC ${m[1].toUpperCase()} ${m[2]}`;
  if (/publicdomain/i.test(url)) return 'Publiek domein (CC0)';
  return String(url);
}

class Fetcher {
  constructor(signal) { this.signal = signal; }
  check() { if (this.signal?.aborted) throw new Error('Stopped'); }
  async json(url, opts = {}, attempt = 0) {
    this.check();
    const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) }, signal: AbortSignal.any([AbortSignal.timeout(45000), this.signal].filter(Boolean)) });
    if ((res.status === 429 || res.status >= 500) && attempt < 3) { await sleep(4000 * (attempt + 1)); return this.json(url, opts, attempt + 1); }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  async text(url) {
    this.check();
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ' + UA }, signal: AbortSignal.any([AbortSignal.timeout(45000), this.signal].filter(Boolean)) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
  }
  async bytes(url, maxBytes) {
    this.check();
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 ' + UA }, signal: AbortSignal.any([AbortSignal.timeout(180000), this.signal].filter(Boolean)) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const len = Number(res.headers.get('content-length') || 0);
    if (len > maxBytes) throw new Error('te groot');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) throw new Error('te groot');
    return buf;
  }
}

// ---------------------------------------------------------------------------
// Kandidaten verzamelen per bron. Elke kandidaat:
// { source, id, title, text, url, ext, seconds, bytes?, license, author, sourceUrl, tags, kind? }
// ---------------------------------------------------------------------------
const BBC_QUERIES_QUICK = [
  'heavy rain', 'rain on window', 'light rain', 'thunder storm', 'wind', 'wind in trees', 'blizzard snow',
  'sea waves beach', 'waves on shingle', 'harbour', 'river', 'stream', 'waterfall', 'fountain',
  'fire crackling', 'log fire', 'dawn chorus', 'birds woodland', 'owl night', 'forest atmosphere', 'countryside atmosphere',
  'crickets night', 'frogs', 'jungle', 'city traffic', 'street atmosphere', 'railway station', 'train interior',
  'cafe atmosphere', 'restaurant', 'pub interior', 'crowd market', 'library', 'office atmosphere',
  'clock ticking', 'kitchen', 'church interior', 'cave', 'cathedral atmosphere', 'wind chimes', 'sheep meadow', 'cows farm',
  'airport atmosphere', 'ship engine', 'rain in forest', 'garden birds', 'seagulls', 'lake', 'park atmosphere',
];
const BBC_QUERIES_ALL = [
  'atmosphere', 'rain', 'thunder', 'storm', 'wind', 'snow', 'sea', 'waves', 'beach', 'harbour', 'river', 'stream', 'water', 'waterfall',
  'lake', 'fire', 'birds', 'dawn chorus', 'forest', 'woodland', 'countryside', 'jungle', 'night', 'insects', 'frogs', 'garden', 'park',
  'meadow', 'farm', 'sheep', 'cattle', 'traffic', 'city', 'street', 'station', 'train', 'airport', 'cafe', 'restaurant', 'pub',
  'market', 'crowd', 'library', 'office', 'church', 'cathedral', 'cave', 'interior', 'exterior', 'kitchen', 'clock', 'weather', 'moor', 'marsh',
];
async function collectBBC(f, mode, log) {
  const out = [];
  const queries = mode === 'all' ? BBC_QUERIES_ALL : BBC_QUERIES_QUICK;
  const seen = new Set();
  for (const q of queries) {
    let from = 0; let total = 0; let got = [];
    const pageSize = mode === 'all' ? 100 : 24;
    const maxPages = mode === 'all' ? 40 : 1;
    for (let page = 0; page < maxPages; page++) {
      let data;
      try {
        data = await f.json('https://sound-effects-api.bbcrewind.co.uk/api/sfx/search', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ criteria: { from, size: pageSize, query: q } }),
        });
      } catch (e) { if (e.message === 'Stopped') throw e; log(`  ! BBC "${q}": ${e.message}`); break; }
      total = data.total || 0;
      got.push(...(data.results || []));
      from += pageSize;
      if (from >= total || !(data.results || []).length) break;
      await sleep(250);
    }
    let cands = got.map((r) => ({ r, sec: (r.duration || 0) / 1000, bytes: Number(r.fileSizes?.mp3FileSize || 0) }))
      .filter((x) => x.sec >= (mode === 'all' ? 60 : 45) && x.bytes > 0 && !seen.has(x.r.id));
    cands.sort((a, b) => b.sec - a.sec);
    if (mode !== 'all') cands = cands.slice(0, 3);
    for (const { r, sec, bytes } of cands) {
      seen.add(r.id);
      out.push({
        source: 'bbc', id: `bbc:${r.id}`, title: clean(r.description).replace(/\.$/, ''),
        text: `${(r.tags || []).join(' ')} ${(r.categories || []).map((c) => c.className).join(' ')} ${r.additionalMetadata?.habitat || ''} ${q}`,
        url: `https://sound-effects-media.bbcrewind.co.uk/mp3/${r.id}.mp3`, ext: 'mp3', seconds: sec, bytes,
        license: 'BBC RemArc Licence (persoonlijk, educatief en niet-commercieel gebruik)', author: 'BBC',
        sourceUrl: `https://sound-effects.bbcrewind.co.uk/search?q=${r.id}`, tags: r.tags || [],
      });
    }
    log(`BBC "${q}": ${got.length} results, ${cands.length} candidates`);
    await sleep(200);
  }
  return out;
}

const MIXKIT_CATS = ['ambience', 'rain', 'forest', 'sea', 'ocean', 'fire', 'wind', 'thunder', 'storm', 'night', 'rivers', 'waterfall', 'waves', 'crickets', 'city', 'office', 'restaurant', 'bar', 'white-noise', 'crowd', 'beach', 'jungle', 'morning', 'mountain', 'public-places', 'traffic', 'train', 'water', 'bird', 'nature', 'desert', 'safari', 'scary-woods', 'swell', 'lightning', 'splash', 'garden', 'hall', 'church', 'school', 'supermarket', 'airport', 'kitchen', 'bathroom', 'bedroom', 'clock', 'fan', 'hum', 'insect', 'farm', 'animals', 'drone', 'static', 'electricity'];
async function collectMixkit(f, mode, log) {
  const out = []; const seen = new Set();
  for (const cat of MIXKIT_CATS) {
    const items = [];
    const maxPages = mode === 'all' ? 12 : 1;
    for (let page = 1; page <= maxPages; page++) {
      let html;
      try { html = await f.text(`https://mixkit.co/free-sound-effects/${cat}/${page > 1 ? `?page=${page}` : ''}`); } catch (e) { if (e.message === 'Stopped') throw e; if (page === 1) log(`  ! Mixkit ${cat}: ${e.message}`); break; }
      const re = /data-audio-player-preview-url-value="([^"]+)"[\s\S]*?data-audio-player-item-id-value="(\d+)"[\s\S]*?item-grid-card__title"[^>]*>\s*([^<]+?)\s*<[\s\S]*?data-test-id="duration">\s*([\d:]+)\s*</g;
      let m; let n = 0;
      while ((m = re.exec(html))) {
        const [, url, id, title, dur] = m;
        const parts = dur.split(':').map(Number);
        const sec = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
        if (!seen.has(id)) { seen.add(id); items.push({ url, id, title: decodeEntities(title), sec }); }
        n++;
      }
      if (!n || !html.includes(`?page=${page + 1}"`)) break;
      await sleep(300);
    }
    let picked = items.filter((i) => i.sec >= 25).sort((a, b) => b.sec - a.sec);
    if (mode !== 'all') picked = picked.slice(0, 5);
    for (const i of picked) {
      out.push({
        source: 'mixkit', id: `mixkit:${i.id}`, title: i.title, text: `${i.title} ${cat}`, url: i.url, ext: 'mp3', seconds: i.sec,
        license: 'Mixkit Sound Effects Free License', author: 'Mixkit', sourceUrl: `https://mixkit.co/free-sound-effects/${cat}/`, tags: [cat],
      });
    }
    log(`Mixkit ${cat}: ${items.length} found, ${picked.length} candidates`);
    await sleep(200);
  }
  return out;
}

// Mixkit stock music: full mp3s, per genre into a kind.
const MIXKIT_MUSIC = {
  muziek: ['ambient', 'atmospheres', 'chillout', 'downtempo', 'drone-music', 'new-age', 'minimalism', 'easy-listening', 'underscore', 'dream-pop', 'classical'],
  jazz: ['jazz', 'nu-jazz', 'acid-jazz', 'jazz-blues', 'jazz-funk', 'swing', 'bossa-nova', 'lounge', 'lo-fi-beats', 'kitsch-lounge'],
};
async function collectMixkitMusic(f, mode, log) {
  const out = []; const seen = new Set();
  const pages = [];
  for (const [kind, cats] of Object.entries(MIXKIT_MUSIC)) for (const cat of cats) pages.push([kind, `https://mixkit.co/free-stock-music/${cat}/`, cat]);
  pages.push(['kerst', 'https://mixkit.co/free-stock-music/tag/christmas/', 'christmas']);
  for (const [kind, base, cat] of pages) {
    let n = 0;
    for (let page = 1; page <= (mode === 'all' ? 6 : 1); page++) {
      let html;
      try { html = await f.text(`${base}${page > 1 ? `?page=${page}` : ''}`); } catch (e) { if (e.message === 'Stopped') throw e; if (page === 1) log(`  ! Mixkit muziek ${cat}: ${e.message}`); break; }
      const re = /data-audio-player-preview-url-value="([^"]+)"[\s\S]*?data-audio-player-item-id-value="(\d+)"[\s\S]*?item-grid-card__title"[^>]*>\s*([^<]+?)\s*<[\s\S]*?(?:item-grid-music-preview__author"[^>]*>\s*(?:by\s+)?([^<]+?)\s*<[\s\S]*?)?data-test-id="duration">\s*([\d:]+)\s*</g;
      let m; let found = 0;
      while ((m = re.exec(html))) {
        const [, url, id, title, author, dur] = m; found++;
        if (seen.has(id)) continue; seen.add(id);
        const parts = dur.split(':').map(Number); const sec = parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0];
        if (sec < 60) continue;
        const a = decodeEntities(author || '');
        out.push({
          source: 'mixkitmusic', id: `mixkitmusic:${id}`, title: a ? `${decodeEntities(title)} – ${a}` : decodeEntities(title), text: `${title} ${cat}`, kind,
          url, ext: 'mp3', seconds: sec, license: 'Mixkit Stock Music Free License', author: a, sourceUrl: base, tags: [kind, cat],
        });
        n++;
      }
      if (!found || !html.includes(`?page=${page + 1}"`)) break;
      await sleep(300);
    }
    log(`Mixkit muziek ${cat}: ${n} candidates`);
    await sleep(200);
  }
  return out;
}

const ARCHIVE_QUERIES = ['rain', 'thunder', 'wind', 'sea waves', 'ocean', 'river stream', 'waterfall', 'forest', 'birds', 'night crickets', 'frogs', 'city street', 'traffic', 'train', 'cafe', 'market', 'church', 'fire', 'snow', 'harbour', 'jungle', 'garden', 'lake', 'beach', 'countryside', 'village', 'insects', 'storm', 'fountain', 'park'];
async function archiveFiles(f, identifier) {
  const meta = await f.json(`https://archive.org/metadata/${identifier}`);
  const files = (meta.files || []).filter((x) => /mp3/i.test(x.format || '') || /\.mp3$/i.test(x.name) || /ogg/i.test(x.format || ''));
  return { meta: meta.metadata || {}, files };
}
/** Runs fn over items with at most n at a time. */
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}
async function collectArchive(f, mode, log, maxFile) {
  const out = []; const seen = new Set();
  // Four searches at a time: the metadata calls per item are slow.
  await pool(ARCHIVE_QUERIES, 4, async (q) => {
    const query = `(subject:("field recording" OR soundscape OR ambient OR "nature sounds" OR "ambient sounds") AND mediatype:audio AND title:(${q}))`;
    let data;
    try {
      data = await f.json(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=licenseurl&fl[]=creator&fl[]=description&sort[]=downloads+desc&rows=${mode === 'all' ? 60 : 12}&output=json`);
    } catch (e) { if (e.message === 'Stopped') throw e; log(`  ! Archive "${q}": ${e.message}`); return; }
    const docs = (data.response?.docs || []).filter((d) => d.licenseurl && !seen.has(d.identifier));
    let taken = 0;
    for (const d of docs) {
      if (mode !== 'all' && taken >= 2) break;
      if (seen.has(d.identifier)) continue;
      seen.add(d.identifier);
      let info;
      try { info = await archiveFiles(f, d.identifier); } catch (e) { if (e.message === 'Stopped') throw e; continue; }
      const files = info.files
        .map((x) => ({ x, sec: parseLength(x.length), bytes: Number(x.size || 0) }))
        .filter((x) => x.bytes > 0 && x.bytes <= maxFile && x.sec >= 60)
        .sort((a, b) => b.sec - a.sec).slice(0, mode === 'all' ? 3 : 1);
      const title = clean(first(d.title));
      for (const { x, sec, bytes } of files) {
        out.push({
          source: 'archive', id: `archive:${d.identifier}/${x.name}`, title: files.length > 1 ? `${title} – ${clean(x.title || x.name.replace(/\.[a-z0-9]+$/i, ''))}` : title,
          text: `${title} ${q} ${clean(joinArr(d.description)).slice(0, 400)}`,
          url: `https://archive.org/download/${d.identifier}/${encodeURIComponent(x.name)}`, ext: /ogg/i.test(x.name) ? 'ogg' : 'mp3',
          seconds: sec, bytes, license: licenseLabel(d.licenseurl), author: clean(joinArr(d.creator)),
          sourceUrl: `https://archive.org/details/${d.identifier}`, tags: [q],
        });
        taken++;
      }
      await sleep(150);
    }
    log(`Archive "${q}": ${docs.length} items, ${taken} candidates`);
  });
  return out;
}
/** Netlabel albums on the Internet Archive: the best mp3 tracks per album. */
async function collectNetlabels(f, mode, log, maxFile, { query, kind, rows, perAlbum, minSec = 120, maxSec = 900, excludeTitle = /$^/ }) {
  const out = [];
  let data;
  try {
    data = await f.json(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=licenseurl&fl[]=creator&fl[]=subject&sort[]=downloads+desc&rows=${rows}&output=json`);
  } catch (e) { log(`  ! netlabels (${kind}): ${e.message}`); return out; }
  const docs = (data.response?.docs || []).filter((d) => d.licenseurl && !excludeTitle.test(`${first(d.title)} ${joinArr(d.subject)}`));
  for (const d of docs) {
    let info;
    try { info = await archiveFiles(f, d.identifier); } catch (e) { if (e.message === 'Stopped') throw e; continue; }
    const seen = new Set();
    const tracks = info.files
      .filter((x) => /\.mp3$/i.test(x.name)) // mp3 boven ogg van dezelfde track
      .map((x) => ({ x, sec: parseLength(x.length), bytes: Number(x.size || 0) }))
      .filter((x) => x.bytes > 0 && x.bytes <= maxFile && x.sec >= minSec && x.sec <= maxSec)
      .filter((x) => { const k = x.x.name.replace(/\.[a-z0-9]+$/i, ''); if (seen.has(k)) return false; seen.add(k); return true; })
      .sort((a, b) => b.sec - a.sec).slice(0, perAlbum);
    const album = clean(first(d.title));
    const artist = clean(joinArr(d.creator)) || clean(joinArr(info.meta.creator)) || '';
    for (const { x, sec, bytes } of tracks) {
      const name = clean(x.title || x.name.replace(/\.(mp3|ogg)$/i, '').replace(/^\d+[\s._-]+/, '').replace(/[_-]+/g, ' '));
      out.push({
        source: 'music', id: `music:${d.identifier}/${x.name}`, title: artist ? `${name} – ${artist}` : name, text: album, kind,
        url: `https://archive.org/download/${d.identifier}/${encodeURIComponent(x.name)}`, ext: 'mp3',
        seconds: sec, bytes, license: licenseLabel(d.licenseurl), author: artist,
        sourceUrl: `https://archive.org/details/${d.identifier}`, tags: [kind, album],
      });
    }
    await sleep(250);
  }
  log(`Netlabels (${KIND_LABELS[kind]}): ${docs.length} albums, ${out.length} tracks`);
  return out;
}
const HARSH = /\b(noise|industrial|experimental|harsh|glitch|drone|dark ambient|power electronics|breakcore|hardcore|gabber|metal|punk|grind\w*|techno|trance|dubstep|rap)\b/i;
async function collectMusic(f, mode, log, maxFile) {
  return collectNetlabels(f, mode, log, maxFile, {
    kind: 'muziek', rows: mode === 'all' ? 160 : 40, perAlbum: mode === 'all' ? 3 : 2, excludeTitle: HARSH,
    query: 'collection:netlabels AND mediatype:audio AND subject:(ambient) AND subject:(chillout OR downtempo OR "new age" OR relax* OR calm OR piano OR meditation OR sleep OR atmospheric OR cinematic OR "easy listening" OR "space music" OR dreamy OR soundscape) AND NOT subject:(noise OR industrial OR experimental OR "dark ambient" OR glitch OR harsh OR metal OR punk OR techno OR trance OR dubstep)',
  });
}
/** Great 78 Project: gerestaureerde 78-toerenplaten (Internet Archive, collectie georgeblood). */
async function collect78(f, mode, log, maxFile, { subject, kind, rows }) {
  const out = [];
  const query = `collection:georgeblood AND mediatype:audio AND subject:(${subject})`;
  let data;
  try {
    data = await f.json(`https://archive.org/advancedsearch.php?q=${encodeURIComponent(query)}&fl[]=identifier&fl[]=title&fl[]=creator&fl[]=date&sort[]=downloads+desc&rows=${rows}&output=json`);
  } catch (e) { log(`  ! 78 rpm (${kind}): ${e.message}`); return out; }
  const docs = data.response?.docs || [];
  for (const d of docs) {
    const title = clean(first(d.title));
    if (/\b(speech|talk|comedy|monologue|sermon|poem|story|reading)\b/i.test(title)) continue;
    let info;
    try { info = await archiveFiles(f, d.identifier); } catch (e) { if (e.message === 'Stopped') throw e; continue; }
    const file = info.files
      .filter((x) => /\.mp3$/i.test(x.name))
      .map((x) => ({ x, sec: parseLength(x.length), bytes: Number(x.size || 0) }))
      .filter((x) => x.bytes > 0 && x.bytes <= maxFile && x.sec >= 90)
      .sort((a, b) => (/restored/i.test(b.x.name) ? 1 : 0) - (/restored/i.test(a.x.name) ? 1 : 0) || b.sec - a.sec)[0];
    if (!file) continue;
    const artist = clean(first(d.creator) || first(info.meta.creator) || '').split(/[,;]/)[0].trim();
    out.push({
      source: 'archive78', id: `archive78:${d.identifier}`, title: artist ? `${title} – ${artist}` : title, text: subject, kind,
      url: `https://archive.org/download/${d.identifier}/${encodeURIComponent(file.x.name)}`, ext: 'mp3',
      seconds: file.sec, bytes: file.bytes, license: `Historische 78-toerenplaat${d.date ? ' (' + String(d.date).slice(0, 4) + ')' : ''}, Great 78 Project`,
      author: artist, sourceUrl: `https://archive.org/details/${d.identifier}`, tags: [kind, '78rpm'],
    });
    await sleep(200);
  }
  log(`78 rpm (${KIND_LABELS[kind]}): ${docs.length} records, ${out.length} candidates`);
  return out;
}
async function collectJazz(f, mode, log, maxFile) {
  const a = await collect78(f, mode, log, maxFile, { subject: 'jazz OR swing OR "big band" OR bossa', kind: 'jazz', rows: mode === 'all' ? 120 : 20 });
  const b = await collectNetlabels(f, mode, log, maxFile, {
    kind: 'jazz', rows: mode === 'all' ? 60 : 12, perAlbum: mode === 'all' ? 3 : 2, excludeTitle: HARSH,
    query: 'collection:netlabels AND mediatype:audio AND subject:(jazz OR "nu jazz" OR "nu-jazz" OR lounge OR "bossa nova" OR swing OR "lo-fi" OR lofi) AND NOT subject:(noise OR industrial OR experimental OR metal OR punk OR techno OR rap)',
  });
  return [...a, ...b];
}
/** Middeleeuwse kerkmuziek: gregoriaans en Hildegard von Bingen, vaak publiek domein of CC. */
async function collectGregoriaans(f, mode, log, maxFile) {
  const a = await collect78(f, mode, log, maxFile, { subject: 'gregorian OR chant OR "sacred music" OR liturgical', kind: 'gregoriaans', rows: mode === 'all' ? 60 : 12 });
  const b = await collectNetlabels(f, mode, log, maxFile, {
    kind: 'gregoriaans', rows: mode === 'all' ? 70 : 15, perAlbum: mode === 'all' ? 4 : 2, minSec: 60, maxSec: 1200,
    excludeTitle: /\b(librivox|sermon|lecture|reading|noise|metal|punk|techno)\b/i,
    query: 'mediatype:audio AND (subject:("gregorian chant") OR subject:(plainchant) OR subject:("sacred music" AND medieval) OR subject:(hildegard) OR title:("gregorian chant") OR title:(hildegard)) AND NOT collection:(librivoxaudio OR podcasts) AND NOT subject:(audiobook OR sermon OR lecture)',
  });
  return [...a, ...b];
}
async function collectKerst(f, mode, log, maxFile) {
  const a = await collect78(f, mode, log, maxFile, { subject: 'christmas OR xmas OR carol OR "christmas carols"', kind: 'kerst', rows: mode === 'all' ? 90 : 20 });
  const b = await collectNetlabels(f, mode, log, maxFile, {
    kind: 'kerst', rows: mode === 'all' ? 40 : 10, perAlbum: mode === 'all' ? 4 : 2, minSec: 90, excludeTitle: /\b(librivox|poetry|poem|reading|hymns? read|noise|industrial|harsh|metal|punk)\b/i,
    query: 'mediatype:audio AND subject:(christmas OR xmas OR "christmas music" OR carols) AND (collection:netlabels OR subject:(instrumental OR ambient OR piano OR "music box" OR lofi OR "lo-fi" OR jazz)) AND NOT collection:(librivoxaudio OR podcasts OR georgeblood) AND NOT subject:(poetry OR audiobook OR sermon)',
  });
  return [...a, ...b];
}

const COMMONS_QUERIES = ['rain ambience', 'rain sound', 'thunder', 'wind sound', 'ocean waves', 'sea sound', 'birdsong', 'birds singing', 'forest ambience', 'forest sound', 'stream water', 'river sound', 'fireplace crackling', 'crickets night', 'city traffic ambience', 'street ambience', 'cafe ambience', 'waterfall', 'frogs', 'church bells ambience', 'train station ambience', 'field recording', 'soundscape', 'nature sound', 'wind chimes'];
async function collectCommons(f, mode, log, maxFile) {
  const out = []; const seen = new Set();
  for (const q of COMMONS_QUERIES) {
    let data;
    try {
      data = await f.json(`https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent('filetype:audio ' + q)}&srnamespace=6&srlimit=${mode === 'all' ? 50 : 15}&format=json`);
    } catch (e) { if (e.message === 'Stopped') throw e; log(`  ! Commons "${q}": ${e.message}`); continue; }
    const titles = (data.query?.search || []).map((s) => s.title).filter((t) => /\.(ogg|oga|mp3)$/i.test(t));
    let n = 0;
    for (let i = 0; i < titles.length; i += 20) {
      let info;
      try {
        info = await f.json(`https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url|size|mime|extmetadata&titles=${encodeURIComponent(titles.slice(i, i + 20).join('|'))}&format=json`);
      } catch (e) { if (e.message === 'Stopped') throw e; continue; }
      for (const p of Object.values(info.query?.pages || {})) {
        const ii = p.imageinfo?.[0]; if (!ii || seen.has(p.pageid)) continue;
        const m = ii.extmetadata || {}; const mime = ii.mime || '';
        const ext = /mpeg|mp3/.test(mime) ? 'mp3' : /ogg/.test(mime) ? 'ogg' : null;
        if (!ext || ii.size < 400000 || ii.size > maxFile) continue;
        seen.add(p.pageid);
        const title = p.title.replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ');
        out.push({
          source: 'commons', id: `commons:${p.pageid}`, title, text: `${title} ${clean(m.ImageDescription?.value).slice(0, 300)} ${q}`, url: ii.url.split('?')[0], ext,
          bytes: ii.size, license: clean(m.LicenseShortName?.value) || 'Zie bronpagina', author: clean(m.Artist?.value).slice(0, 80),
          sourceUrl: `https://commons.wikimedia.org/?curid=${p.pageid}`, tags: [q],
        });
        n++;
      }
      await sleep(900);
    }
    log(`Commons "${q}": ${titles.length} files, ${n} candidates`);
  }
  return out;
}

const FREESOUND_QUERIES = ['rain ambience', 'thunderstorm', 'wind ambience', 'ocean waves', 'river stream', 'fireplace', 'forest birds', 'night crickets', 'city ambience', 'cafe ambience', 'library ambience', 'snow wind', 'jungle ambience', 'fountain', 'drone ambient', 'field recording', 'soundscape', 'nature ambience'];
async function collectFreesound(f, mode, log) {
  const key = process.env.FREESOUND_KEY;
  if (!key) { log('Freesound skipped (no FREESOUND_KEY in .env)'); return []; }
  const out = []; const seen = new Set();
  for (const q of FREESOUND_QUERIES) {
    for (let page = 1; page <= (mode === 'all' ? 4 : 1); page++) {
      let data;
      try {
        data = await f.json(`https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(q)}&filter=${encodeURIComponent('duration:[60 TO 900] license:("Creative Commons 0" OR "Attribution")')}&fields=id,name,previews,license,username,duration,tags,url&sort=rating_desc&page_size=${mode === 'all' ? 50 : 6}&page=${page}&token=${key}`);
      } catch (e) { if (e.message === 'Stopped') throw e; log(`  ! Freesound "${q}": ${e.message}`); break; }
      for (const r of data.results || []) {
        if (seen.has(r.id)) continue; seen.add(r.id);
        out.push({
          source: 'freesound', id: `freesound:${r.id}`, title: clean(r.name).replace(/\.(wav|mp3|ogg|flac|aif+)$/i, ''), text: `${r.name} ${(r.tags || []).join(' ')} ${q}`,
          url: r.previews['preview-hq-mp3'], ext: 'mp3', seconds: r.duration, license: licenseLabel(r.license), author: r.username, sourceUrl: r.url, tags: r.tags || [],
        });
      }
      if (!data.next) break;
      await sleep(300);
    }
  }
  log(`Freesound: ${out.length} candidates`);
  return out;
}

// ---------------------------------------------------------------------------
// Bibliotheek (library.json) beheren
// ---------------------------------------------------------------------------
export function loadLibrary(dir) {
  const libPath = path.join(dir, 'library.json');
  let lib;
  try { lib = JSON.parse(fs.readFileSync(libPath, 'utf8')); } catch { lib = { generated: null, sounds: [] }; }
  lib.sounds = (lib.sounds || []).filter((s) => fs.existsSync(path.join(dir, s.file)));
  for (const s of lib.sounds) { // titels van oudere versies opschonen
    if (!s.rawTitle) s.rawTitle = s.title;
    s.title = displayTitle(s);
  }
  lib.kinds = KIND_LABELS; lib.moods = MOOD_LABELS;
  return lib;
}
export function saveLibrary(dir, lib) {
  lib.generated = new Date().toISOString();
  lib.kinds = KIND_LABELS; lib.moods = MOOD_LABELS;
  lib.sounds.sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title));
  fs.mkdirSync(path.join(dir, 'sounds'), { recursive: true });
  const tmp = path.join(dir, 'library.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(lib, null, 1));
  fs.renameSync(tmp, path.join(dir, 'library.json'));
}

// ---------------------------------------------------------------------------
// Hoofdroutine
// ---------------------------------------------------------------------------
export async function runFetch(opts = {}) {
  const {
    dir = path.join(ROOT, 'public'), mode = 'quick', only = null, dry = false, signal = null,
    log = console.log, progress = () => {},
  } = opts;
  loadDotEnv();
  const maxBytes = (opts.maxGB ?? (mode === 'all' ? 8 : 0.5)) * 1024 * MB;
  const maxFile = (mode === 'all' ? 12 : 9) * MB;
  const f = new Fetcher(signal);
  const lib = loadLibrary(dir);
  const known = new Map(lib.sounds.map((s) => [s.id, s]));
  let totalBytes = lib.sounds.reduce((a, s) => a + (s.bytes || 0), 0);
  const perSourceQuick = { bbc: 170 * MB, mixkit: 70 * MB, archive: 80 * MB, music: 120 * MB, archive78: 100 * MB, mixkitmusic: 120 * MB, commons: 60 * MB, freesound: 80 * MB, gregoriaans: 80 * MB };
  if (opts.drop?.length) { // throw kinds away (to fetch music again, more strictly, for instance)
    const dropped = lib.sounds.filter((s) => opts.drop.includes(s.kind));
    for (const s of dropped) { try { fs.unlinkSync(path.join(dir, s.file)); } catch {} }
    lib.sounds = lib.sounds.filter((s) => !opts.drop.includes(s.kind));
    for (const s of dropped) known.delete(s.id);
    totalBytes = lib.sounds.reduce((a, s) => a + (s.bytes || 0), 0);
    saveLibrary(dir, lib);
    log(`${dropped.length} sounds of kind ${opts.drop.join(', ')} removed.`);
  }
  const usedPerSource = {};
  for (const s of lib.sounds) usedPerSource[s.source] = (usedPerSource[s.source] || 0) + (s.bytes || 0);
  const enabled = (s) => !only || only.includes(s);

  log(`Hushfall: fetching sounds (${mode === 'all' ? 'everything' : 'quick selection'}${dry ? ', dry run' : ''}). Library: ${lib.sounds.length} sounds, ${(totalBytes / MB).toFixed(0)} MB. Limit ${(maxBytes / 1024 / MB).toFixed(1)} GB.`);
  progress({ phase: 'zoeken', done: 0, total: 0, added: 0, count: lib.sounds.length, bytes: totalBytes });

  // Fase 1: candidates verzamelen
  const collectors = [
    ['bbc', () => collectBBC(f, mode, log)], ['mixkit', () => collectMixkit(f, mode, log)], ['archive', () => collectArchive(f, mode, log, maxFile)],
    ['music', () => collectMusic(f, mode, log, maxFile)], ['jazz', () => collectJazz(f, mode, log, maxFile)], ['kerst', () => collectKerst(f, mode, log, maxFile)],
    ['gregoriaans', () => collectGregoriaans(f, mode, log, maxFile)],
    ['mixkitmusic', () => collectMixkitMusic(f, mode, log)],
    ['commons', () => collectCommons(f, mode, log, maxFile)], ['freesound', () => collectFreesound(f, mode, log)],
  ];
  const collectorNames = { bbc: 'BBC Sound Effects', mixkit: 'Mixkit', archive: 'Internet Archive: veldopnames', music: 'Ambient muziek (netlabels)', jazz: 'Jazz (78 toeren en netlabels)', kerst: 'Kerst (78 toeren en netlabels)', gregoriaans: 'Middeleeuwse kerkmuziek', mixkitmusic: 'Mixkit muziek', commons: 'Wikimedia Commons', freesound: 'Freesound' };
  let candidates = [];
  const active = collectors.filter(([name]) => enabled(name));
  let sourcesDone = 0;
  const report = () => progress({ phase: 'zoeken', done: 0, total: 0, added: 0, count: lib.sounds.length, bytes: totalBytes, sourcesDone, sourcesTotal: active.length, found: candidates.length });
  // Search every source at once (different servers), which saves a lot of waiting.
  await Promise.all(active.map(async ([name, fn]) => {
    log(`== ${collectorNames[name]}: search started ==`);
    try { const found = await fn(); candidates.push(...found); log(`== ${collectorNames[name]}: ${found.length} candidates ==`); }
    catch (e) { if (e.message === 'Stopped') throw e; log(`!! ${name} aborted: ${e.message}`); }
    sourcesDone++; report();
  }));

  // Classificeren, dedupliceren en groeperen per soort
  const byKind = new Map();
  let skipped = 0;
  const seenIds = new Set();
  for (const c of candidates) {
    if (seenIds.has(c.id) || known.has(c.id)) { skipped++; continue; }
    seenIds.add(c.id);
    const cls = classify(c.title, c.kind) || classify(`${c.title} ${c.text || ''}`, c.kind);
    if (!cls) { skipped++; continue; }
    if (c.bytes && c.bytes > maxFile) { skipped++; continue; }
    c.cls = cls;
    if (!byKind.has(cls.kind)) byKind.set(cls.kind, []);
    byKind.get(cls.kind).push(c);
  }
  // Within a kind: alternate sources, longest first.
  for (const [kind, list] of byKind) {
    const groups = new Map();
    for (const c of list.sort((a, b) => (b.seconds || 0) - (a.seconds || 0))) {
      if (!groups.has(c.source)) groups.set(c.source, []);
      groups.get(c.source).push(c);
    }
    const merged = []; const iters = [...groups.values()];
    while (iters.some((g) => g.length)) for (const g of iters) if (g.length) merged.push(g.shift());
    byKind.set(kind, merged);
  }
  const queue = [];
  const kindLists = [...byKind.values()];
  while (kindLists.some((l) => l.length)) for (const l of kindLists) if (l.length) queue.push(l.shift());
  log(`
${queue.length} new candidates (${skipped} skipped). Per kind: ${[...byKind.keys()].map((k) => KIND_LABELS[k]).join(', ')}`);
  if (dry) {
    for (const c of queue.slice(0, 400)) log(`  [${c.cls.kind}] ${c.source} | ${c.title.slice(0, 70)} (${c.seconds ? Math.round(c.seconds) + 's' : '?'})`);
    return { added: 0, skipped, failed: 0, count: lib.sounds.length, bytes: totalBytes, candidates: queue.length };
  }

  // Phase 2: balanced downloading with 3 parallel downloads
  const stats = { added: 0, skipped, failed: 0 };
  let index = 0; let done = 0; let stop = false;
  const soundsDir = path.join(dir, 'sounds');
  fs.mkdirSync(soundsDir, { recursive: true });
  progress({ phase: 'downloaden', done: 0, total: queue.length, added: 0, count: lib.sounds.length, bytes: totalBytes });
  const worker = async () => {
    while (!stop && index < queue.length) {
      const c = queue[index++];
      f.check();
      if (totalBytes + (c.bytes || 3 * MB) > maxBytes) { stop = true; break; }
      if (mode !== 'all' && (usedPerSource[c.source] || 0) + (c.bytes || 2 * MB) > perSourceQuick[c.source]) { stats.skipped++; done++; continue; }
      const file = `${c.source}-${slug(c.title)}-${hash(c.id)}.${c.ext}`;
      try {
        const buf = await f.bytes(c.url, maxFile);
        if (buf.length < 20000) throw new Error('file too small');
        fs.writeFileSync(path.join(soundsDir, file), buf);
        const entry = {
          id: c.id, title: c.title, rawTitle: c.title, source: c.source, sourceName: SOURCE_NAMES[c.source], sourceUrl: c.sourceUrl,
          license: c.license, author: c.author || '', seconds: c.seconds ? Math.round(c.seconds) : null,
          bytes: buf.length, file: `sounds/${file}`, kind: c.cls.kind, moods: c.cls.moods, tags: (c.tags || []).slice(0, 12),
        };
        entry.title = displayTitle(entry);
        lib.sounds.push(entry); known.set(c.id, entry);
        totalBytes += buf.length; usedPerSource[c.source] = (usedPerSource[c.source] || 0) + buf.length;
        stats.added++;
        log(`  + [${c.cls.kind}] ${c.title.slice(0, 70)} (${(buf.length / MB).toFixed(1)} MB, ${SOURCE_NAMES[c.source]})`);
        if (stats.added % 5 === 0) saveLibrary(dir, lib);
      } catch (e) {
        if (e.message === 'Stopped') throw e;
        stats.failed++;
        log(`  ! ${c.title.slice(0, 50)}: ${e.message}`);
      }
      done++;
      progress({ phase: 'downloaden', done, total: queue.length, added: stats.added, count: lib.sounds.length, bytes: totalBytes });
    }
  };
  try {
    await Promise.all(Array.from({ length: 6 }, worker)); // zes downloads tegelijk
  } finally {
    saveLibrary(dir, lib);
  }
  if (stop) log(`Disk limit of ${(maxBytes / 1024 / MB).toFixed(1)} GB reached.`);
  const perKind = {};
  for (const s of lib.sounds) perKind[s.kind] = (perKind[s.kind] || 0) + 1;
  log(`
Done. Added: ${stats.added}, skipped: ${stats.skipped}, failed: ${stats.failed}. Total: ${lib.sounds.length} sounds, ${(totalBytes / MB).toFixed(0)} MB.`);
  log('Per kind: ' + Object.entries(perKind).map(([k, n]) => `${KIND_LABELS[k]} ${n}`).join(', '));
  progress({ phase: 'klaar', done, total: queue.length, added: stats.added, count: lib.sounds.length, bytes: totalBytes });
  return { ...stats, count: lib.sounds.length, bytes: totalBytes };
}

// CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)(?:=(.*))?$/); return m ? [m[1], m[2] ?? true] : [a, true]; }));
  const ac = new AbortController();
  process.on('SIGINT', () => { console.log('\nStopping...'); ac.abort(); });
  if (args.retitle) { // alleen titels opschonen
    const dir = args.dir ? path.resolve(String(args.dir)) : path.join(ROOT, 'public');
    const lib = loadLibrary(dir); saveLibrary(dir, lib);
    console.log(`${lib.sounds.length} titles cleaned up.`); for (const s of lib.sounds.slice(0, 40)) console.log(`  ${s.rawTitle}  ->  ${s.title}`);
    process.exit(0);
  }
  runFetch({
    dir: args.dir ? path.resolve(String(args.dir)) : undefined,
    mode: args.all ? 'all' : 'quick',
    maxGB: args['max-gb'] ? Number(args['max-gb']) : undefined,
    only: args.only ? String(args.only).split(',') : null,
    drop: args.drop ? String(args.drop).split(',') : null,
    dry: !!args.dry, signal: ac.signal,
  }).catch((e) => { console.error(e.message === 'Stopped' ? 'Stopped.' : e); process.exit(e.message === 'Stopped' ? 0 : 1); });
}
