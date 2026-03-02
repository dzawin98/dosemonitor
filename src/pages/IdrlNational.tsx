import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

type Threshold = {
  id: number;
  category_key: string;
  contrast: boolean;
  age_group: string;
  year: number;
  ctdi_limit_mgy?: number | null;
  dlp_limit_mgycm?: number | null;
  active: boolean;
};

const ageOptions = [
  { value: "BABY_0_4", label: "Bayi 0-4" },
  { value: "CHILD_5_14", label: "Anak 5-14" },
  { value: "ADULT_15_PLUS", label: "Dewasa ≥15" },
];

const IdrlNational = () => {
  const { toast } = useToast();
  const [data, setData] = useState<Threshold[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{ category_key: string; contrast: boolean; age_group: string; year: number; ctdi_limit_mgy?: string; dlp_limit_mgycm?: string }>({ category_key: "", contrast: false, age_group: "ADULT_15_PLUS", year: 2024 });
  const [editRow, setEditRow] = useState<Threshold | null>(null);
  const [sortKey, setSortKey] = useState<keyof Threshold>("category_key");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const token = (() => { try { return localStorage.getItem("auth_token") || ""; } catch { return ""; } })();

  const fetchList = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/idrl-national`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      const json = await res.json();
      setData(json || []);
    } catch (e) {
      toast({ title: "Gagal memuat", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchList(); }, []);

  const sortedData = useMemo(() => {
    const arr = [...data];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const av = (a[sortKey] ?? "") as any;
      const bv = (b[sortKey] ?? "") as any;
      if (typeof av === "number" && typeof bv === "number") return av === bv ? 0 : av > bv ? dir : -dir;
      if (typeof av === "boolean" && typeof bv === "boolean") return av === bv ? 0 : av ? dir : -dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return arr;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: keyof Threshold) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleCreate = async () => {
    try {
      const body = {
        category_key: form.category_key,
        contrast: !!form.contrast,
        age_group: form.age_group,
        year: Number(form.year || 2024),
        ctdi_limit_mgy: form.ctdi_limit_mgy !== undefined ? Number(form.ctdi_limit_mgy) : undefined,
        dlp_limit_mgycm: form.dlp_limit_mgycm !== undefined ? Number(form.dlp_limit_mgycm) : undefined,
      };
      const res = await fetch(`${API_BASE}/api/v1/idrl-national`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Gagal simpan (${res.status})`);
      setOpen(false);
      setForm({ category_key: "", contrast: false, age_group: "ADULT_15_PLUS", year: 2024 });
      await fetchList();
      toast({ title: "Tersimpan", description: "IDRL nasional ditambahkan" });
    } catch (e: any) {
      toast({ title: "Gagal simpan", description: e.message || String(e), variant: "destructive" });
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/idrl-national/${id}`, { method: "DELETE", headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) throw new Error(`Gagal hapus (${res.status})`);
      await fetchList();
      toast({ title: "Terhapus", description: `ID ${id}` });
    } catch (e: any) {
      toast({ title: "Gagal hapus", description: e.message || String(e), variant: "destructive" });
    }
  };

  const handleUpdate = async () => {
    if (!editRow) return;
    try {
      const body: any = {
        category_key: editRow.category_key,
        contrast: editRow.contrast,
        age_group: editRow.age_group,
        year: editRow.year,
        ctdi_limit_mgy: editRow.ctdi_limit_mgy,
        dlp_limit_mgycm: editRow.dlp_limit_mgycm,
        active: editRow.active,
      };
      const res = await fetch(`${API_BASE}/api/v1/idrl-national/${editRow.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Gagal update (${res.status})`);
      setEditRow(null);
      await fetchList();
      toast({ title: "Diperbarui", description: "IDRL nasional diperbarui" });
    } catch (e: any) {
      toast({ title: "Gagal update", description: e.message || String(e), variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="p-6 pt-14 transition-all duration-300" style={{ marginLeft: "var(--sidebar-width)" }}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">IDRL Nasional</h1>
            <p className="text-muted-foreground">Kelola batas CTDIvol dan DLP per kategori dan kelompok usia</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Tambah</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Tambah IDRL Nasional</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Category key (mis. Kepala Kontras, CT Head)" value={form.category_key} onChange={(e) => setForm({ ...form, category_key: e.target.value })} />
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={form.contrast} onChange={(e) => setForm({ ...form, contrast: e.target.checked })} />
                  <span className="text-sm">Kontras</span>
                </div>
                <select className="w-full rounded border border-border bg-background p-2 text-sm" value={form.age_group} onChange={(e) => setForm({ ...form, age_group: e.target.value })}>
                  {ageOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <Input placeholder="Tahun" value={String(form.year)} onChange={(e) => setForm({ ...form, year: Number(e.target.value || 2024) })} />
                <Input placeholder="CTDIvol limit (mGy)" value={form.ctdi_limit_mgy ?? ""} onChange={(e) => setForm({ ...form, ctdi_limit_mgy: e.target.value })} />
                <Input placeholder="DLP limit (mGy·cm)" value={form.dlp_limit_mgycm ?? ""} onChange={(e) => setForm({ ...form, dlp_limit_mgycm: e.target.value })} />
              </div>
              <DialogFooter>
                <Button onClick={handleCreate}>Simpan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("category_key")}>
                    Kategori {sortKey === "category_key" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("contrast")}>
                    Kontras {sortKey === "contrast" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("age_group")}>
                    Kelompok Usia {sortKey === "age_group" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("year")}>
                    Tahun {sortKey === "year" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("ctdi_limit_mgy")}>
                    CTDIvol (mGy) {sortKey === "ctdi_limit_mgy" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("dlp_limit_mgycm")}>
                    DLP (mGy·cm) {sortKey === "dlp_limit_mgycm" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("active")}>
                    Aktif {sortKey === "active" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td className="px-4 py-3 text-sm text-muted-foreground" colSpan={8}>Loading...</td></tr>
                )}
                {!loading && sortedData.map((r) => (
                  <tr key={r.id} className="border-b border-border">
                    <td className="px-4 py-3 text-sm">{r.category_key}</td>
                    <td className="px-4 py-3 text-sm">{r.contrast ? "Ya" : "Tidak"}</td>
                    <td className="px-4 py-3 text-sm">{ageOptions.find(a => a.value === r.age_group)?.label || r.age_group}</td>
                    <td className="px-4 py-3 text-sm">{r.year}</td>
                    <td className="px-4 py-3 text-sm">{r.ctdi_limit_mgy ?? "-"}</td>
                    <td className="px-4 py-3 text-sm">{r.dlp_limit_mgycm ?? "-"}</td>
                    <td className="px-4 py-3 text-sm">{r.active ? "Ya" : "Tidak"}</td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <Button variant="secondary" onClick={() => setEditRow(r)}>Edit</Button>
                        <Button variant="destructive" onClick={() => handleDelete(r.id)}>Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {editRow && (
          <Dialog open={true} onOpenChange={(o) => { if (!o) setEditRow(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit IDRL Nasional</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input value={editRow.category_key} onChange={(e) => setEditRow({ ...editRow, category_key: e.target.value })} />
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={editRow.contrast} onChange={(e) => setEditRow({ ...editRow, contrast: e.target.checked })} />
                  <span className="text-sm">Kontras</span>
                </div>
                <select className="w-full rounded border border-border bg-background p-2 text-sm" value={editRow.age_group} onChange={(e) => setEditRow({ ...editRow, age_group: e.target.value })}>
                  {ageOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <Input value={String(editRow.year)} onChange={(e) => setEditRow({ ...editRow, year: Number(e.target.value || 2024) })} />
                <Input placeholder="CTDIvol" value={editRow.ctdi_limit_mgy ?? ""} onChange={(e) => setEditRow({ ...editRow, ctdi_limit_mgy: Number(e.target.value || 0) })} />
                <Input placeholder="DLP" value={editRow.dlp_limit_mgycm ?? ""} onChange={(e) => setEditRow({ ...editRow, dlp_limit_mgycm: Number(e.target.value || 0) })} />
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={editRow.active} onChange={(e) => setEditRow({ ...editRow, active: e.target.checked })} />
                  <span className="text-sm">Aktif</span>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleUpdate}>Simpan</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

      </div>
    </div>
  );
};

export default IdrlNational;
