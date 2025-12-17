import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { User, LogOut, KeyRound } from "lucide-react";
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
import IdrlNational from "./pages/IdrlNational";

const queryClient = new QueryClient();
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <UserMenuOverlay />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/" element={<RequireAuth><Index /></RequireAuth>} />
          <Route path="/worklist" element={<RequireAuth><PatientList /></RequireAuth>} />
          <Route path="/reporting" element={<RequireAuth><Reporting /></RequireAuth>} />
          <Route path="/settings" element={<RequireAdmin><Settings /></RequireAdmin>} />
          <Route path="/settings/dicom" element={<RequireAdmin><DicomStorage /></RequireAdmin>} />
          <Route path="/settings/database" element={<RequireAdmin><DatabasePage /></RequireAdmin>} />
          <Route path="/settings/idrl-national" element={<RequireAdmin><IdrlNational /></RequireAdmin>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/70 px-4 py-2 text-center text-xs text-muted-foreground backdrop-blur">
        © 2026 Wellya Herlina • Postgraduate Program — Master of Diagnostic Imaging • All rights reserved
      </div>
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

const UserMenuOverlay = () => {
  const { toast } = useToast();
  const token = (() => { try { return localStorage.getItem("auth_token") || ""; } catch { return ""; } })();
  const username = (() => { try { return localStorage.getItem("auth_username") || ""; } catch { return ""; } })();
  if (!token) return null;
  const handleLogout = () => {
    try {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_username");
      localStorage.removeItem("auth_role");
      localStorage.removeItem("auth_perms");
    } catch (e) { void e }
    window.location.href = "/login";
  };
  const handleChangePassword = async () => {
    const np = window.prompt("Password baru:", "");
    if (!np) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: np }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Gagal ubah password");
      toast({ title: "Berhasil", description: "Password diperbarui" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };
  const initials = (() => {
    const n = String(username).trim();
    if (!n) return "";
    const parts = n.split(" ");
    const a = parts[0]?.[0] || "";
    const b = parts[1]?.[0] || "";
    return (a + b).toUpperCase();
  })();
  return (
    <div className="fixed top-0 right-0 z-40 border-b border-border bg-background/80 backdrop-blur" style={{ left: "var(--sidebar-width)", transition: "left 300ms ease" }}>
      <div className="flex h-12 items-center justify-end px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full p-0">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-blue-600 text-white">
                  {initials || <User className="h-5 w-5" />}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            <DropdownMenuLabel>{username || "User"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleChangePassword} className="gap-2">
              <KeyRound className="h-4 w-4" />
              Ubah Password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleLogout} className="gap-2">
              <LogOut className="h-4 w-4" />
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
};

export default App;
