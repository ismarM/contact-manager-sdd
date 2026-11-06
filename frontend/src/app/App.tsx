import { BrowserRouter, Route, Routes } from 'react-router';

import { AccountPage } from '../features/account/AccountPage';
import type { AuthGateway } from '../features/auth/AuthGateway';
import { AuthProvider } from '../features/auth/AuthProvider';
import { GroupLayout } from '../features/groups/GroupLayout';
import { GroupsPage } from '../features/groups/GroupsPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { AppShell } from '../shared/layout/AppShell';
import { NotFoundPage } from '../shared/pages/NotFoundPage';

// Poti iz plan.md 001 in 002 (Pages and routes): /login javno, ostalo zaščiteno v ogrodju.
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
            <Route index element={<GroupsPage />} />
            <Route path="groups/:groupId/*" element={<GroupLayout />} />
            <Route path="account" element={<AccountPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
