import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Download, Calendar, Search } from "lucide-react";
import Sidebar from "@/components/Sidebar";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

interface DoseRecord {
  id: number;
  study_instance_uid: string;
  patient_id: string;
  patient_name: string;
  study_date?: string;
  modality: string;
  patient_sex?: string;
  patient_age_years?: number;
  patient_weight_kg?: number;
  exam_type?: string;
  contrast_used?: boolean;
  sequence_count?: number;
  ctdivol_mgy?: number;
  ctdivol_average_mgy?: number;
  total_dlp_mgycm?: number;
  manufacturer?: string;
  station_name?: string;
  extraction_method?: string;
  extraction_status: string;
  idrl_status?: string;
  created_at: string;
}

type ReportingDataResponse = {
  records: DoseRecord[];
  total_count: number;
  summary: Record<string, any>;
};

const Reporting = () => {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [patientId, setPatientId] = useState<string>("");
  const [manufacturer, setManufacturer] = useState<string>("");

  const formatDateDDMMYYYY = (d?: string): string => {
    if (!d) return "-";
    const ds = String(d);
    if (/^\d{8}$/.test(ds)) {
      return `${ds.slice(6,8)}/${ds.slice(4,6)}/${ds.slice(0,4)}`;
    }
    return ds;
  };

  const formatSex = (s?: string): string => {
    if (!s) return "-";
    const t = String(s).trim().toUpperCase();
    if (t === "M") return "Male";
    if (t === "F") return "Female";
    return String(s);
  };

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "200");
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (patientId) params.set("patient_id", patientId);
    if (manufacturer) params.set("manufacturer", manufacturer);
    return params.toString();
  }, [startDate, endDate, patientId, manufacturer]);

  const { data, isLoading, refetch } = useQuery<ReportingDataResponse>({
    queryKey: ["reporting-data", queryParams],
    queryFn: async () => {
      const token = (() => { try { return localStorage.getItem("auth_token") || ""; } catch { return ""; } })();
      const res = await fetch(`${API_BASE}/api/v1/reporting-data?${queryParams}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) throw new Error(`Gagal memuat reporting data: ${res.status}`);
      return res.json();
    },
  });

  const records = data?.records ?? [];

  // Inline editing state
  const [editing, setEditing] = useState<{ id: number; field: keyof DoseRecord } | null>(null);
  const [tempValue, setTempValue] = useState<string>("");

  const startEdit = (record: DoseRecord, field: keyof DoseRecord, current: any) => {
    const display = current === undefined || current === null ? "" : String(current);
    setEditing({ id: record.id, field });
    setTempValue(display === "-" ? "" : display);
  };

  const normalizeValue = (field: keyof DoseRecord, value: string): any => {
    const v = value.trim();
    if (v === "") return undefined;
    switch (field) {
      case "patient_age_years":
      case "sequence_count":
        return Number.isNaN(parseInt(v)) ? undefined : parseInt(v);
      case "patient_weight_kg":
      case "ctdivol_mgy":
      case "ctdivol_average_mgy":
      case "total_dlp_mgycm":
        return Number.isNaN(parseFloat(v)) ? undefined : parseFloat(v);
      case "patient_sex": {
        const t = v.toLowerCase();
        if (t.startsWith("m")) return "M";
        if (t.startsWith("f")) return "F";
        return v;
      }
      case "contrast_used": {
        const t = v.toLowerCase();
        if (t.includes("kontras") || t === "true" || t === "ya") return true;
        if (t.includes("non") || t === "false" || t === "tidak") return false;
        return undefined;
      }
      default:
        return v;
    }
  };

  const saveCell = async (record: DoseRecord, field: keyof DoseRecord) => {
    const normalized = normalizeValue(field, tempValue);
    setEditing(null);
    try {
      // Backend requires patient_id and patient_name (Pydantic schema)
      const payload: any = {
        study_instance_uid: record.study_instance_uid,
        patient_id: record.patient_id,
        patient_name: record.patient_name,
      };
      // Target specific backend fields
      if (field === "ctdivol_average_mgy") {
        payload.ctdivol_average_mgy = normalized;
        payload.ctdivol_mgy = normalized; // keep both in sync if edited inline
      } else if (field === "contrast_used") {
        payload.contrast_used = normalized;
      } else if (field === "patient_id") {
        payload.patient_id = normalized;
      } else if (field === "patient_name") {
        payload.patient_name = normalized;
      } else {
        payload[field] = normalized;
      }

      const res = await fetch(`${API_BASE}/api/v1/save-dose`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...( (()=>{ try{ const t=localStorage.getItem('auth_token')||''; return t?{Authorization:`Bearer ${t}`}:{} }catch{return {} }})() ) },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || "Gagal menyimpan perubahan");
      // Refresh so IDRL status recalculates if needed
      await refetch();
      setTempValue("");
      // Feedback
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      toast({ title: "Tersimpan", description: `Kolom ${String(field)} berhasil diperbarui.` });
    } catch (err: any) {
      toast({ title: "Gagal menyimpan", description: err.message || String(err), variant: "destructive" });
    }
  };

  const handleExport = async () => {
    try {
      const url = `${API_BASE}/api/v1/export/excel?${queryParams}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Gagal export Excel");
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `dose_export_${startDate || "all"}_${endDate || "all"}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      toast({ title: "Export gagal", description: err.message || String(err), variant: "destructive" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-60 p-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Saved Dose Data (Reporting)</h1>
            <p className="text-muted-foreground">Verifikasi, filter, dan export data dosis</p>
          </div>
          <Button variant="outline" className="gap-2" onClick={handleExport}>
            <Download className="h-4 w-4" />
            Export to Excel
          </Button>
        </header>

        <div className="mb-4 grid grid-cols-4 gap-4">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="date" placeholder="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="pl-9" />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="date" placeholder="End date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="pl-9" />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Patient ID" value={patientId} onChange={(e) => setPatientId(e.target.value)} className="pl-9" />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} className="pl-9" />
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <Button onClick={() => refetch()}>Apply Filter</Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Tanggal Pemeriksaan</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Kode Pasien</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Nama Pasien</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Jenis Kelamin</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Usia (tahun)</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Berat Badan (kg)</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Jenis Pemeriksaan</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Kontras</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Jumlah Sequence</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">CTDIvol rata-rata (mGy)</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">DLP Total (mGy·cm)</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Manufacturer</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Station Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className="px-4 py-3 text-sm text-muted-foreground" colSpan={14}>Loading data...</td>
                  </tr>
                )}
                {!isLoading && records.map((r) => (
                  <tr key={r.id} className="border-b border-border transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm text-muted-foreground">{formatDateDDMMYYYY(r.study_date)}</td>
                    <td className="px-4 py-3 text-sm text-foreground" onDoubleClick={() => startEdit(r, "patient_id", r.patient_id)}>
                      {editing?.id === r.id && editing.field === "patient_id" ? (
                        <Input autoFocus value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "patient_id")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "patient_id") : undefined} />
                      ) : (r.patient_id || "-")}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground" onDoubleClick={() => startEdit(r, "patient_name", r.patient_name)}>
                      {editing?.id === r.id && editing.field === "patient_name" ? (
                        <Input autoFocus value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "patient_name")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "patient_name") : undefined} />
                      ) : (r.patient_name)}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground" onDoubleClick={() => startEdit(r, "patient_sex", r.patient_sex)}>
                      {editing?.id === r.id && editing.field === "patient_sex" ? (
                        <Input autoFocus placeholder="M/F atau Male/Female" value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "patient_sex")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "patient_sex") : undefined} />
                      ) : (formatSex(r.patient_sex))}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground" onDoubleClick={() => startEdit(r, "patient_age_years", r.patient_age_years)}>
                      {editing?.id === r.id && editing.field === "patient_age_years" ? (
                        <Input autoFocus type="number" value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "patient_age_years")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "patient_age_years") : undefined} />
                      ) : (r.patient_age_years ?? "-")}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground" onDoubleClick={() => startEdit(r, "patient_weight_kg", r.patient_weight_kg)}>
                      {editing?.id === r.id && editing.field === "patient_weight_kg" ? (
                        <Input autoFocus type="number" step="0.1" value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "patient_weight_kg")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "patient_weight_kg") : undefined} />
                      ) : (r.patient_weight_kg ?? "-")}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground" onDoubleClick={() => startEdit(r, "exam_type", r.exam_type)}>
                      {editing?.id === r.id && editing.field === "exam_type" ? (
                        <Input autoFocus value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "exam_type")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "exam_type") : undefined} />
                      ) : (r.exam_type || "-")}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground" onDoubleClick={() => startEdit(r, "contrast_used", r.contrast_used === true ? "Kontras" : "Non Kontras")}>
                      {editing?.id === r.id && editing.field === "contrast_used" ? (
                        <Input autoFocus placeholder="Kontras / Non Kontras" value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "contrast_used")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "contrast_used") : undefined} />
                      ) : (r.contrast_used === true ? "Kontras" : "Non Kontras")}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground" onDoubleClick={() => startEdit(r, "sequence_count", r.sequence_count)}>
                      {editing?.id === r.id && editing.field === "sequence_count" ? (
                        <Input autoFocus type="number" value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "sequence_count")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "sequence_count") : undefined} />
                      ) : (r.sequence_count ?? "-")}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground" onDoubleClick={() => startEdit(r, "ctdivol_average_mgy", r.ctdivol_average_mgy ?? r.ctdivol_mgy)}>
                      {editing?.id === r.id && editing.field === "ctdivol_average_mgy" ? (
                        <Input autoFocus type="number" step="0.01" value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "ctdivol_average_mgy")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "ctdivol_average_mgy") : undefined} />
                      ) : (r.ctdivol_average_mgy ?? r.ctdivol_mgy ?? "-")}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground" onDoubleClick={() => startEdit(r, "total_dlp_mgycm", r.total_dlp_mgycm)}>
                      {editing?.id === r.id && editing.field === "total_dlp_mgycm" ? (
                        <Input autoFocus type="number" step="0.1" value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "total_dlp_mgycm")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "total_dlp_mgycm") : undefined} />
                      ) : (r.total_dlp_mgycm ?? "-")}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground" onDoubleClick={() => startEdit(r, "manufacturer", r.manufacturer)}>
                      {editing?.id === r.id && editing.field === "manufacturer" ? (
                        <Input autoFocus value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "manufacturer")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "manufacturer") : undefined} />
                      ) : (r.manufacturer || "-")}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground" onDoubleClick={() => startEdit(r, "station_name", r.station_name)}>
                      {editing?.id === r.id && editing.field === "station_name" ? (
                        <Input autoFocus value={tempValue} onChange={(e) => setTempValue(e.target.value)}
                          onBlur={() => saveCell(r, "station_name")} onKeyDown={(e) => e.key === "Enter" ? saveCell(r, "station_name") : undefined} />
                      ) : (r.station_name || "-")}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{r.idrl_status || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reporting;