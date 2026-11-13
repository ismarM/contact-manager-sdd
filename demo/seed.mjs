// Podatki za predstavitev: uporabniki v Firebase Auth Emulatorju, vse ostalo prek REST API (sled, ključi razvrščanja
// in pravila vlog nastanejo kot v pravi uporabi). Zažene se s storitvijo `seed` v compose.demo.yaml.

const AUTH_URL = process.env.AUTH_URL ?? 'http://127.0.0.1:9099';
const API_URL = process.env.API_URL ?? 'http://127.0.0.1:8080';

const USERS = {
  ana: { name: 'Ana Novak', email: 'ana@demo.si' },
  bor: { name: 'Bor Kranjc', email: 'bor@demo.si' },
  cvetka: { name: 'Cvetka Zupan', email: 'cvetka@demo.si' },
  david: { name: 'David Horvat', email: 'david@demo.si' },
};

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
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${text}`);
    return text ? JSON.parse(text) : null;
  };
}

const c = (firstName, lastName, extra = {}) => ({ firstName, lastName, ...extra });

const COMPANY = [
  c('Marko', 'Kovač', { email: 'marko.kovac@kartoteka.si', phone: '+386 41 123 456', tags: ['vodstvo'], attributes: [{ key: 'Oddelek', value: 'Uprava' }] }),
  c('Nina', 'Potočnik', { email: 'nina.potocnik@kartoteka.si', phone: '+386 31 222 333', tags: ['razvoj'], attributes: [{ key: 'Oddelek', value: 'Razvoj' }] }),
  c('Luka', 'Mlakar', { email: 'luka.mlakar@kartoteka.si', phone: '+386 40 555 111', tags: ['razvoj', 'backend'], attributes: [{ key: 'Oddelek', value: 'Razvoj' }] }),
  c('Eva', 'Kos', { email: 'eva.kos@kartoteka.si', tags: ['razvoj', 'frontend'], attributes: [{ key: 'Oddelek', value: 'Razvoj' }] }),
  c('Žiga', 'Vidmar', { email: 'ziga.vidmar@kartoteka.si', phone: '+386 51 987 654', tags: ['prodaja'], attributes: [{ key: 'Oddelek', value: 'Prodaja' }] }),
  c('Špela', 'Golob', { email: 'spela.golob@kartoteka.si', tags: ['prodaja'], attributes: [{ key: 'Oddelek', value: 'Prodaja' }] }),
  c('Matej', 'Turk', { email: 'matej.turk@kartoteka.si', phone: '+386 41 444 777', tags: ['podpora'], attributes: [{ key: 'Oddelek', value: 'Podpora' }] }),
  c('Tjaša', 'Božič', { email: 'tjasa.bozic@kartoteka.si', tags: ['kadrovska'], attributes: [{ key: 'Oddelek', value: 'Kadri' }] }),
  c('Rok', 'Kralj', { email: 'rok.kralj@kartoteka.si', phone: '+386 70 321 654', tags: ['razvoj', 'devops'] }),
  c('Maja', 'Zupančič', { email: 'maja.zupancic@kartoteka.si', tags: ['marketing'] }),
  c('Jure', 'Hribar', { email: 'jure.hribar@kartoteka.si', tags: ['finance'], attributes: [{ key: 'Oddelek', value: 'Finance' }] }),
  c('Urška', 'Petek', { email: 'urska.petek@kartoteka.si', tags: ['podpora'] }),
  c('Andrej', 'Kavčič', { email: 'andrej.kavcic@dobavitelj.si', phone: '+386 2 620 11 00', address: 'Slovenska ulica 12, 2000 Maribor', tags: ['dobavitelj'], attributes: [{ key: 'Podjetje', value: 'Dobavitelj d.o.o.' }] }),
  c('Katja', 'Rozman', { email: 'katja.rozman@stranka.si', phone: '+386 1 300 40 50', address: 'Dunajska cesta 5, 1000 Ljubljana', tags: ['stranka', 'vip'], attributes: [{ key: 'Podjetje', value: 'Stranka d.d.' }] }),
  c('Gregor', 'Jereb', { email: 'gregor.jereb@stranka.si', tags: ['stranka'], attributes: [{ key: 'Podjetje', value: 'Stranka d.d.' }] }),
  c('Barbara', 'Kolar', { email: 'barbara.kolar@partner.si', phone: '+386 3 425 00 00', address: 'Prešernova 3, 3000 Celje', tags: ['partner'] }),
  c('Tomaž', 'Zorko', { email: 'tomaz.zorko@partner.si', tags: ['partner'] }),
  c('Petra', 'Bizjak', { email: 'petra.bizjak@kartoteka.si', tags: ['marketing'] }),
  c('Aleš', 'Oblak', { phone: '+386 41 909 808', tags: ['zunanji'], attributes: [{ key: 'Vloga', value: 'Svetovalec' }] }),
  c('Mojca', 'Šuštar', { email: 'mojca.sustar@kartoteka.si', tags: ['finance'] }),
  c('Blaž', 'Kern', { email: 'blaz.kern@kartoteka.si', tags: ['razvoj', 'backend'] }),
  c('Sara', 'Lešnik', { email: 'sara.lesnik@kartoteka.si', tags: ['razvoj', 'qa'] }),
  c('Primož', 'Erjavec', { email: 'primoz.erjavec@stranka.si', tags: ['stranka'] }),
  c('Lea', 'Čeh', { email: 'lea.ceh@kartoteka.si', tags: ['kadrovska'] }),
  c('Nejc', 'Pirc', { email: 'nejc.pirc@kartoteka.si', tags: ['prodaja'] }),
];

const FRIENDS = [
  c('Mama', null, { phone: '+386 41 100 200', tags: ['družina'] }),
  c('Oče', null, { phone: '+386 41 100 201', tags: ['družina'] }),
  c('Jan', 'Novak', { email: 'jan.novak@gmail.com', phone: '+386 40 111 222', tags: ['družina'], attributes: [{ key: 'Rojstni dan', value: '14. 3.' }] }),
  c('Klara', 'Novak', { email: 'klara.novak@gmail.com', tags: ['družina'] }),
  c('Tina', 'Medved', { email: 'tina.medved@gmail.com', phone: '+386 31 777 888', tags: ['prijatelji'], attributes: [{ key: 'Rojstni dan', value: '2. 7.' }] }),
  c('Tina', 'Medved', { email: 'tina.medved@gmail.com', tags: ['prijatelji', 'faks'] }),
  c('Miha', 'Breznik', { phone: '+386 51 345 678', tags: ['prijatelji', 'planinci'] }),
  c('Miha', 'Breznik', { phone: '+386 51 345 678', address: 'Gorenjska cesta 8, 4000 Kranj', tags: ['planinci'] }),
  c('Anja', 'Ferk', { email: 'anja.ferk@gmail.com', tags: ['faks'] }),
  c('Domen', 'Lah', { email: 'domen.lah@gmail.com', phone: '+386 70 246 135', tags: ['faks'] }),
  c('Zala', 'Koren', { email: 'zala.koren@gmail.com', tags: ['prijatelji'] }),
  c('Dr. Peter', 'Klemenčič', { phone: '+386 1 522 00 00', address: 'Zaloška 2, 1000 Ljubljana', tags: ['zdravnik'] }),
];

const CONFERENCE = [
  c('Igor', 'Lenarčič', { email: 'igor.lenarcic@um.si', tags: ['govornik'], attributes: [{ key: 'Predavanje', value: 'Spec-driven razvoj' }] }),
  c('Helena', 'Rupnik', { email: 'helena.rupnik@um.si', tags: ['organizator'] }),
  c('Simon', 'Debeljak', { email: 'simon.debeljak@fri.uni-lj.si', tags: ['govornik'] }),
  c('Vesna', 'Pogačnik', { email: 'vesna.pogacnik@sponzor.si', tags: ['sponzor'] }),
];

const CLUB = [
  c('Boštjan', 'Kranjc', { phone: '+386 41 600 700', tags: ['trener'] }),
  c('Nika', 'Mavrič', { email: 'nika.mavric@gmail.com', tags: ['članica'] }),
  c('Gašper', 'Ribič', { email: 'gasper.ribic@gmail.com', tags: ['član'] }),
  c('Ema', 'Kumer', { phone: '+386 31 909 101', tags: ['članica'] }),
];

const CHOIR = [
  c('Irena', 'Zakrajšek', { email: 'irena.zakrajsek@zbor.si', tags: ['zborovodja'] }),
  c('Martin', 'Stopar', { tags: ['bas'] }),
  c('Alenka', 'Rebec', { tags: ['sopran'] }),
];

async function addContacts(api, groupId, contacts) {
  const created = [];
  for (const contact of contacts) created.push(await api('POST', `/api/groups/${groupId}/contacts`, contact));
  return created;
}

async function invite(owner, invitee, groupId, user, role) {
  const invitation = await owner('POST', `/api/groups/${groupId}/invitations`, { email: user.email, role });
  if (invitee) await invitee('POST', `/api/invitations/${invitation.id}/accept`);
}

async function main() {
  const api = {};
  for (const [key, user] of Object.entries(USERS)) {
    api[key] = client(await signIn(user));
    await api[key]('PUT', '/api/me', { language: 'sl', theme: null });
  }

  const existing = await api.ana('GET', '/api/groups');
  if (JSON.stringify(existing).includes('Kartoteka d.o.o.')) {
    console.log('Podatki za predstavitev že obstajajo – nič ni spremenjeno.');
    return;
  }

  // Ana: podjetje z ekipo (vse vloge) in revizijsko sledjo.
  const company = await api.ana('POST', '/api/groups', {
    title: 'Kartoteka d.o.o.',
    description: 'Sodelavci, stranke in partnerji podjetja',
    color: 'morje',
  });
  await invite(api.ana, api.bor, company.id, USERS.bor, 'ADMIN');
  await invite(api.ana, api.cvetka, company.id, USERS.cvetka, 'EDITOR');
  await invite(api.ana, api.david, company.id, USERS.david, 'VIEWER');
  const companyContacts = await addContacts(api.ana, company.id, COMPANY.slice(0, 15));
  await addContacts(api.cvetka, company.id, COMPANY.slice(15));
  const [marko, , , , ziga] = companyContacts;
  await api.bor('PUT', `/api/groups/${company.id}/contacts/${marko.id}`, {
    ...COMPANY[0],
    phone: '+386 41 123 999',
    attributes: [...COMPANY[0].attributes, { key: 'Funkcija', value: 'Direktor' }],
    version: marko.version,
  });
  await api.cvetka('PUT', `/api/groups/${company.id}/contacts/${ziga.id}`, {
    ...COMPANY[4],
    address: 'Tržaška cesta 21, 1000 Ljubljana',
    version: ziga.version,
  });
  const temp = await api.cvetka('POST', `/api/groups/${company.id}/contacts`, c('Začasni', 'Kontakt', { tags: ['test'] }));
  await api.bor('DELETE', `/api/groups/${company.id}/contacts/${temp.id}?version=${temp.version}`);

  // Ana: zasebna skupina z dvojniki.
  const friends = await api.ana('POST', '/api/groups', {
    title: 'Družina in prijatelji',
    description: 'Zasebni kontakti',
    color: 'mah',
  });
  await addContacts(api.ana, friends.id, FRIENDS);

  // Ana: arhivirana skupina.
  const conference = await api.ana('POST', '/api/groups', {
    title: 'Konferenca FERI 2025',
    description: 'Govorniki in organizatorji lanske konference',
    color: 'oker',
  });
  await invite(api.ana, api.bor, conference.id, USERS.bor, 'EDITOR');
  await addContacts(api.ana, conference.id, CONFERENCE);
  await api.ana('POST', `/api/groups/${conference.id}/archive`);

  // Bor: skupina, v kateri je Ana urednica.
  const club = await api.bor('POST', '/api/groups', {
    title: 'Športni klub Triglav',
    description: 'Člani in trenerji kluba',
    color: 'opeka',
  });
  await invite(api.bor, api.ana, club.id, USERS.ana, 'EDITOR');
  await addContacts(api.bor, club.id, CLUB);

  // Cvetka: čakajoče povabilo za Ano.
  const choir = await api.cvetka('POST', '/api/groups', {
    title: 'Pevski zbor Lipa',
    description: 'Pevke in pevci zbora',
    color: 'sliva',
  });
  await addContacts(api.cvetka, choir.id, CHOIR);
  await invite(api.cvetka, null, choir.id, USERS.ana, 'VIEWER');

  console.log('Podatki za predstavitev so pripravljeni. Prijava: ' + Object.values(USERS).map((u) => u.email).join(', '));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
