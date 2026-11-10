import { useState } from 'react';
import { createBrowserRouter, Route, RouterProvider, Routes } from 'react-router';

import { AccountPage } from '../features/account/AccountPage';
import type { AuthGateway } from '../features/auth/AuthGateway';
import { AuthProvider } from '../features/auth/AuthProvider';
import { ArchivedGroupsPage } from '../features/groups/ArchivedGroupsPage';
import { GroupLayout } from '../features/groups/GroupLayout';
import { GroupsPage } from '../features/groups/GroupsPage';
import { InvitationsPage } from '../features/invitations/InvitationsPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { AppShell } from '../shared/layout/AppShell';
import { NotFoundPage } from '../shared/pages/NotFoundPage';

// Poti iz plan.md 001, 002 in 004 (Pages and routes): /login javno, ostalo zaščiteno v ogrodju. Podatkovni usmerjevalnik
// (createBrowserRouter) omogoča varovalo neshranjenih sprememb z useBlocker (004, research R-09); poti ostanejo
// opisane z <Routes> pod eno samo potjo `*`.
export function App({ gateway }: { gateway: AuthGateway }) {
  // Usmerjevalnik se ustvari ob prvem izrisu, da prebere trenutni naslov (tudi v testih po replaceState).
  const [router] = useState(() =>
    createBrowserRouter([{ path: '*', element: <AppRoutes gateway={gateway} /> }]),
  );
  return <RouterProvider router={router} />;
}

function AppRoutes({ gateway }: { gateway: AuthGateway }) {
  return (
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
          <Route path="groups" element={<GroupsPage />} />
          <Route path="groups/archived" element={<ArchivedGroupsPage />} />
          <Route path="groups/:groupId/*" element={<GroupLayout />} />
          <Route path="invitations" element={<InvitationsPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
