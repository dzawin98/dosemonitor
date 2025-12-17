import { useEffect, useRef, useState } from "react";
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
        try {
          const res2 = await fetch(`${API_BASE}/api/v1/users/me/permissions`, { headers: { Authorization: `Bearer ${json.token}` } });
          const permsJson = await res2.json();
          if (res2.ok && Array.isArray(permsJson.routes)) {
            localStorage.setItem("auth_perms", JSON.stringify(permsJson.routes));
          }
        } catch (e) { void e }
      } catch (e) { void e }
      toast({ title: "Login berhasil", description: `Selamat datang, ${json.username}` });
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Login gagal", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let w = canvas.width = window.innerWidth;
    let h = canvas.height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.scale(dpr, dpr);
    const count = Math.floor((w * h) / 14000);
    const particles: { x: number; y: number; vx: number; vy: number; r: number; hue: number; ring: number }[] = [];
    for (let i = 0; i < count; i++) {
      const r = Math.random() * 2 + 0.5;
      const hue = Math.random() < 0.5 ? 190 + Math.random() * 30 : 45 + Math.random() * 20;
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
        r,
        hue,
        ring: Math.random() * 1.5,
      });
    }
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      const grd = ctx.createRadialGradient(w * 0.7, h * 0.3, 0, w * 0.7, h * 0.3, Math.max(w, h));
      grd.addColorStop(0, "rgba(0,0,0,0)");
      grd.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -50 || p.x > w + 50) p.vx *= -1;
        if (p.y < -50 || p.y > h + 50) p.vy *= -1;
        ctx.globalCompositeOperation = "lighter";
        ctx.shadowBlur = 12;
        ctx.shadowColor = `hsla(${p.hue}, 90%, 60%, 0.6)`;
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 80%, 55%, 0.7)`;
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
        p.ring += 0.012 + Math.random() * 0.003;
        const rr = 12 + (Math.sin(p.ring) + 1) * 6;
        ctx.strokeStyle = `hsla(${p.hue}, 80%, 55%, 0.15)`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 11000) {
            const alpha = 1 - d2 / 11000;
            ctx.strokeStyle = `rgba(80,200,255,${alpha * 0.25})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const onResize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };
    window.addEventListener("resize", onResize);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background">
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 z-0" />
      <div className="absolute inset-0 z-0 opacity-[0.35]" style={{background:"radial-gradient(1200px 600px at 70% 30%, rgba(0,255,200,0.12), transparent), radial-gradient(900px 500px at 20% 70%, rgba(255,200,0,0.08), transparent)"}} />
      <div className="relative z-10 w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <img src="/radiation-icon.svg" alt="Dose Monitor" className="h-16 w-16" />
          <div className="mt-2 text-2xl font-bold text-foreground">Dose Monitor</div>
        </div>
        <div className="rounded-lg border border-border bg-card/80 p-6 shadow backdrop-blur">
          <h1 className="mb-4 text-xl font-bold text-foreground">Masuk</h1>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); handleLogin(); }}>
            <Input placeholder="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="submit" disabled={loading} className="w-full">{loading ? "Memproses..." : "Masuk"}</Button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
