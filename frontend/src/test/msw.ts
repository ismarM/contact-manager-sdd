import { setupServer } from 'msw/node';

// Brez privzetih rokovalnikov: vsak test sam določi odgovore API-ja (konstitucija II – MSW v FE).
export const server = setupServer();
