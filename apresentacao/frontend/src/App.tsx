import { Navigate, Route, Routes } from "react-router-dom";
import { Login } from "@/pages/Login";
import { Dashboard } from "@/pages/Dashboard";
import { EditorPage } from "@/editor/EditorPage";
import { PresentationPlayer } from "@/player/PresentationPlayer";
import { PublicPage } from "@/public/PublicPage";
import { SsoLaunch } from "@/pages/SsoLaunch";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/store/auth";

export default function App() {
  const access = useAuth((s) => s.access);

  return (
    <Routes>
      <Route path="/p/:token" element={<PublicPage />} />
      <Route path="/sso/launch" element={<SsoLaunch />} />
      <Route path="/login" element={access ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/apresentacao/:id/editor"
        element={
          <ProtectedRoute>
            <EditorPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/apresentacao/:id/play"
        element={
          <ProtectedRoute>
            <PresentationPlayer />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
