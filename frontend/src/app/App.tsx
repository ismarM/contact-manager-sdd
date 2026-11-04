import { BrowserRouter, Route, Routes } from 'react-router';

import { AccountPage } from '../features/account/AccountPage';
import type { AuthGateway } from '../features/auth/AuthGateway';
import { AuthProvider } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { AppShell } from '../shared/layout/AppShell';
import { NotFoundPage } from '../shared/pages/NotFoundPage';
import { StartPage } from './StartPage';

// Poti iz plan.md (Pages and routes): /login javno, ostalo zaščiteno v ogrodju.
export function App({ gateway }: { gateway: AuthGateway }) {
  return (
    <BrowserRouter>
      <AuthProvider gateway={gateway}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<StartPage />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
