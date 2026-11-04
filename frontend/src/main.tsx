import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';

import { App } from './app/App';
import { createFirebaseGateway } from './features/auth/firebaseGateway';
import './i18n';
import './styles/app.css';

void registerSW({ immediate: true });

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App gateway={createFirebaseGateway()} />
    </StrictMode>,
  );
}
