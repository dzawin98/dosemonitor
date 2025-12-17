import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Power, Key, Settings as Cog, Trash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

function getToken() {
  try {
    return localStorage.getItem("auth_token") || "";
  } catch {
    return "";
  }
}

type User = { id: number; username: string; role: string; is_active: boolean; created_at: string };

const Settings = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [manageOpen, setManageOpen] = useState(false);
  const [manageUser, setManageUser] = useState<User | null>(null);
  const [routes, setRoutes] = useState<string[]>([]);
  const token = getToken();

  const ALL_NAV_ITEMS: { path: string; label: string }[] = [
    { path: "/dashboard", label: "Dashboard" },
    { path: "/worklist", label: "Worklist" },
    { path: "/reporting", label: "Reporting" },
    { path: "/settings", label: "User Management" },
    { path: "/settings/dicom", label: "Dicom Storage" },
    { path: "/settings/database", label: "Database" },
    { path: "/settings/idrl-national", label: "IDRL Nasional" },
  ];

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Gagal memuat users");
      setUsers(json.users || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  useEffect(() => { fetchUsers(); }, []);


  const handleCreate = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username, password, role, is_active: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Gagal membuat user");
      setUsername("");
      setPassword("");
      setRole("user");
      toast({ title: "Berhasil", description: `User ${json.username} dibuat` });
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  const toggleActive = async (u: User) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/${u.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ is_active: !u.is_active }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Gagal update user");
      toast({ title: "Berhasil", description: `User ${json.username} diupdate` });
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  const resetPassword = async (u: User) => {
    const np = window.prompt(`Password baru untuk ${u.username}:`, "");
    if (!np) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/${u.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password: np }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Gagal reset password");
      toast({ title: "Berhasil", description: `Password ${json.username} direset` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  const deleteUser = async (u: User) => {
    if (!window.confirm(`Hapus user ${u.username}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/${u.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Gagal hapus user");
      toast({ title: "Berhasil", description: `User dihapus` });
      fetchUsers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  const openManage = async (u: User) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/${u.id}/permissions`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Gagal memuat permissions");
      setRoutes(json.routes || []);
      setManageUser(u);
      setManageOpen(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  const toggleRoute = (path: string) => {
    setRoutes((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
  };

  const saveManage = async () => {
    if (!manageUser) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/users/${manageUser.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ routes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Gagal menyimpan permissions");
      toast({ title: "Berhasil", description: `Akses menu untuk ${manageUser.username} diperbarui` });
      setManageOpen(false);
      setManageUser(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="w-full p-6 pt-14 transition-all duration-300" style={{ marginLeft: "var(--sidebar-width)" }}>
        <h1 className="mb-4 text-xl font-bold text-foreground">User Management</h1>
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <select className="rounded-md border border-border bg-card px-2 py-2 text-sm text-foreground" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="user">user</option>
            <option value="admin">admin</option>
          </select>
          <Button onClick={handleCreate}>Tambah User</Button>
        </div>
        <div className="rounded-md border border-border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left">Username</th>
                <th className="px-3 py-2 text-left">Role</th>
                <th className="px-3 py-2 text-left">Aktif</th>
                <th className="px-3 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-border">
                  <td className="px-3 py-2">{u.username}</td>
                  <td className="px-3 py-2">{u.role}</td>
                  <td className="px-3 py-2">{u.is_active ? "Ya" : "Tidak"}</td>
              <td className="px-3 py-2 text-right">
                <div className="flex justify-end gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" onClick={() => toggleActive(u)} aria-label={u.is_active ? "Nonaktifkan" : "Aktifkan"}>
                        <Power className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{u.is_active ? "Nonaktifkan" : "Aktifkan"}</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="outline" size="icon" onClick={() => resetPassword(u)} aria-label="Reset Password">
                        <Key className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Reset Password</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="default" size="icon" onClick={() => openManage(u)} aria-label="Manage Menu">
                        <Cog className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Manage Menu</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="destructive" size="icon" onClick={() => deleteUser(u)} aria-label="Hapus">
                        <Trash className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Hapus</TooltipContent>
                  </Tooltip>
                </div>
              </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atur Akses Menu {manageUser?.username}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {ALL_NAV_ITEMS.map((item) => (
              <label key={item.path} className="flex items-center gap-3 text-sm">
                <Checkbox checked={routes.includes(item.path)} onCheckedChange={() => toggleRoute(item.path)} />
                <span>{item.label}</span>
                <span className="ml-auto text-muted-foreground">{item.path}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={saveManage}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Settings;
