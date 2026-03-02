import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Download } from "lucide-react";
import EditEntryDialog from "./EditEntryDialog";
import Sidebar from "./Sidebar";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

interface StudyInfo {
  study_instance_uid: string;
  patient_id: string;
  patient_name: string;
  study_date?: string;
  modality: string;
  // Extended fields to match Orthanc worklist
  patient_birth_date?: string;
  study_description?: string;
  modalities_in_study?: string;
  accession_number?: string;
  saved?: boolean;
  extracted_success?: boolean;
}

type PatientListResponse = {
  studies: StudyInfo[];
  total_count: number;
};

interface ExtractDoseResponse {
  study_instance_uid: string;
  ctdivol_mgy?: number;
  ctdivol_average_mgy?: number;
  total_dlp_mgycm?: number;
  manufacturer?: string;
  station_name?: string;
  extraction_method?: string;
  extraction_status: string;
  extraction_notes?: string;
}

const PatientList = () => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStudy, setSelectedStudy] = useState<StudyInfo | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [extraction, setExtraction] = useState<ExtractDoseResponse | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [sortKey, setSortKey] = useState<keyof StudyInfo | "study_date_parsed">("study_date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data, isLoading, isError, refetch } = useQuery<PatientListResponse>({
    queryKey: ["patient-list"],
    queryFn: async () => {
      const token = (() => { try { return localStorage.getItem("auth_token") || ""; } catch { return ""; } })();
      const res = await fetch(`${API_BASE}/api/v1/patient-list?limit=100&modality=ALL`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) {
        throw new Error(`Gagal memuat patient list: ${res.status}`);
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (isError) {
      toast({ title: "Gagal memuat data", description: "Periksa koneksi Orthanc/backend.", variant: "destructive" });
    }
  }, [isError, toast]);

  const studies = useMemo(() => data?.studies ?? [], [data]);

  const filteredStudies = useMemo(
    () =>
      studies.filter((s) => {
        const term = searchTerm.toLowerCase();
        const matchesSearch = (
          s.patient_name.toLowerCase().includes(term) ||
          s.patient_id.toLowerCase().includes(term) ||
          (s.study_instance_uid || "").toLowerCase().includes(term) ||
          (s.study_date || "").toLowerCase().includes(term) ||
          (s.patient_birth_date || "").toLowerCase().includes(term) ||
          (s.study_description || "").toLowerCase().includes(term) ||
          (s.modalities_in_study || "").toLowerCase().includes(term) ||
          (s.accession_number || "").toLowerCase().includes(term)
        );
        const isPending = !(s.saved) && !(s.extracted_success);
        return matchesSearch && (showAll ? true : isPending);
      }),
    [studies, searchTerm, showAll]
  );

  const parseStudyDate = (d?: string) => {
    if (!d) return 0;
    const s = String(d).trim();
    if (/^\d{8}$/.test(s)) {
      const y = parseInt(s.slice(0, 4));
      const m = parseInt(s.slice(4, 6));
      const dd = parseInt(s.slice(6, 8));
      return new Date(y, m - 1, dd).getTime();
    }
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
      const [dd, mm, yyyy] = s.split("/").map((x) => parseInt(x));
      return new Date(yyyy, mm - 1, dd).getTime();
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const [yyyy, mm, dd] = s.split("-").map((x) => parseInt(x));
      return new Date(yyyy, mm - 1, dd).getTime();
    }
    const t = Date.parse(s);
    return Number.isNaN(t) ? 0 : t;
  };

  const sortedStudies = useMemo(() => {
    const arr = [...filteredStudies];
    arr.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortKey === "study_date" || sortKey === "study_date_parsed") {
        const av = parseStudyDate(a.study_date);
        const bv = parseStudyDate(b.study_date);
        return av === bv ? 0 : av > bv ? dir : -dir;
      }
      const av = (a[sortKey as keyof StudyInfo] ?? "") as any;
      const bv = (b[sortKey as keyof StudyInfo] ?? "") as any;
      if (typeof av === "number" && typeof bv === "number") return av === bv ? 0 : av > bv ? dir : -dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
    return arr;
  }, [filteredStudies, sortKey, sortDir]);

  const toggleSort = (key: keyof StudyInfo | "study_date_parsed") => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "study_date" || key === "study_date_parsed" ? "desc" : "asc");
    }
  };

  const handleGetDose = async (study: StudyInfo) => {
    try {
      setSelectedStudy(study);
      setDialogOpen(true);
      setExtraction(null);
      const token = (() => { try { return localStorage.getItem("auth_token") || ""; } catch { return ""; } })();
      const res = await fetch(`${API_BASE}/api/v1/extract-dose`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ study_instance_uid: study.study_instance_uid }),
      });
      const json: ExtractDoseResponse = await res.json();
      if (!res.ok) {
        throw new Error(json?.extraction_notes || "Ekstraksi gagal");
      }
      setExtraction(json);
      toast({ title: "Ekstraksi Berhasil", description: `Metode: ${json.extraction_method || "N/A"}` });
    } catch (err: any) {
      toast({ title: "Gagal ekstrak dosis", description: err.message || String(err), variant: "destructive" });
    }
  };

  const handleGetAllDose = async () => {
    try {
      setBulkLoading(true);
      const token = (() => { try { return localStorage.getItem("auth_token") || ""; } catch { return ""; } })();
      const targets = filteredStudies;
      let ok = 0;
      let fail = 0;
      for (const s of targets) {
        try {
          const res = await fetch(`${API_BASE}/api/v1/extract-and-save-dose`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ study_instance_uid: s.study_instance_uid }),
          });
          if (!res.ok) {
            fail++;
          } else {
            ok++;
          }
        } catch {
          fail++;
        }
      }
      toast({ title: "Get All Dose", description: `Berhasil: ${ok}, Gagal: ${fail}` });
      await refetch();
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="p-6 pt-14 transition-all duration-300" style={{ marginLeft: "var(--sidebar-width)" }}>
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Radiology Dose Management</h1>
            <p className="text-muted-foreground">CT Dose Monitoring System</p>
          </div>
          <div className="flex gap-2">
            <Button variant="default" onClick={handleGetAllDose} disabled={bulkLoading}>
              {bulkLoading ? "Processing..." : "Get All Dose"}
            </Button>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Export to Excel
            </Button>
          </div>
        </header>

        <div className="mb-4 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by patient name, ID, or accession number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant={showAll ? "default" : "secondary"} onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Filter On" : "Filter"}
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("patient_birth_date")}>
                    Patient Birthdate {sortKey === "patient_birth_date" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("patient_name")}>
                    Patient Name {sortKey === "patient_name" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("patient_id")}>
                    Patient ID {sortKey === "patient_id" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("study_description")}>
                    Study Description {sortKey === "study_description" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("study_date")}>
                    Study Date {sortKey === "study_date" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("modalities_in_study")}>
                    Modality in Study {sortKey === "modalities_in_study" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground cursor-pointer select-none" onClick={() => toggleSort("accession_number")}>
                    Accession Number {sortKey === "accession_number" ? (sortDir === "asc" ? "▲" : "▼") : ""}
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Status</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className="px-4 py-3 text-sm text-muted-foreground" colSpan={8}>Loading data...</td>
                  </tr>
                )}
                {!isLoading && sortedStudies.map((study) => (
                  <tr
                    key={study.study_instance_uid}
                    className="border-b border-border transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-sm text-foreground">{study.patient_birth_date || "-"}</td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">{study.patient_name}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{study.patient_id}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{study.study_description || "-"}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{study.study_date || "-"}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{study.modalities_in_study || "-"}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{study.accession_number || "-"}</td>
                    <td className="px-4 py-3 text-sm">
                      {study.saved ? (
                        <span className="inline-flex items-center rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-700">Saved</span>
                      ) : study.extracted_success ? (
                        <span className="inline-flex items-center rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700">Extracted</span>
                      ) : (
                        <span className="inline-flex items-center rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">Pending</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        onClick={() => handleGetDose(study)}
                        className="bg-primary text-primary-foreground hover:bg-primary/90"
                      >
                        Get Dose
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedStudy && (
        <EditEntryDialog
          study={selectedStudy}
          extraction={extraction}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
        />
      )}
    </div>
  );
};

export default PatientList;
