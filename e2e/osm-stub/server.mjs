// Nadomestna kartografska storitev za E2E (016, research R-08): zaledje v compose.verify.yaml kliče ta strežnik namesto
// OpenStreetMap (Photon za predloge naslova, Nominatim za lokacijo, ploščice podlage). Brez odvisnosti (samo Node).
// Odgovori so določeni z majhnim naborom naslovov, zato so testi ponovljivi. Zahteve brskalnika sem nikoli ne pridejo
// (brskalnik kliče samo zaledje).
import { createServer } from 'node:http';
import { Buffer } from 'node:buffer';
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

/** Središča krajev za približne zadetke Nominatim (kraj brez hišne številke). */
const CITIES = {
  ljubljana: [46.0511, 14.5051],
  maribor: [46.5547, 15.6467],
  graz: [47.0707, 15.4395],
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Iskanje Nominatim (`/search`, `jsonv2`): strukturirana poizvedba (`street`, `postalcode`, `city`) ali `q`. Ulica s
 * hišno številko iz `PLACES` → natančen zadetek (`place_rank` 30); samo znan kraj → približen (`place_rank` 16, brez
 * hišne številke); sicer prazen seznam. Naslov z besedo »nedosegljiv« simulira izklopljeno storitev (503).
 */
function nominatim(params) {
  const text = fold(
    params.get('q') ??
      ['street', 'postalcode', 'city'].map((name) => params.get(name) ?? '').join(' '),
  )
    .replace(/[\s,]+/g, ' ')
    .trim();
  if (text.includes('nedosegljiv')) return null;
  const place = PLACES.find((candidate) => {
    const street = escape(fold(`${candidate.street} ${candidate.housenumber}`));
    return (
      new RegExp(`(^|[^a-z0-9])${street}($|[^0-9])`).test(text) &&
      (!/\d{4}/.test(text) || text.includes(candidate.postcode))
    );
  });
  if (place) {
    const [lat, lon] = CITIES[fold(place.city)];
    return [
      {
        lat: (lat + Number(place.housenumber) / 10000).toFixed(4),
        lon: String(lon),
        place_rank: 30,
        address: {
          house_number: place.housenumber,
          road: place.street,
          postcode: place.postcode,
          city: place.city,
        },
      },
    ];
  }
  const city = Object.keys(CITIES).find((name) => new RegExp(`(^| )${name}($| )`).test(text));
  if (city) {
    const [lat, lon] = CITIES[city];
    return [{ lat: String(lat), lon: String(lon), place_rank: 16, address: { city } }];
  }
  return [];
}

/** Najmanjša veljavna ploščica PNG (1 × 1, prosojna). */
const TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

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
  } else if (url.pathname === '/search' && request.method === 'GET') {
    const hits = nominatim(url.searchParams);
    if (hits === null) send(response, 503, { error: 'unavailable' });
    else send(response, 200, hits);
  } else if (/^\/tiles\/\d+\/\d+\/\d+\.png$/.test(url.pathname) && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=3600' });
    response.end(TILE);
  } else {
    send(response, 404, { error: 'not found' });
  }
}).listen(PORT, () => {
  process.stdout.write(`osm-stub posluša na vratih ${PORT}
`);
});
