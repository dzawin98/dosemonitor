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

  const { data, isLoading, isError, refetch } = useQuery<PatientListResponse>({
    queryKey: ["patient-list"],
    queryFn: async () => {
      const token = (() => { try { return localStorage.getItem("auth_token") || ""; } catch { return ""; } })();
      const res = await fetch(`${API_BASE}/api/v1/patient-list?limit=100&modality=CT`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
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
        return (
          s.patient_name.toLowerCase().includes(term) ||
          s.patient_id.toLowerCase().includes(term) ||
          (s.study_instance_uid || "").toLowerCase().includes(term) ||
          (s.study_date || "").toLowerCase().includes(term) ||
          (s.patient_birth_date || "").toLowerCase().includes(term) ||
          (s.study_description || "").toLowerCase().includes(term) ||
          (s.modalities_in_study || "").toLowerCase().includes(term) ||
          (s.accession_number || "").toLowerCase().includes(term)
        );
      }),
    [studies, searchTerm]
  );

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

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="ml-60 p-6">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Radiology Dose Management</h1>
            <p className="text-muted-foreground">CT Dose Monitoring System</p>
          </div>
          <Button variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export to Excel
          </Button>
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
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Patient Birthdate</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Patient Name</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Patient ID</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Study Description</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Study Date</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Modality in Study</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Accession Number</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className="px-4 py-3 text-sm text-muted-foreground" colSpan={8}>Loading data...</td>
                  </tr>
                )}
                {!isLoading && filteredStudies.map((study) => (
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
