import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Vsak test sam določi odgovore API-ja (konstitucija II – MSW v FE). Edini privzeti odgovor: ogrodje po 002 ob vsaki
// prijavljeni strani naloži povzetek skupin (stranski pas, meni preklopa), zato `GET /api/groups` brez rokovalnika
// testa vrne prazen seznam. Od 004 je privzeti razdelek skupine *Kontakti* (D-40), zato `GET …/contacts` brez rokovalnika
// testa vrne prazno stran. Začetna rokovalnika imata najnižjo prednost – vsak `server.use` v testu ju preglasi.
export const server = setupServer(
  http.get('/api/groups', () => HttpResponse.json({ sections: [] })),
  http.get('/api/groups/:groupId/contacts', ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      total: 0,
      page: Number(url.searchParams.get('page') ?? 0),
      size: Number(url.searchParams.get('size') ?? 25),
      items: [],
    });
  }),
);
