import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ConnectivityProvider } from './context/ConnectivityContext';
import { RealtimeProvider } from './context/RealtimeContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { RegisterOrganization } from './pages/RegisterOrganization';
import { Dashboard } from './pages/Dashboard';
import { OrganizationsUsers } from './pages/OrganizationsUsers';
import { Demographic } from './pages/Demographic';
import { Requirements } from './pages/Requirements';
import { Resources } from './pages/Resources';
import { Transport } from './pages/Transport';
import { Situation } from './pages/Situation';
import { FieldOperations } from './pages/FieldOperations';
import { Reports } from './pages/Reports';
import { Administration } from './pages/Administration';
import { ModulePlaceholder } from './pages/ModulePlaceholder';

export default function App() {
  return (
    <AuthProvider>
      <ConnectivityProvider>
        <RealtimeProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<RegisterOrganization />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Dashboard />} />
              <Route path="modules/organizations" element={<OrganizationsUsers />} />
              <Route path="modules/demographic" element={<Demographic />} />
              <Route path="modules/requirements" element={<Requirements />} />
              <Route path="modules/resources" element={<Resources />} />
              <Route path="modules/transport" element={<Transport />} />
              <Route path="modules/situation" element={<Situation />} />
              <Route path="modules/field-ops" element={<FieldOperations />} />
              <Route path="modules/reports" element={<Reports />} />
              <Route path="modules/administration" element={<Administration />} />
              <Route path="modules/:moduleKey" element={<ModulePlaceholder />} />
            </Route>
          </Routes>
        </RealtimeProvider>
      </ConnectivityProvider>
    </AuthProvider>
  );
}
