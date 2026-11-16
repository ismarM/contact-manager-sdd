// Nadomestna kartografska storitev za E2E (016, research R-08): zaledje v compose.verify.yaml kliče ta strežnik namesto
// OpenStreetMap (Photon za predloge naslova). Brez odvisnosti (samo Node). Odgovori so določeni z majhnim naborom
// naslovov, zato so testi ponovljivi. Zahteve brskalnika sem nikoli ne pridejo (brskalnik kliče samo zaledje).
import { createServer } from 'node:http';
import process from 'node:process';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT ?? 8090);

/** Naslovi, ki jih vrne iskanje Photon (lastnosti GeoJSON). */
const PLACES = [
  {
    street: 'Slovenska cesta',
    housenumber: '1',
    postcode: '1000',
    city: 'Ljubljana',
    countrycode: 'SI',
  },
  {
    street: 'Slovenska cesta',
    housenumber: '10',
    postcode: '1000',
    city: 'Ljubljana',
    countrycode: 'SI',
  },
  {
    street: 'Slovenska ulica',
    housenumber: '5',
    postcode: '2000',
    city: 'Maribor',
    countrycode: 'SI',
  },
  { street: 'Glavni trg', housenumber: '1', postcode: '2000', city: 'Maribor', countrycode: 'SI' },
  {
    street: 'Prešernov trg',
    housenumber: '1',
    postcode: '1000',
    city: 'Ljubljana',
    countrycode: 'SI',
  },
  { street: 'Hauptplatz', housenumber: '1', postcode: '8010', city: 'Graz', countrycode: 'AT' },
];

const fold = (text) =>
  text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();

function photon(query, limit) {
  const words = fold(query)
    .split(/[\s,]+/)
    .filter(Boolean);
  const features = PLACES.filter((place) => {
    const text = fold(`${place.street} ${place.housenumber} ${place.postcode} ${place.city}`);
    return words.every((word) => text.includes(word));
  })
    .slice(0, limit)
    .map((place) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [14.5, 46.05] },
      properties: { ...place, type: 'house', name: `${place.street} ${place.housenumber}` },
    }));
  return { type: 'FeatureCollection', features };
}

function send(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://localhost:${PORT}`);
  if (url.pathname === '/health') {
    send(response, 200, { status: 'UP' });
  } else if (url.pathname === '/api' && request.method === 'GET') {
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 10) || 10, 50);
    send(response, 200, photon(url.searchParams.get('q') ?? '', limit));
  } else {
    send(response, 404, { error: 'not found' });
  }
}).listen(PORT, () => {
  process.stdout.write(`osm-stub posluša na vratih ${PORT}
`);
});
