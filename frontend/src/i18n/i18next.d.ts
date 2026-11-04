import 'i18next';

import type sl from './sl.json';

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: { translation: typeof sl };
  }
}
