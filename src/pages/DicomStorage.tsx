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

const DicomStorage = () => {
  const { toast } = useToast();
  const token = getToken();
  const [orthancUrl, setOrthancUrl] = useState("");
  const [orthancStatus, setOrthancStatus] = useState<string>("");

  const fetchOrthancConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/orthanc-config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Gagal memuat konfigurasi Orthanc");
      setOrthancUrl(json.base_url || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  const testOrthanc = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/orthanc-status`);
      const json = await res.json();
      if (json.status === "connected") {
        setOrthancStatus(`Terhubung: ${json.orthanc_url}`);
        toast({ title: "Koneksi berhasil", description: "Orthanc dapat diakses" });
      } else {
        setOrthancStatus(`Tidak terhubung: ${json.orthanc_url}`);
        toast({ title: "Koneksi gagal", description: json.error || "Orthanc tidak dapat diakses", variant: "destructive" });
      }
    } catch (err: unknown) {
      setOrthancStatus("Error menguji koneksi");
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  const saveOrthancConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/orthanc-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ base_url: orthancUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Gagal menyimpan konfigurasi");
      setOrthancUrl(json.base_url || orthancUrl);
      toast({ title: "Berhasil", description: "Konfigurasi Orthanc disimpan" });
      testOrthanc();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Gagal", description: msg, variant: "destructive" });
    }
  };

  useEffect(() => { fetchOrthancConfig(); }, []);

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="w-full p-6 pt-14 transition-all duration-300" style={{ marginLeft: "var(--sidebar-width)" }}>
        <h1 className="mb-4 text-xl font-bold text-foreground">Setting Dicom Storage</h1>
        <div className="mb-4 flex gap-3">
          <Input placeholder="Orthanc URL (mis. http://localhost:8042)" value={orthancUrl} onChange={(e) => setOrthancUrl(e.target.value)} />
          <Button variant="outline" onClick={testOrthanc}>Test Koneksi</Button>
          <Button onClick={saveOrthancConfig}>Simpan</Button>
        </div>
        {orthancStatus ? (
          <div className="text-sm text-muted-foreground">{orthancStatus}</div>
        ) : null}
      </div>
    </div>
  );
};

export default DicomStorage;
