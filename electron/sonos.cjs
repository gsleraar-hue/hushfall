// Sonos over het lokale netwerk, zonder account of cloud: spelers vinden met SSDP en aansturen
// met de UPnP-diensten die elke speler zelf aanbiedt op poort 1400.
const dgram = require('node:dgram');
const http = require('node:http');
const os = require('node:os');

const SSDP_ADDR = '239.255.255.250';
const SSDP_PORT = 1900;
const CTRL_PORT = 1400;

/** Het IPv4-adres van deze computer op het netwerk (dat adres zet de speaker in zijn stream-URL). */
function localAddress() {
  const nets = os.networkInterfaces();
  const kandidaten = [];
  for (const lijst of Object.values(nets)) for (const i of lijst || []) {
    if (i.family === 'IPv4' && !i.internal) kandidaten.push(i.address);
  }
  // Voorkeur voor gewone thuisnetwerken boven virtuele adapters (Docker, WSL, VPN).
  return kandidaten.find((a) => /^192\.168\./.test(a)) || kandidaten.find((a) => /^10\./.test(a)) || kandidaten[0] || '127.0.0.1';
}

function request({ host, port = CTRL_PORT, path: p, method = 'GET', headers = {}, body = null, timeout = 4000 }) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host, port, path: p, method, headers, timeout }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const tag = (xml, naam) => { const m = xml.match(new RegExp(`<${naam}[^>]*>([\\s\\S]*?)</${naam}>`)); return m ? m[1] : ''; };

/** Eén UPnP-opdracht naar een speler, bijvoorbeeld Play of SetAVTransportURI. */
async function soap(host, dienst, actie, args = {}) {
  const paden = {
    AVTransport: { path: '/MediaRenderer/AVTransport/Control', type: 'urn:schemas-upnp-org:service:AVTransport:1' },
    RenderingControl: { path: '/MediaRenderer/RenderingControl/Control', type: 'urn:schemas-upnp-org:service:RenderingControl:1' },
    ZoneGroupTopology: { path: '/ZoneGroupTopology/Control', type: 'urn:schemas-upnp-org:service:ZoneGroupTopology:1' },
  }[dienst];
  const inner = Object.entries(args).map(([k, v]) => `<${k}>${esc(v)}</${k}>`).join('');
  const body = `<?xml version="1.0" encoding="utf-8"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"><s:Body><u:${actie} xmlns:u="${paden.type}">${inner}</u:${actie}></s:Body></s:Envelope>`;
  const res = await request({
    host, path: paden.path, method: 'POST', body,
    headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPAction: `"${paden.type}#${actie}"`, 'Content-Length': Buffer.byteLength(body) },
  });
  if (res.status !== 200) {
    const fout = tag(res.body, 'errorCode') || res.status;
    throw new Error(`${actie} mislukt (${fout})`);
  }
  return res.body;
}

/** Zoekt spelers met één SSDP-vraag, precies zoals de Sonos-app zelf doet. */
function discoverAddresses({ timeout = 2500 } = {}) {
  return new Promise((resolve) => {
    const found = new Set();
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const msg = Buffer.from(['M-SEARCH * HTTP/1.1', `HOST: ${SSDP_ADDR}:${SSDP_PORT}`, 'MAN: "ssdp:discover"', 'MX: 1', 'ST: urn:schemas-upnp-org:device:ZonePlayer:1', '', ''].join('\r\n'));
    sock.on('message', (buf, rinfo) => { if (/ZonePlayer|Sonos/i.test(buf.toString())) found.add(rinfo.address); });
    sock.on('error', () => { try { sock.close(); } catch {} resolve([]); });
    sock.bind(() => {
      try { sock.setBroadcast(true); } catch {}
      sock.send(msg, SSDP_PORT, SSDP_ADDR);
      setTimeout(() => sock.send(msg, SSDP_PORT, SSDP_ADDR), 600); // tweede poging, UDP mag verdwijnen
    });
    setTimeout(() => { try { sock.close(); } catch {} resolve([...found]); }, timeout);
  });
}

/** Naam en model van één speler. */
async function describe(host) {
  const res = await request({ host, path: '/xml/device_description.xml' });
  return {
    host,
    room: tag(res.body, 'roomName') || host,
    model: (tag(res.body, 'modelName') || '').replace(/^Sonos\s+/, ''),
    uuid: (tag(res.body, 'UDN') || '').replace(/^uuid:/, ''),
  };
}

/**
 * Alle kamers, gegroepeerd zoals in de Sonos-app. Alleen de coördinator van een groep neemt
 * opdrachten aan, dus die geven we terug als aanspreekpunt.
 */
async function listGroups() {
  const hosts = await discoverAddresses();
  if (!hosts.length) return [];
  const spelers = [];
  for (const h of hosts) { try { spelers.push(await describe(h)); } catch {} }
  if (!spelers.length) return [];

  const byUuid = new Map(spelers.map((s) => [s.uuid, s]));
  let state = '';
  for (const s of spelers) { try { state = tag(await soap(s.host, 'ZoneGroupTopology', 'GetZoneGroupState'), 'ZoneGroupState'); if (state) break; } catch {} }
  const xml = state.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');

  const groepen = [];
  for (const g of xml.match(/<ZoneGroup\b[\s\S]*?<\/ZoneGroup>/g) || []) {
    const coordUuid = (g.match(/Coordinator="([^"]+)"/) || [])[1];
    const leden = [...g.matchAll(/<ZoneGroupMember\b[^>]*UUID="([^"]+)"[^>]*ZoneName="([^"]+)"[^>]*/g)].map((m) => ({ uuid: m[1], room: m[2] }));
    const zichtbaar = leden.filter((l) => byUuid.has(l.uuid));
    const coord = byUuid.get(coordUuid) || byUuid.get(zichtbaar[0]?.uuid);
    if (!coord) continue;
    const namen = [...new Set(zichtbaar.map((l) => l.room))];
    groepen.push({
      id: coord.uuid, host: coord.host, model: coord.model,
      name: namen.length > 1 ? `${coord.room} + ${namen.length - 1}` : coord.room,
      rooms: namen.length ? namen : [coord.room],
    });
  }
  if (groepen.length) return groepen.sort((a, b) => a.name.localeCompare(b.name));
  // Lukt het uitlezen van de groepen niet, geef dan elke speler los terug.
  return spelers.map((s) => ({ id: s.uuid, host: s.host, model: s.model, name: s.room, rooms: [s.room] }));
}

/** Laat een groep de zender van Nebula spelen. */
async function play(host, streamUrl, titel = 'Nebula') {
  const meta = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="-1" parentID="-1" restricted="true"><dc:title>${esc(titel)}</dc:title><upnp:class>object.item.audioItem.audioBroadcast</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON65031_</desc></item></DIDL-Lite>`;
  // x-rincon-mp3radio: laat de speler de stream als internetradio behandelen (eindeloos, geen zoeken).
  const uri = `x-rincon-mp3radio://${streamUrl.replace(/^https?:\/\//, '')}`;
  await soap(host, 'AVTransport', 'SetAVTransportURI', { InstanceID: 0, CurrentURI: uri, CurrentURIMetaData: meta });
  await soap(host, 'AVTransport', 'Play', { InstanceID: 0, Speed: 1 });
}
const stop = (host) => soap(host, 'AVTransport', 'Stop', { InstanceID: 0 });

async function status(host) {
  const info = await soap(host, 'AVTransport', 'GetTransportInfo', { InstanceID: 0 });
  const media = await soap(host, 'AVTransport', 'GetMediaInfo', { InstanceID: 0 }).catch(() => '');
  const vol = await soap(host, 'RenderingControl', 'GetVolume', { InstanceID: 0, Channel: 'Master' }).catch(() => '');
  return {
    state: tag(info, 'CurrentTransportState') || 'ONBEKEND',
    uri: tag(media, 'CurrentURI') || '',
    volume: Number(tag(vol, 'CurrentVolume') || 0),
  };
}
const setVolume = (host, v) => soap(host, 'RenderingControl', 'SetVolume', { InstanceID: 0, Channel: 'Master', DesiredVolume: Math.max(0, Math.min(100, Math.round(v))) });

module.exports = { localAddress, listGroups, play, stop, status, setVolume, discoverAddresses, describe };
