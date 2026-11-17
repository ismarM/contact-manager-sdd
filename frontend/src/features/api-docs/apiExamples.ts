// Primeri zahtev in odgovorov za stran API (FR-019-14). Koda ni prevedena; naslov strežnika je naslov te strani.

export interface ApiExample {
  /** Ključ prevoda naslova v `apiDocs.examples`. */
  id: 'listGroups' | 'listContacts' | 'createContact' | 'updateContact' | 'deleteContact';
  request: (origin: string) => string;
  response: string;
}

const AUTH = '-H "Authorization: Bearer cmk_…"';
const JSON_HEADER = '-H "Content-Type: application/json"';

const CONTACT = `{
  "id": "0193c4a2-7a1f-7c3e-9b1a-00000000c0a1",
  "firstName": "Janez",
  "lastName": "Novak",
  "displayName": "Janez Novak",
  "email": "janez@primer.si",
  "version": 1
}`;

export const API_EXAMPLES: readonly ApiExample[] = [
  {
    id: 'listGroups',
    request: (origin) => `curl ${AUTH} \\\n  "${origin}/v1/groups?page=0&size=25"`,
    response: `{
  "total": 1,
  "page": 0,
  "size": 25,
  "items": [
    {
      "id": "0193c4a2-7a1f-7c3e-9b1a-00000000c1b0",
      "title": "Klub",
      "description": null,
      "color": "mah",
      "archived": false,
      "role": "EDITOR"
    }
  ]
}`,
  },
  {
    id: 'listContacts',
    request: (origin) =>
      `curl ${AUTH} \\\n  "${origin}/v1/groups/GROUP_ID/contacts?q=novak&sort=lastName&size=25"`,
    response: `{
  "total": 1,
  "page": 0,
  "size": 25,
  "items": [
    {
      "id": "0193c4a2-7a1f-7c3e-9b1a-00000000c0a1",
      "firstName": "Janez",
      "lastName": "Novak",
      "displayName": "Janez Novak",
      "email": "janez@primer.si",
      "phone": null,
      "tags": [],
      "version": 1,
      "reverted": false
    }
  ]
}`,
  },
  {
    id: 'createContact',
    request: (origin) =>
      `curl -X POST ${AUTH} ${JSON_HEADER} \\\n  -d '{"firstName":"Janez","lastName":"Novak","email":"janez@primer.si"}' \\\n  "${origin}/v1/groups/GROUP_ID/contacts"`,
    response: `HTTP 201\n${CONTACT}`,
  },
  {
    id: 'updateContact',
    request: (origin) =>
      `curl -X PUT ${AUTH} ${JSON_HEADER} \\\n  -d '{"firstName":"Janez","lastName":"Novak","phone":"+386 40 123 456","version":1}' \\\n  "${origin}/v1/groups/GROUP_ID/contacts/CONTACT_ID"`,
    response: `HTTP 200\n${CONTACT.replace('"version": 1', '"phone": "+386 40 123 456",\n  "version": 2')}`,
  },
  {
    id: 'deleteContact',
    request: (origin) =>
      `curl -X DELETE ${AUTH} \\\n  "${origin}/v1/groups/GROUP_ID/contacts/CONTACT_ID?version=2"`,
    response: 'HTTP 204',
  },
];
