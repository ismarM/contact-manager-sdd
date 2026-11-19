// Podatki za predstavitev: uporabniki v Firebase Auth Emulatorju, vse ostalo prek REST API (sled, ključi razvrščanja
// in pravila vlog nastanejo kot v pravi uporabi). Zažene se s storitvijo `seed` v compose.demo.yaml.
//
// Zgodba: Kartoteka d.o.o. je majhno podjetje. Ana (lastnica) vodi skupino podjetja, Bor (skrbnik) skrbi za red,
// Cvetka (urednica) ureja kadrovske podatke, David (bralec) samo bere. Vsak kontakt ima daljšo, smiselno zgodovino:
// nastanek, dopolnitve, množične spremembe, sprememba tipa atributa, pomotna množična sprememba in povrnitev skupine,
// obnova starejše različice kontakta, slike, izbris, združitev dvojnikov, uvoz in spremembe prek API ključa.

import { crc32 as nodeCrc32, deflateSync } from 'node:zlib';

const AUTH_URL = process.env.AUTH_URL ?? 'http://127.0.0.1:9099';
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080';

const USERS = {
  ana: { name: 'Ana Novak', email: 'ana@demo.si', language: 'sl', color: [37, 99, 235] },
  bor: { name: 'Bor Kranjc', email: 'bor@demo.si', language: 'sl', color: [5, 150, 105] },
  cvetka: { name: 'Cvetka Zupan', email: 'cvetka@demo.si', language: 'sl', color: [219, 39, 119] },
  david: { name: 'David Horvat', email: 'david@demo.si', language: 'en', color: [217, 119, 6] },
};

// ---------------------------------------------------------------------------------------------------------------------
// Prijava in odjemalec

async function signIn(user) {
  const idToken = JSON.stringify({
    sub: `demo-${user.email.split('@')[0]}`,
    email: user.email,
    email_verified: true,
    name: user.name,
  });
  const res = await fetch(
    `${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=demo`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`,
        requestUri: 'http://localhost',
        returnSecureToken: true,
      }),
    },
  );
  if (!res.ok) throw new Error(`emulator: ${res.status} ${await res.text()}`);
  return (await res.json()).idToken;
}

function client(token) {
  return async (method, path, body) => {
    const form = body instanceof FormData;
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined || form ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Slike: preprost PNG (krog na barvnem ozadju), da predstavitev ne potrebuje datotek.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 =
  nodeCrc32 ??
  ((buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  });

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}

function png([r, g, b], size = 160) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const mid = size / 2;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const head = Math.hypot(x - mid, y - size * 0.4) < size * 0.18;
      const body = Math.hypot(x - mid, y - size * 1.02) < size * 0.42;
      const light = head || body;
      const i = row + 1 + x * 3;
      raw[i] = light ? Math.round(255 - (255 - r) * 0.25) : r;
      raw[i + 1] = light ? Math.round(255 - (255 - g) * 0.25) : g;
      raw[i + 2] = light ? Math.round(255 - (255 - b) * 0.25) : b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bitna globina
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function photoForm(color, version) {
  const form = new FormData();
  form.append('file', new Blob([png(color)], { type: 'image/png' }), 'slika.png');
  if (version !== undefined) form.append('version', String(version));
  return form;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pomočniki za kontakte

const SI = 'SI';
const attr = (key, value, type = 'OTHER') => ({ key, type, value });
const addr = (key, parts) => ({ key, type: 'ADDRESS', parts });
const where = (street, postalCode, city, country = SI) => ({ street, postalCode, city, country });

/** Telo zahtevka PUT iz `ContactDetail` (samo dovoljena polja). */
function toInput(detail) {
  const input = {
    firstName: detail.firstName ?? null,
    lastName: detail.lastName ?? null,
    email: detail.email ?? null,
    phone: detail.phone ?? null,
    company: detail.company ?? null,
    country: detail.country ?? null,
    attributes: (detail.attributes ?? []).map((a) =>
      a.type === 'ADDRESS' && a.parts
        ? { key: a.key, type: a.type, parts: a.parts }
        : { key: a.key, type: a.type, value: a.value },
    ),
    tags: [...(detail.tags ?? [])],
  };
  if (detail.addressParts) input.addressParts = detail.addressParts;
  else input.address = detail.address ?? null;
  return input;
}

const setAttr = (input, key, value, type = 'OTHER') => ({
  ...input,
  attributes: [...input.attributes.filter((a) => a.key !== key), attr(key, value, type)],
});
const dropAttr = (input, key) => ({ ...input, attributes: input.attributes.filter((a) => a.key !== key) });
const addTags = (input, ...tags) => ({ ...input, tags: [...new Set([...input.tags, ...tags])] });
const removeTags = (input, ...tags) => ({ ...input, tags: input.tags.filter((t) => !tags.includes(t)) });

function contacts(api, groupId) {
  const base = `/api/groups/${groupId}`;
  const get = (id) => api('GET', `${base}/contacts/${id}`);
  return {
    add: (contact) => api('POST', `${base}/contacts`, contact),
    async addAll(list) {
      const created = [];
      for (const contact of list) created.push(await api('POST', `${base}/contacts`, contact));
      return created;
    },
    get,
    /** Prebere trenutno različico, uporabi spremembo in shrani (kot urejanje v obrazcu). */
    async edit(id, change) {
      const current = await get(id);
      const input = toInput(current);
      const next = typeof change === 'function' ? change(input) : { ...input, ...change };
      return api('PUT', `${base}/contacts/${id}`, { ...next, version: current.version });
    },
    async remove(id) {
      const current = await get(id);
      await api('DELETE', `${base}/contacts/${id}?version=${current.version}`);
    },
    async photo(id, color) {
      const current = await get(id);
      return api('PUT', `${base}/contacts/${id}/photo`, photoForm(color, current.version));
    },
    latestEntry: async () => (await api('GET', `${base}/audit?page=0&size=25`)).latestEntryId,
  };
}

async function invite(owner, invitee, groupId, user, role) {
  const invitation = await owner('POST', `/api/groups/${groupId}/invitations`, { email: user.email, role });
  if (invitee) await invitee('POST', `/api/invitations/${invitation.id}/accept`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Podatki

const c = (firstName, lastName, extra = {}) => ({ firstName, lastName, attributes: [], tags: [], ...extra });
const STAFF = (extra) => ({ company: 'Kartoteka d.o.o.', country: SI, ...extra });

// Sodelavci: ob vnosu le osnovni podatki, ostalo dopolnijo kasnejše spremembe.
const EMPLOYEES = [
  c('Marko', 'Kovač', STAFF({ email: 'marko.kovac@kartoteka.si', phone: '+386 41 123 456', tags: ['vodstvo'], attributes: [attr('Oddelek', 'Uprava')] })),
  c('Nina', 'Potočnik', STAFF({ email: 'nina.potocnik@kartoteka.si', phone: '+386 31 222 333', tags: ['razvoj'], attributes: [attr('Oddelek', 'Razvoj')] })),
  c('Luka', 'Mlakar', STAFF({ email: 'luka.mlakar@kartoteka.si', phone: '+386 40 555 111', tags: ['razvoj', 'backend'], attributes: [attr('Oddelek', 'Razvoj')] })),
  c('Eva', 'Kos', STAFF({ email: 'eva.kos@kartoteka.si', tags: ['razvoj', 'frontend'], attributes: [attr('Oddelek', 'Razvoj')] })),
  c('Žiga', 'Vidmar', STAFF({ email: 'ziga.vidmar@kartoteka.si', phone: '+386 51 987 654', tags: ['prodaja'], attributes: [attr('Oddelek', 'Prodaja')] })),
  c('Špela', 'Golob', STAFF({ email: 'spela.golob@kartoteka.si', tags: ['prodaja'], attributes: [attr('Oddelek', 'Prodaja')] })),
  c('Matej', 'Turk', STAFF({ email: 'matej.turk@kartoteka.si', phone: '+386 41 444 777', tags: ['podpora'], attributes: [attr('Oddelek', 'Podpora')] })),
  c('Tjaša', 'Božič', STAFF({ email: 'tjasa.bozic@kartoteka.si', tags: ['kadrovska'], attributes: [attr('Oddelek', 'Kadri')] })),
  c('Rok', 'Kralj', STAFF({ email: 'rok.kralj@kartoteka.si', phone: '+386 70 321 654', tags: ['razvoj'], attributes: [attr('Oddelek', 'Razvoj')] })),
  c('Maja', 'Zupančič', STAFF({ email: 'maja.zupancic@kartoteka.si', tags: ['marketing'], attributes: [attr('Oddelek', 'Marketing')] })),
  c('Jure', 'Hribar', STAFF({ email: 'jure.hribar@kartoteka.si', tags: ['finance'], attributes: [attr('Oddelek', 'Finance')] })),
  c('Urška', 'Petek', STAFF({ email: 'urska.petek@kartoteka.si', tags: ['podpora'], attributes: [attr('Oddelek', 'Podpora')] })),
  c('Petra', 'Bizjak', STAFF({ email: 'petra.bizjak@kartoteka.si', tags: ['marketing'], attributes: [attr('Oddelek', 'Marketing')] })),
  c('Mojca', 'Šuštar', STAFF({ email: 'mojca.sustar@kartoteka.si', tags: ['finance'], attributes: [attr('Oddelek', 'Finance')] })),
  c('Blaž', 'Kern', STAFF({ email: 'blaz.kern@kartoteka.si', tags: ['razvoj', 'backend'], attributes: [attr('Oddelek', 'Razvoj')] })),
  c('Sara', 'Lešnik', STAFF({ email: 'sara.lesnik@kartoteka.si', tags: ['razvoj', 'qa'], attributes: [attr('Oddelek', 'Razvoj')] })),
  c('Lea', 'Čeh', STAFF({ email: 'lea.ceh@kartoteka.si', tags: ['kadrovska'], attributes: [attr('Oddelek', 'Kadri')] })),
  c('Nejc', 'Pirc', STAFF({ email: 'nejc.pirc@kartoteka.si', tags: ['prodaja'], attributes: [attr('Oddelek', 'Prodaja')] })),
];

// Začetek dela (ISO datum; najprej besedilo, nato ga Ana spremeni v tip Datum).
const STARTED = {
  Marko: '2015-03-02', Nina: '2019-09-16', Luka: '2018-01-08', Eva: '2021-04-01', Žiga: '2017-06-12',
  Špela: '2022-02-01', Matej: '2016-10-03', Tjaša: '2020-05-04', Rok: '2019-01-14', Maja: '2023-03-20',
  Jure: '2016-02-15', Urška: '2024-01-08', Petra: '2022-09-05', Mojca: '2018-11-12', Blaž: '2020-08-24',
  Sara: '2023-06-01', Lea: '2021-10-18', Nejc: '2024-05-13',
};

const EXTERNAL = [
  c('Katja', 'Rozman', { company: 'Stranka d.d.', country: SI, email: 'katja.rozman@stranka.si', phone: '+386 1 300 40 50', addressParts: where('Dunajska cesta 5', '1000', 'Ljubljana'), tags: ['stranka'] }),
  c('Gregor', 'Jereb', { company: 'Stranka d.d.', country: SI, email: 'gregor.jereb@stranka.si', tags: ['stranka'] }),
  c('Primož', 'Erjavec', { company: 'Stranka d.d.', country: SI, email: 'primoz.erjavec@stranka.si', tags: ['stranka'] }),
  c('Andrej', 'Kavčič', { company: 'Dobavitelj d.o.o.', country: SI, email: 'andrej.kavcic@dobavitelj.si', phone: '+386 2 620 11 00', addressParts: where('Slovenska ulica 12', '2000', 'Maribor'), tags: ['dobavitelj'] }),
  c('Barbara', 'Kolar', { company: 'Partner IT d.o.o.', country: SI, email: 'barbara.kolar@partner.si', phone: '+386 3 425 00 00', addressParts: where('Prešernova ulica 3', '3000', 'Celje'), tags: ['partner'] }),
  c('Tomaž', 'Zorko', { company: 'Partner IT d.o.o.', country: SI, email: 'tomaz.zorko@partner.si', tags: ['partner'] }),
  c('Aleš', 'Oblak', { phone: '+386 41 909 808', country: SI, tags: ['zunanji'], attributes: [attr('Vloga', 'Svetovalec za varnost')] }),
  c('Sabine', 'Huber', { company: 'Alpen Logistik GmbH', country: 'AT', email: 's.huber@alpenlogistik.at', phone: '+43 1 5123 400', addressParts: { street: 'Kärntner Straße 21', postalCode: '1010', city: 'Wien', country: 'AT' }, tags: ['stranka'] }),
  c('Marco', 'Bianchi', { company: 'Adria Trade S.r.l.', country: 'IT', email: 'marco.bianchi@adriatrade.it', phone: '+39 040 765 432', addressParts: { street: 'Via Roma 15', postalCode: '34121', city: 'Trieste', country: 'IT' }, tags: ['partner'] }),
];

const FRIENDS = [
  c('Mama', null, { phone: '+386 41 100 200', country: SI, tags: ['družina'] }),
  c('Oče', null, { phone: '+386 41 100 201', country: SI, tags: ['družina'] }),
  c('Jan', 'Novak', { email: 'jan.novak@gmail.com', phone: '+386 40 111 222', country: SI, tags: ['družina'], attributes: [attr('Rojstni dan', '1994-03-14', 'DATE')] }),
  c('Klara', 'Novak', { email: 'klara.novak@gmail.com', country: SI, tags: ['družina'], attributes: [attr('Rojstni dan', '1998-11-30', 'DATE')] }),
  c('Tina', 'Medved', { email: 'tina.medved@gmail.com', phone: '+386 31 777 888', country: SI, tags: ['prijatelji'], attributes: [attr('Rojstni dan', '1993-07-02', 'DATE')] }),
  c('Tina', 'Medved', { email: 'tina.medved@gmail.com', tags: ['prijatelji', 'faks'] }),
  c('Miha', 'Breznik', { phone: '+386 51 345 678', country: SI, tags: ['prijatelji', 'planinci'] }),
  c('Miha', 'Breznik', { phone: '+386 51 345 678', addressParts: where('Gorenjska cesta 8', '4000', 'Kranj'), tags: ['planinci'] }),
  c('Anja', 'Ferk', { email: 'anja.ferk@gmail.com', tags: ['faks'] }),
  c('Domen', 'Lah', { email: 'domen.lah@gmail.com', phone: '+386 70 246 135', country: SI, tags: ['faks'] }),
  c('Zala', 'Koren', { email: 'zala.koren@gmail.com', tags: ['prijatelji'], attributes: [attr('Instagram', 'https://instagram.com/zala.koren', 'URL')] }),
  c('Peter', 'Klemenčič', { phone: '+386 1 522 00 00', country: SI, addressParts: where('Zaloška cesta 2', '1000', 'Ljubljana'), tags: ['zdravnik'], attributes: [attr('Ordinacijski čas', 'pon–pet 7.00–13.00', 'NOTES')] }),
];

const CONFERENCE = [
  c('Igor', 'Lenarčič', { company: 'Univerza v Mariboru', country: SI, email: 'igor.lenarcic@um.si', tags: ['govornik'], attributes: [attr('Predavanje', 'Spec-driven razvoj'), attr('Spletna stran', 'https://feri.um.si', 'URL')] }),
  c('Helena', 'Rupnik', { company: 'Univerza v Mariboru', country: SI, email: 'helena.rupnik@um.si', tags: ['organizator'] }),
  c('Simon', 'Debeljak', { company: 'Univerza v Ljubljani', country: SI, email: 'simon.debeljak@fri.uni-lj.si', tags: ['govornik'], attributes: [attr('Predavanje', 'Dostopnost spletnih aplikacij')] }),
  c('Vesna', 'Pogačnik', { company: 'Sponzor d.o.o.', country: SI, email: 'vesna.pogacnik@sponzor.si', tags: ['sponzor'] }),
  c('Lukas', 'Meier', { company: 'TU Graz', country: 'AT', email: 'lukas.meier@tugraz.at', tags: ['govornik'], attributes: [attr('Predavanje', 'Testiranje z emulatorji')] }),
];

const CLUB = [
  c('Boštjan', 'Kranjc', { phone: '+386 41 600 700', country: SI, tags: ['trener'], attributes: [attr('Licenca', 'Trener B')] }),
  c('Nika', 'Mavrič', { email: 'nika.mavric@gmail.com', tags: ['članica'], attributes: [attr('Članarina plačana', '2026-01-15', 'DATE')] }),
  c('Gašper', 'Ribič', { email: 'gasper.ribic@gmail.com', tags: ['član'], attributes: [attr('Članarina plačana', '2026-02-03', 'DATE')] }),
  c('Ema', 'Kumer', { phone: '+386 31 909 101', country: SI, tags: ['članica'] }),
  c('Tilen', 'Majcen', { email: 'tilen.majcen@gmail.com', phone: '+386 40 818 919', country: SI, tags: ['član', 'mladinci'] }),
];

const CHOIR = [
  c('Irena', 'Zakrajšek', { email: 'irena.zakrajsek@zbor.si', tags: ['zborovodja'] }),
  c('Martin', 'Stopar', { tags: ['bas'] }),
  c('Alenka', 'Rebec', { tags: ['sopran'] }),
  c('Jakob', 'Vrhovec', { phone: '+386 41 232 323', country: SI, tags: ['tenor'] }),
];

// ---------------------------------------------------------------------------------------------------------------------
// Scenariji

async function companyGroup(api) {
  const group = await api.ana('POST', '/api/groups', {
    title: 'Kartoteka d.o.o.',
    description: 'Sodelavci, stranke in partnerji podjetja',
    color: 'morje',
  });
  const detail = await api.ana('GET', `/api/groups/${group.id}`);
  await api.ana('PUT', `/api/groups/${group.id}/photo`, photoForm([14, 116, 144], detail.version));
  await invite(api.ana, api.bor, group.id, USERS.bor, 'ADMIN');
  await invite(api.ana, api.cvetka, group.id, USERS.cvetka, 'EDITOR');
  await invite(api.ana, api.david, group.id, USERS.david, 'VIEWER');

  const ana = contacts(api.ana, group.id);
  const bor = contacts(api.bor, group.id);
  const cvetka = contacts(api.cvetka, group.id);

  // 1. Ana vnese sodelavce, Cvetka zunanje kontakte.
  const staff = await ana.addAll(EMPLOYEES);
  const external = await cvetka.addAll(EXTERNAL);
  const byName = Object.fromEntries([...staff, ...external].map((x) => [x.firstName, x.id]));

  // 2. Cvetka dopolni kadrovske podatke: začetek dela (zaenkrat kot besedilo).
  for (const employee of staff) {
    await cvetka.edit(employee.id, (x) => setAttr(x, 'Začetek dela', STARTED[employee.firstName]));
  }

  // 3. Ana spremeni tip ključa »Začetek dela« v Datum (vnos ATTRIBUTE_TYPE).
  const keys = await api.ana('GET', `/api/groups/${group.id}/attribute-keys?q=${encodeURIComponent('Začetek dela')}&page=0&size=25`);
  const key = keys.items.find((k) => k.key === 'Začetek dela');
  await api.ana('POST', `/api/groups/${group.id}/attribute-keys/change-type`, { key: key.key, type: 'DATE', version: key.version });

  // 4. Bor uredi vodstvo in razvoj.
  await bor.edit(byName.Marko, (x) => setAttr({ ...x, phone: '+386 41 123 999' }, 'Funkcija', 'Direktor'));
  await bor.edit(byName.Marko, (x) => setAttr(x, 'LinkedIn', 'https://www.linkedin.com/in/marko-kovac', 'URL'));
  await bor.edit(byName.Rok, (x) => addTags(removeTags(x, 'razvoj'), 'devops'));
  await bor.edit(byName.Rok, (x) => setAttr(x, 'Oddelek', 'Infrastruktura'));
  await bor.edit(byName.Luka, (x) => setAttr(x, 'Funkcija', 'Vodja razvoja'));
  await bor.edit(byName.Blaž, (x) => setAttr(x, 'Službeni mobitel', '+386 41 777 120', 'PHONE'));
  await bor.edit(byName.Sara, (x) => setAttr(x, 'Službeni mobitel', '+386 41 777 121', 'PHONE'));
  await bor.edit(byName.Eva, (x) => setAttr(x, 'Službeni mobitel', '+386 41 777 122', 'PHONE'));

  // 5. Cvetka: prodaja in podpora.
  await cvetka.edit(byName.Žiga, (x) => ({ ...x, addressParts: where('Tržaška cesta 21', '1000', 'Ljubljana') }));
  await cvetka.edit(byName.Žiga, (x) => setAttr(x, 'Funkcija', 'Vodja prodaje'));
  await cvetka.edit(byName.Špela, { phone: '+386 31 456 789' });
  await cvetka.edit(byName.Nejc, { phone: '+386 40 222 345' });
  await cvetka.edit(byName.Matej, (x) => setAttr(x, 'Funkcija', 'Vodja podpore'));
  await cvetka.edit(byName.Urška, { phone: '+386 51 101 202' });
  await cvetka.edit(byName.Maja, (x) => addTags(x, 'družbena-omrežja'));
  await cvetka.edit(byName.Petra, (x) => addTags(x, 'dogodki'));
  await cvetka.edit(byName.Jure, (x) => setAttr(x, 'Funkcija', 'Računovodja'));
  await cvetka.edit(byName.Mojca, { phone: '+386 41 333 909' });
  await cvetka.edit(byName.Lea, (x) => setAttr(x, 'Funkcija', 'Kadrovnica'));

  // 6. Stranke in partnerji.
  await ana.edit(byName.Katja, (x) => addTags(setAttr(x, 'Opombe', 'Ključna stranka od 2021; letni sestanek v marcu.', 'NOTES'), 'vip'));
  await bor.edit(byName.Katja, (x) => setAttr(x, 'Funkcija', 'Direktorica nabave'));
  await cvetka.edit(byName.Gregor, { phone: '+386 1 300 40 52' });
  await cvetka.edit(byName.Primož, (x) => setAttr(x, 'Funkcija', 'Projektni vodja'));
  await bor.edit(byName.Andrej, (x) => ({
    ...x,
    attributes: [...x.attributes, addr('Naslov dostave', where('Industrijska cesta 40', '2000', 'Maribor'))],
  }));
  await cvetka.edit(byName.Andrej, (x) => setAttr(x, 'Spletna stran', 'https://www.dobavitelj.si', 'URL'));
  await ana.edit(byName.Barbara, (x) => setAttr(x, 'Funkcija', 'Direktorica'));
  await cvetka.edit(byName.Tomaž, { phone: '+386 3 425 00 12' });
  await bor.edit(byName.Aleš, (x) => ({ ...x, email: 'ales.oblak@varnost.si' }));
  await ana.edit(byName.Sabine, (x) => setAttr(x, 'Jezik dopisovanja', 'nemščina'));
  await cvetka.edit(byName.Marco, (x) => setAttr(x, 'Jezik dopisovanja', 'italijanščina'));

  // 7. Množična sprememba: Ana doda značko novic vsem strankam in partnerjem.
  const clients = ['Katja', 'Gregor', 'Primož', 'Barbara', 'Tomaž', 'Sabine', 'Marco'].map((n) => byName[n]);
  await api.ana('POST', `/api/groups/${group.id}/contacts/bulk-update`, {
    contactIds: clients,
    addTags: ['novice-2026'],
    removeTags: [],
    attributes: [],
  });

  // 8. Cvetka po pomoti razvijalcem odstrani značko »razvoj«; Bor povrne skupino na točko pred tem.
  const beforeMistake = await bor.latestEntry();
  const developers = ['Nina', 'Luka', 'Eva', 'Blaž', 'Sara'].map((n) => byName[n]);
  await api.cvetka('POST', `/api/groups/${group.id}/contacts/bulk-update`, {
    contactIds: developers,
    addTags: [],
    removeTags: ['razvoj'],
    attributes: [],
  });
  await api.bor('POST', `/api/groups/${group.id}/audit/${beforeMistake}/rollback`, {
    latestEntryId: await bor.latestEntry(),
  });

  // 9. Cvetka napačno prepiše Ninin e-naslov; Bor obnovi prejšnjo različico kontakta.
  await cvetka.edit(byName.Nina, { email: 'nina.potocnik@kartoteka.com' });
  const history = await api.bor('GET', `/api/groups/${group.id}/contacts/${byName.Nina}/history?page=0&size=25`);
  const previous = history.items.find((e) => e.hasVersion && e.entryId !== history.items[0].entryId);
  await api.bor('POST', `/api/groups/${group.id}/contacts/${byName.Nina}/restore`, {
    from: previous.entryId,
    version: history.contact.version,
  });
  await bor.edit(byName.Nina, (x) => setAttr(x, 'Funkcija', 'Višja razvijalka'));

  // 10. Slike kontaktov; Luka sliko kasneje zamenja.
  await ana.photo(byName.Marko, [30, 64, 175]);
  await cvetka.photo(byName.Nina, [190, 24, 93]);
  await cvetka.photo(byName.Luka, [4, 120, 87]);
  await bor.photo(byName.Luka, [21, 128, 61]);
  await cvetka.photo(byName.Katja, [180, 83, 9]);
  await cvetka.photo(byName.Žiga, [109, 40, 217]);

  // 11. Tjaša odide iz podjetja – Bor jo izbriše (vidna med izbrisanimi kontakti in jo je mogoče obnoviti).
  await bor.edit(byName.Tjaša, (x) => setAttr(x, 'Opombe', 'Zadnji delovni dan 31. 10. 2026.', 'NOTES'));
  await bor.remove(byName.Tjaša);
  const temp = await cvetka.add(c('Začasni', 'Kontakt', { tags: ['test'] }));
  await bor.remove(temp.id);

  // 12. Spletni obrazec prek API ključa doda povpraševanja (vnosi v sledi z imenom ključa).
  const created = await api.ana('POST', '/api/me/api-keys', {
    name: 'Spletni obrazec',
    allGroups: false,
    groups: [{ groupId: group.id, permission: 'WRITE' }],
    expiresInDays: 365,
  });
  const form = client(created.token);
  const lead = await form('POST', `/v1/groups/${group.id}/contacts`, c('Jana', 'Mohorič', {
    company: 'Pekarna Mohorič s.p.', country: SI, email: 'jana@pekarna-mohoric.si', tags: ['povpraševanje'],
    attributes: [attr('Sporočilo', 'Zanima nas ponudba za 5 uporabnikov.', 'NOTES')],
  }));
  await form('POST', `/v1/groups/${group.id}/contacts`, c('Boris', 'Lesjak', {
    company: 'Lesjak transport d.o.o.', country: SI, phone: '+386 41 515 616', tags: ['povpraševanje'],
  }));
  await form('PUT', `/v1/groups/${group.id}/contacts/${lead.id}`, {
    ...toInput(lead), phone: '+386 5 330 12 34', version: lead.version,
  });
  await cvetka.edit(lead.id, (x) => addTags(removeTags(x, 'povpraševanje'), 'stranka'));
  await form('GET', `/v1/groups/${group.id}/contacts?page=0&size=25`);

  return group;
}

async function friendsGroup(api) {
  const group = await api.ana('POST', '/api/groups', {
    title: 'Družina in prijatelji',
    description: 'Zasebni kontakti',
    color: 'mah',
  });
  const ana = contacts(api.ana, group.id);
  const list = await ana.addAll(FRIENDS);
  const [mama, , jan, , , , miha1, miha2, anja, domen, zala] = list;

  await ana.edit(mama.id, (x) => ({ ...x, phone: '+386 41 100 210', addressParts: where('Cankarjeva ulica 4', '1230', 'Domžale') }));
  await ana.edit(jan.id, (x) => addTags(x, 'planinci'));
  await ana.edit(anja.id, (x) => ({ ...x, email: 'anja.ferk@outlook.com' }));
  await ana.edit(domen.id, (x) => setAttr(x, 'Rojstni dan', '1997-05-21', 'DATE'));
  await ana.edit(zala.id, (x) => ({ ...x, addressParts: where('Koroška cesta 14', '2000', 'Maribor') }));
  await ana.photo(jan.id, [37, 99, 235]);

  // Miha je bil vnesen dvakrat – Ana ju združi. Tini (dva vnosa) ostaneta za prikaz iskanja dvojnikov.
  const [m1, m2] = [await ana.get(miha1.id), await ana.get(miha2.id)];
  await api.ana('POST', `/api/groups/${group.id}/duplicates/merge`, {
    contacts: [{ id: m1.id, version: m1.version }, { id: m2.id, version: m2.version }],
    result: {
      firstName: 'Miha',
      lastName: 'Breznik',
      company: null,
      address: null,
      addressParts: where('Gorenjska cesta 8', '4000', 'Kranj'),
      country: SI,
      email: null,
      phone: '+386 51 345 678',
      attributes: [],
      tags: ['prijatelji', 'planinci'],
    },
  });
  return group;
}

async function conferenceGroup(api) {
  const group = await api.ana('POST', '/api/groups', {
    title: 'Konferenca FERI 2025',
    description: 'Govorniki in organizatorji lanske konference',
    color: 'oker',
  });
  await invite(api.ana, api.bor, group.id, USERS.bor, 'EDITOR');
  // Govorniki so prišli iz vizitk (.vcf) – en vnos IMPORT v sledi.
  await api.ana('POST', `/api/groups/${group.id}/imports`, { source: 'VCF', contacts: CONFERENCE });
  const page = await api.ana('GET', `/api/groups/${group.id}/contacts?page=0&size=25`);
  const find = (name) => page.items.find((x) => x.displayName.startsWith(name)).id;
  const bor = contacts(api.bor, group.id);
  await bor.edit(find('Simon'), { phone: '+386 1 479 81 00' });
  await bor.edit(find('Helena'), (x) => addTags(x, 'govornik'));
  await contacts(api.ana, group.id).edit(find('Vesna'), (x) => setAttr(x, 'Sponzorski paket', 'Zlati'));
  await api.ana('POST', `/api/groups/${group.id}/archive`);
  return group;
}

async function clubGroup(api) {
  const group = await api.bor('POST', '/api/groups', {
    title: 'Športni klub Triglav',
    description: 'Člani in trenerji kluba',
    color: 'opeka',
  });
  await invite(api.bor, api.ana, group.id, USERS.ana, 'EDITOR');
  const list = await contacts(api.bor, group.id).addAll(CLUB);
  const ana = contacts(api.ana, group.id);
  await ana.edit(list[3].id, (x) => setAttr(x, 'Članarina plačana', '2026-03-01', 'DATE'));
  await ana.edit(list[1].id, { phone: '+386 31 640 220' });
  await contacts(api.bor, group.id).edit(list[4].id, (x) => setAttr(x, 'Starš', 'Mojca Majcen, +386 41 818 900', 'NOTES'));
  return group;
}

async function choirGroup(api) {
  const group = await api.cvetka('POST', '/api/groups', {
    title: 'Pevski zbor Lipa',
    description: 'Pevke in pevci zbora',
    color: 'sliva',
  });
  await invite(api.cvetka, api.david, group.id, USERS.david, 'EDITOR');
  const list = await contacts(api.cvetka, group.id).addAll(CHOIR);
  await contacts(api.david, group.id).edit(list[1].id, { phone: '+386 40 765 111', country: SI });
  // Čakajoče povabilo za Ano.
  await invite(api.cvetka, null, group.id, USERS.ana, 'VIEWER');
  return group;
}

// ---------------------------------------------------------------------------------------------------------------------

async function main() {
  const api = {};
  for (const [key, user] of Object.entries(USERS)) {
    api[key] = client(await signIn(user));
    await api[key]('PUT', '/api/me', { language: user.language, theme: null });
  }

  const existing = await api.ana('GET', '/api/groups');
  if (JSON.stringify(existing).includes('Kartoteka d.o.o.')) {
    console.log('Podatki za predstavitev že obstajajo – nič ni spremenjeno.');
    return;
  }

  for (const [key, user] of Object.entries(USERS)) {
    if (key !== 'david') await api[key]('PUT', '/api/me/photo', photoForm(user.color));
  }

  await companyGroup(api);
  await friendsGroup(api);
  await conferenceGroup(api);
  await clubGroup(api);
  await choirGroup(api);

  // Bor ima ključ samo za branje vseh skupin (statistika uporabe na strani ključa).
  const reports = await api.bor('POST', '/api/me/api-keys', {
    name: 'Mesečna poročila',
    allGroups: true,
    allGroupsPermission: 'READ',
    expiresInDays: 90,
  });
  const reader = client(reports.token);
  const groups = await reader('GET', '/v1/groups?page=0&size=25');
  for (const g of groups.items ?? []) await reader('GET', `/v1/groups/${g.id}/contacts?page=0&size=25`);

  console.log('Podatki za predstavitev so pripravljeni. Prijava: ' + Object.values(USERS).map((u) => u.email).join(', '));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
