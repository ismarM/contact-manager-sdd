import { useState } from 'react';
import { createBrowserRouter, Route, RouterProvider, Routes } from 'react-router';

import { AccountPage } from '../features/account/AccountPage';
import { ApiDocsPage } from '../features/api-docs/ApiDocsPage';
import { ApiKeyUsagePage } from '../features/apikeys/ApiKeyUsagePage';
import type { AuthGateway } from '../features/auth/AuthGateway';
import { AuthProvider } from '../features/auth/AuthProvider';
import { DisplayFormatsProvider } from '../features/formats/DisplayFormatsProvider';
import { ArchivedGroupsPage } from '../features/groups/ArchivedGroupsPage';
import { GroupLayout } from '../features/groups/GroupLayout';
import { GroupsPage } from '../features/groups/GroupsPage';
import { InvitationsPage } from '../features/invitations/InvitationsPage';
import { ForgotPasswordPage } from '../features/auth/ForgotPasswordPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { RequireAuth } from '../features/auth/RequireAuth';
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage';
import { AppShell } from '../shared/layout/AppShell';
import { NotFoundPage } from '../shared/pages/NotFoundPage';

// Poti iz plan.md 001, 002, 004 in 017 (Pages and routes): /login, /register, /forgot-password javno, /verify-email za
// prijavljenega z nepotrjenim e-naslovom, ostalo zaščiteno v ogrodju. Podatkovni usmerjevalnik
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
      <DisplayFormatsProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/verify-email" element={<VerifyEmailPage />} />
          <Route path="/api-docs" element={<ApiDocsPage />} />
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
            <Route path="account/api-keys/:keyId" element={<ApiKeyUsagePage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </DisplayFormatsProvider>
    </AuthProvider>
  );
}
