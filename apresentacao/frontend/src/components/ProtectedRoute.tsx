import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "@/store/auth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const access = useAuth((s) => s.access);
  const location = useLocation();
  if (!access) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
}
