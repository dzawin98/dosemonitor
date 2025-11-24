import Sidebar from "@/components/Sidebar";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const token = getToken();

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

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="ml-60 w-full p-6">
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
                      <Button variant="outline" onClick={() => toggleActive(u)}>{u.is_active ? "Nonaktifkan" : "Aktifkan"}</Button>
                      <Button variant="outline" onClick={() => resetPassword(u)}>Reset Password</Button>
                      <Button variant="destructive" onClick={() => deleteUser(u)}>Hapus</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Settings;