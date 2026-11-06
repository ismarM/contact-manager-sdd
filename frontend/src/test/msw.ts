import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Vsak test sam določi odgovore API-ja (konstitucija II – MSW v FE). Edini privzeti odgovor: ogrodje po 002 ob vsaki
// prijavljeni strani naloži povzetek skupin (stranski pas, meni preklopa), zato `GET /api/groups` brez rokovalnika
// testa vrne prazen seznam. Začetni rokovalnik ima najnižjo prednost – vsak `server.use` v testu ga preglasi.
export const server = setupServer(
  http.get('/api/groups', () => HttpResponse.json({ sections: [] })),
);
