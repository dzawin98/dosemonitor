import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

const Login = () => {
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/v1/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Login gagal");
      try {
        localStorage.setItem("auth_token", json.token);
        localStorage.setItem("auth_username", json.username);
        localStorage.setItem("auth_role", json.role);
      } catch {}
      toast({ title: "Login berhasil", description: `Selamat datang, ${json.username}` });
      window.location.href = "/dashboard";
    } catch (err: any) {
      toast({ title: "Login gagal", description: err.message || String(err), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <img src="/logo.svg" alt="Dose Monitor" className="h-16 w-16" />
          <div className="mt-2 text-2xl font-bold text-foreground">Dose Monitor</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow">
          <h1 className="mb-4 text-xl font-bold text-foreground">Masuk</h1>
          <div className="space-y-3">
            <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button onClick={handleLogin} disabled={loading} className="w-full">{loading ? "Memproses..." : "Masuk"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;