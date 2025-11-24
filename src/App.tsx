import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index";
import Reporting from "./pages/Reporting";
import Dashboard from "./pages/Dashboard";
import PatientList from "@/components/PatientList";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Settings from "./pages/Settings";
import DicomStorage from "./pages/DicomStorage";
import DatabasePage from "./pages/Database";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
          <Route path="/worklist" element={<RequireAuth><PatientList /></RequireAuth>} />
          <Route path="/reporting" element={<RequireAuth><Reporting /></RequireAuth>} />
          <Route path="/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
          <Route path="/settings/dicom" element={<RequireAdmin><DicomStorage /></RequireAdmin>} />
          <Route path="/settings/database" element={<RequireAdmin><DatabasePage /></RequireAdmin>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

function getToken() {
  try {
    return localStorage.getItem("auth_token") || "";
  } catch {
    return "";
  }
}

function getRole() {
  try {
    return localStorage.getItem("auth_role") || "";
  } catch {
    return "";
  }
}

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const token = getToken();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const RequireAdmin = ({ children }: { children: React.ReactNode }) => {
  const token = getToken();
  const role = getRole().toLowerCase();
  if (!token) return <Navigate to="/login" replace />;
  if (role !== "admin") return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

export default App;
