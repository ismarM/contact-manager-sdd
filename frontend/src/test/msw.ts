import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

// Vsak test sam določi odgovore API-ja (konstitucija II – MSW v FE). Edini privzeti odgovor: ogrodje po 002 ob vsaki
// prijavljeni strani naloži povzetek skupin (stranski pas, meni preklopa), zato `GET /api/groups` brez rokovalnika
// testa vrne prazen seznam. Od 004 je privzeti razdelek skupine *Kontakti* (D-40), zato `GET …/contacts` brez rokovalnika
// testa vrne prazno stran. Od 006 ogrodje ob vsaki strani naloži število povabil (`GET /api/invitations/count` → 0), *Nastavitve*
// admina pa naložijo čakajoča povabila skupine (`GET …/invitations` → prazna stran); tudi ta dva imata privzet odgovor.
// Od 007 *Nastavitve* naložijo člane skupine (`GET …/members` → ena stran z lastnikom); tudi to ima privzet odgovor.
// Od 009 imajo privzet odgovor tudi `contact-ids`, `selection-check`, `bulk-update` in `bulk-delete`.
// Od 012 *Moj račun* naloži blokade izbrisa računa (`GET /api/me/deletion-blockers` → prazen seznam), zato imajo tudi obstoječi
// testi strani *Moj račun* privzet odgovor.
// Začetni rokovalniki imajo najnižjo prednost – vsak `server.use` v testu jih preglasi.
export const server = setupServer(
  http.get('/api/groups', () => HttpResponse.json({ sections: [] })),
  http.get('/api/invitations/count', () => HttpResponse.json({ count: 0 })),
  http.get('/api/me/deletion-blockers', () => HttpResponse.json({ groups: [] })),
  http.get('/api/groups/:groupId/invitations', ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      total: 0,
      page: Number(url.searchParams.get('page') ?? 0),
      size: Number(url.searchParams.get('size') ?? 25),
      items: [],
    });
  }),
  http.get('/api/groups/:groupId/members', ({ request }) => {
    const url = new URL(request.url);
    return HttpResponse.json({
      total: 1,
      page: Number(url.searchParams.get('page') ?? 0),
      size: Number(url.searchParams.get('size') ?? 25),
      deletedOwner: false,
      items: [
        {
          id: '0193c4a2-7a1f-7c3e-9b1a-cccccccccc00',
          name: 'Ana Novak',
          email: 'ana@primer.si',
          role: 'OWNER',
          version: 0,
          self: true,
          canManage: false,
          updatedBy: null,
          updatedAt: null,
        },
      ],
    });
  }),
  // Od 008 seznam kontaktov ob odprtju panela filtrov naloži možnosti filtrov (`GET …/contact-filters`); privzeto prazne.
  http.get('/api/groups/:groupId/contact-filters', () => HttpResponse.json({ keys: [], tags: [] })),
  // Od 009 seznam kontaktov izbor »Izberi vse zadetke« in množične operacije kličejo štiri nove endpointe; privzeto brez zadetkov in brez sprememb.
  http.get('/api/groups/:groupId/contact-ids', () =>
    HttpResponse.json({ total: 0, truncated: false, ids: [] }),
  ),
  http.post('/api/groups/:groupId/contacts/selection-check', async ({ request }) => {
    const body = (await request.json()) as { queries?: unknown[] };
    return HttpResponse.json({
      changed: false,
      missing: [],
      queries: (body.queries ?? []).map(() => ({ newMatches: [], noLongerMatching: [] })),
    });
  }),
  http.post('/api/groups/:groupId/contacts/bulk-update', async ({ request }) => {
    const body = (await request.json()) as { contactIds: string[] };
    return HttpResponse.json({ changed: body.contactIds.length });
  }),
  http.post('/api/groups/:groupId/contacts/bulk-delete', async ({ request }) => {
    const body = (await request.json()) as { contactIds: string[] };
    return HttpResponse.json({ deleted: body.contactIds.length });
  }),
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
