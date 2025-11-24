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

type DbConfigResponse = {
  driver: string;
  host: string;
  port: number;
  database: string;
  username?: string;
  password_set: boolean;
};

const DatabasePage = () => {
  const { toast } = useToast();
  const token = getToken();
  const [host, setHost] = useState("");
  const [port, setPort] = useState<number>(3306);
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string>("");

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/db-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: DbConfigResponse = await res.json();
      if (!res.ok) throw new Error((json as any)?.detail || "Gagal memuat konfigurasi DB");
      setHost(json.host || "");
      setPort(Number(json.port) || 3306);
      setDatabase(json.database || "");
      setUsername(json.username || "");
      setPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  const saveConfig = async () => {
    try {
      const body = { host, port, database, username, password };
      const res = await fetch(`${API_BASE}/api/v1/db-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || "Gagal menyimpan konfigurasi DB");
      toast({ title: "Berhasil", description: "Konfigurasi database disimpan" });
      setPassword("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  const testConnection = async () => {
    try {
      const body = { host, port, database, username, password };
      const res = await fetch(`${API_BASE}/api/v1/db-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json?.success) {
        setStatus("Koneksi berhasil");
        toast({ title: "Koneksi berhasil", description: json?.message || "OK" });
      } else {
        setStatus("Koneksi gagal");
        toast({ title: "Koneksi gagal", description: json?.message || "Gagal konek", variant: "destructive" });
      }
    } catch (err: unknown) {
      setStatus("Error menguji koneksi");
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  useEffect(() => { fetchConfig(); }, []);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="ml-60 w-full p-6">
        <h1 className="mb-4 text-xl font-bold text-foreground">Database</h1>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Input placeholder="IP/Host" value={host} onChange={(e) => setHost(e.target.value)} />
          <Input placeholder="Port" type="number" value={String(port)} onChange={(e) => setPort(Number(e.target.value) || 3306)} />
          <Input placeholder="Nama Database" value={database} onChange={(e) => setDatabase(e.target.value)} />
          <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
          <Input placeholder="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <div className="flex gap-2 mb-4">
          <Button variant="outline" onClick={testConnection}>Tes Koneksi</Button>
          <Button onClick={saveConfig}>Simpan</Button>
        </div>
        {status ? (
          <div className="text-sm text-muted-foreground">{status}</div>
        ) : null}
      </div>
    </div>
  );
};

export default DatabasePage;