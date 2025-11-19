import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const ORTHANC_BASE = import.meta.env.VITE_ORTHANC_BASE_URL ?? "http://localhost:8042";

interface StudyInfo {
  study_instance_uid: string;
  patient_id: string;
  patient_name: string;
  study_date?: string;
  modality: string;
}

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

interface StudyTagsResponse {
  study_instance_uid: string;
  status: string;
  source?: string;
  notes?: string;
  tags: Record<string, any>;
}

// Removed Exam interface and related UI since it's non-functional

interface EditEntryDialogProps {
  study: StudyInfo;
  extraction: ExtractDoseResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EditEntryDialog = ({ study, extraction, open, onOpenChange }: EditEntryDialogProps) => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("dose");
  const [tagsData, setTagsData] = useState<Record<string, any> | null>(null);
  const [tagsLoading, setTagsLoading] = useState<boolean>(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [tagsQuery, setTagsQuery] = useState<string>("");
  const [expandedSeq, setExpandedSeq] = useState<Record<string, boolean>>({});

  const formatValue = (val: any, type?: string): string => {
    try {
      if (type === "Sequence" && Array.isArray(val)) {
        return `(Sequence) Items: ${val.length}`;
      }
      if (Array.isArray(val)) {
        return val.map((v) => String(v)).join(", ");
      }
      if (typeof val === "object" && val !== null) {
        return JSON.stringify(val);
      }
      if (val === null || val === undefined) return "";
      return String(val);
    } catch {
      return String(val);
    }
  };

  const tagRows = (() => {
    if (!tagsData) return [] as Array<{ tag: string; name: string; type: string; value: string; rawValue: any; searchBlob: string }>;
    const rows = Object.entries(tagsData).map(([tag, info]: [string, any]) => {
      const name = info?.Name ?? "";
      const type = info?.Type ?? "";
      const rawValue = info?.Value;
      const value = formatValue(rawValue, type);
      let searchBlob = "";
      try {
        searchBlob = JSON.stringify(rawValue ?? "");
      } catch {
        searchBlob = String(rawValue ?? "");
      }
      return { tag, name, type, value, rawValue, searchBlob };
    });
    const q = tagsQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.tag.toLowerCase().includes(q) ||
      r.name.toLowerCase().includes(q) ||
      r.type.toLowerCase().includes(q) ||
      r.value.toLowerCase().includes(q) ||
      r.searchBlob.toLowerCase().includes(q)
    );
  })();

  const toggleSeq = (tag: string) => {
    setExpandedSeq((prev) => ({ ...prev, [tag]: !prev[tag] }));
  };
  // Helpers for reading tags and formatting patient info
  const readTag = (key: string, fallbackTag?: string): any => {
    if (!tagsData) return undefined;
    const byName = Object.entries(tagsData).find(([_t, info]: [string, any]) => info?.Name === key);
    if (byName) {
      const info: any = byName[1];
      const v = info?.Value;
      return Array.isArray(v) ? v[0] ?? v : v;
    }
    if (fallbackTag && tagsData[fallbackTag]) {
      const v = tagsData[fallbackTag]?.Value;
      return Array.isArray(v) ? v[0] ?? v : v;
    }
    return undefined;
  };
  const parseAgeYears = (raw: any) => {
    if (!raw) return undefined;
    try {
      const s = String(raw).trim().toUpperCase();
      if (s.endsWith("Y")) return Number(s.slice(0, -1));
      if (s.endsWith("M")) return Number((Number(s.slice(0, -1)) / 12).toFixed(2));
      if (s.endsWith("D")) return Number((Number(s.slice(0, -1)) / 365).toFixed(2));
      const n = Number(s);
      return Number.isNaN(n) ? undefined : n;
    } catch {
      return undefined;
    }
  };
  const mapSex = (raw: any): string | undefined => {
    if (raw === undefined || raw === null) return undefined;
    const s = String(raw).trim().toUpperCase();
    if (s === "M") return "Male";
    if (s === "F") return "Female";
    return String(raw);
  };
  const formatDateDDMMYYYY = (d?: string): string | undefined => {
    if (!d) return undefined;
    const ds = String(d);
    if (ds.length === 8 && /^\d{8}$/.test(ds)) {
      return `${ds.slice(6,8)}/${ds.slice(4,6)}/${ds.slice(0,4)}`;
    }
    return ds;
  };
  // State untuk input manual CTDIvol dan Total DLP
  const [ctdivolInput, setCtdivolInput] = useState<string>("");
  const [dlpInput, setDlpInput] = useState<string>("");

  // Sinkronisasi nilai awal dari hasil ekstraksi saat dialog dibuka atau extraction berubah
  useEffect(() => {
    if (open) {
      setCtdivolInput(
        extraction?.ctdivol_mgy !== undefined && extraction?.ctdivol_mgy !== null
          ? String(extraction.ctdivol_mgy)
          : ""
      );
      setDlpInput(
        extraction?.total_dlp_mgycm !== undefined && extraction?.total_dlp_mgycm !== null
          ? String(extraction.total_dlp_mgycm)
          : ""
      );
      // Reset tags state when dialog opens
      setTagsData(null);
      setTagsError(null);
      setTagsLoading(false);
    }
  }, [open, extraction?.ctdivol_mgy, extraction?.total_dlp_mgycm]);

  useEffect(() => {
    const fetchTags = async () => {
      try {
        setTagsLoading(true);
        setTagsError(null);
        const res = await fetch(`${API_BASE}/api/v1/study-tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ study_instance_uid: study.study_instance_uid }),
        });
        const json: StudyTagsResponse = await res.json();
        if (!res.ok || json.status !== "SUCCESS") {
          throw new Error(json?.notes || "Gagal mengambil tags");
        }
        setTagsData(json.tags || {});
      } catch (err: any) {
        setTagsError(err.message || String(err));
      } finally {
        setTagsLoading(false);
      }
    };

    // Ambil tags segera saat dialog dibuka agar field seperti PatientAge/PatientSex siap untuk disimpan
    if (open && !tagsData && !tagsLoading && !tagsError) {
      fetchTags();
    }
  }, [open, activeTab]);

  const handleSave = async () => {
    try {
      const ctdivolNumeric = ctdivolInput.trim() === "" ? undefined : Number(ctdivolInput);
      const dlpNumeric = dlpInput.trim() === "" ? undefined : Number(dlpInput);

      if (ctdivolInput.trim() !== "" && Number.isNaN(ctdivolNumeric)) {
        throw new Error("CTDIvol tidak valid");
      }
      if (dlpInput.trim() !== "" && Number.isNaN(dlpNumeric)) {
        throw new Error("Total DLP tidak valid");
      }

      // Helper to read tag value by tag number or keyword name
      const readTag = (key: string, fallbackTag?: string): any => {
        if (!tagsData) return undefined;
        const byName = Object.entries(tagsData).find(([_t, info]: [string, any]) => info?.Name === key);
        if (byName) {
          const info: any = byName[1];
          const v = info?.Value;
          return Array.isArray(v) ? v[0] ?? v : v;
        }
        if (fallbackTag && tagsData[fallbackTag]) {
          const v = tagsData[fallbackTag]?.Value;
          return Array.isArray(v) ? v[0] ?? v : v;
        }
        return undefined;
      };
      const toNumber = (v: any) => {
        if (v === undefined || v === null) return undefined;
        const n = Number(v);
        return Number.isNaN(n) ? undefined : n;
      };
      const parseAgeYears = (raw: any) => {
        if (!raw) return undefined;
        try {
          const s = String(raw).trim().toUpperCase();
          if (s.endsWith("Y")) return Number(s.slice(0, -1));
          if (s.endsWith("M")) return Number((Number(s.slice(0, -1)) / 12).toFixed(2));
          if (s.endsWith("D")) return Number((Number(s.slice(0, -1)) / 365).toFixed(2));
          const n = Number(s);
          return Number.isNaN(n) ? undefined : n;
        } catch {
          return undefined;
        }
      };
      const mapSex = (raw: any): string | undefined => {
        if (raw === undefined || raw === null) return undefined;
        const s = String(raw).trim().toUpperCase();
        if (s === "M") return "Male";
        if (s === "F") return "Female";
        return String(raw);
      };
      const sex = mapSex(readTag("PatientSex", "0010,0040"));
      const ageYears = parseAgeYears(readTag("PatientAge", "0010,1010"));
      const weightKg = toNumber(readTag("PatientWeight", "0010,1030"));
      const examType = readTag("StudyDescription", "0008,1030") ?? readTag("SeriesDescription", "0008,103E") ?? readTag("BodyPartExamined", "0018,0015");
      const contrastAgent = readTag("ContrastBolusAgent", "0018,0010");
      const contrastVol = toNumber(readTag("ContrastBolusVolume", "0018,1041"));
      const contrastUsed = contrastAgent !== undefined || (contrastVol !== undefined && contrastVol > 0);

      const formatDateDDMMYYYY = (d?: string): string | undefined => {
        if (!d) return undefined;
        const ds = String(d);
        if (ds.length === 8 && /^\d{8}$/.test(ds)) {
          return `${ds.slice(6,8)}/${ds.slice(4,6)}/${ds.slice(0,4)}`;
        }
        return ds;
      };

      const payload = {
        study_instance_uid: study.study_instance_uid,
        patient_id: study.patient_id,
        patient_name: study.patient_name,
        study_date: formatDateDDMMYYYY(study.study_date),
        patient_sex: sex ?? undefined,
        patient_age_years: ageYears,
        patient_weight_kg: weightKg,
        exam_type: examType ?? undefined,
        contrast_used: contrastUsed ? true : false,
        ctdivol_mgy: ctdivolNumeric ?? extraction?.ctdivol_mgy,
        ctdivol_average_mgy: extraction?.ctdivol_average_mgy,
        total_dlp_mgycm: dlpNumeric ?? extraction?.total_dlp_mgycm,
        manufacturer: extraction?.manufacturer,
        station_name: extraction?.station_name,
        extraction_method: extraction?.extraction_method,
        extraction_status: extraction?.extraction_status || "SUCCESS",
        extraction_notes: extraction?.extraction_notes,
      };
      const res = await fetch(`${API_BASE}/api/v1/save-dose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.detail || json?.error || "Gagal menyimpan data");
      }
      toast({ title: "Berhasil disimpan", description: json?.message || "Dose disimpan." });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Gagal menyimpan", description: err.message || String(err), variant: "destructive" });
    }
  };

  const handleOpenViewer = () => {
    try {
      const base = ORTHANC_BASE.replace(/\/+$/, "");
      const url = `${base}/stone-webviewer/index.html?study=${encodeURIComponent(study.study_instance_uid)}`;
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (err) {
      console.error("Failed to open Orthanc viewer:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-y-auto bg-card p-0">
        <DialogHeader className="sticky top-0 z-10 border-b border-border bg-primary px-6 py-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold text-primary-foreground">Edit Entry</DialogTitle>
            <div className="flex gap-2" />
          </div>
        </DialogHeader>

        <div className="p-6">
          <div className="mb-6 grid grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <span className="text-sm text-muted-foreground">Name</span>
                <span className="text-sm font-medium text-foreground">{study.patient_name}</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <span className="text-sm text-muted-foreground">Birth/Age</span>
                <span className="text-sm font-medium text-foreground">{(() => {
                  const bd = formatDateDDMMYYYY(readTag("PatientBirthDate", "0010,0030"));
                  const age = parseAgeYears(readTag("PatientAge", "0010,1010"));
                  if (bd && age !== undefined) return `${bd} - ${age} tahun`;
                  if (bd) return bd;
                  if (age !== undefined) return `${age} tahun`;
                  return "-";
                })()}</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <span className="text-sm text-muted-foreground">Sex</span>
                <span className="text-sm font-medium text-foreground">{mapSex(readTag("PatientSex", "0010,0040")) ?? "-"}</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <span className="text-sm text-muted-foreground">Room</span>
                <span className="text-sm font-medium text-foreground">POLI SARAF</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <span className="text-sm text-muted-foreground">Clinis</span>
                <span className="text-sm font-medium text-foreground">SUSP NHS IN EVOLUTION, HT</span>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-2">
                <span className="text-sm text-muted-foreground">Reff Physician</span>
                <span className="text-sm font-medium text-foreground">dr. Zulmiyati, Sp.S</span>
              </div>
            </div>

              <div className="space-y-3">
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-sm text-muted-foreground">No RM</span>
                  <span className="text-sm font-medium text-foreground">{study.patient_id}</span>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-sm text-muted-foreground">No RO</span>
                  <span className="text-sm font-medium text-foreground">{readTag("AccessionNumber", "0008,0050") ?? "-"}</span>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-sm text-muted-foreground">Date RO</span>
                  <span className="text-sm font-medium text-foreground">
                    {study.study_date || "-"}
                  </span>
                </div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <span className="text-sm text-muted-foreground">Exam</span>
                  <span className="text-sm font-medium text-foreground">{readTag("StudyDescription", "0008,1030") ?? "-"}</span>
                </div>
              </div>
          </div>

          <div className="mb-6 flex gap-2">
            <Button variant="outline" className="border-primary text-primary hover:bg-primary/10" onClick={handleOpenViewer}>
              View Image
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-muted">
              <TabsTrigger value="dose">Dose</TabsTrigger>
              <TabsTrigger value="tags">Tags</TabsTrigger>
            </TabsList>
            
            <TabsContent value="dose" className="mt-6">
              <div className="space-y-6">
                <div className="rounded-lg border border-border bg-card/50 p-4">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="pb-3 text-left text-sm font-medium text-muted-foreground">Dose</th>
                        <th className="pb-3 text-center text-sm font-medium text-muted-foreground">Value</th>
                        <th className="pb-3 text-right text-sm font-medium text-muted-foreground"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-border">
                        <td className="py-3 text-sm text-foreground">CTDIvol (mGy)</td>
                        <td className="py-3 text-center text-sm">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.001"
                            placeholder="Masukkan CTDIvol"
                            value={ctdivolInput}
                            onChange={(e) => setCtdivolInput(e.target.value)}
                            className="w-full"
                          />
                        </td>
                        <td className="py-3 text-right text-sm font-medium text-muted-foreground">
                          {extraction?.ctdivol_mgy !== undefined ? `Auto: ${extraction.ctdivol_mgy}` : "Auto: -"}
                        </td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-3 text-sm text-foreground">Total DLP (mGy·cm)</td>
                        <td className="py-3 text-center text-sm">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            placeholder="Masukkan Total DLP"
                            value={dlpInput}
                            onChange={(e) => setDlpInput(e.target.value)}
                            className="w-full"
                          />
                        </td>
                        <td className="py-3 text-right text-sm font-medium text-muted-foreground">
                          {extraction?.total_dlp_mgycm !== undefined ? `Auto: ${extraction.total_dlp_mgycm}` : "Auto: -"}
                        </td>
                      </tr>
                      <tr className="border-b border-border">
                        <td className="py-3 text-sm text-foreground">Manufacturer</td>
                        <td className="py-3 text-center text-sm text-muted-foreground">-</td>
                        <td className="py-3 text-right text-sm font-medium text-primary">{extraction?.manufacturer ?? "-"}</td>
                      </tr>
                      <tr>
                        <td className="py-3 text-sm text-foreground">Station Name</td>
                        <td className="py-3 text-center text-sm text-muted-foreground">-</td>
                        <td className="py-3 text-right text-sm font-medium text-primary">{extraction?.station_name ?? "-"}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Removed non-functional Exam editor and Add Exam button */}
              </div>
            </TabsContent>

            <TabsContent value="tags" className="mt-6">
              <div className="rounded-lg border border-border bg-card/50 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">DICOM Tags</span>
                  <div className="flex items-center gap-3">
                    <Input
                      value={tagsQuery}
                      onChange={(e) => setTagsQuery(e.target.value)}
                      placeholder="Cari tag / keyword / value"
                      className="h-8 w-[240px]"
                    />
                    {extraction?.extraction_method && (
                      <span className="text-xs text-muted-foreground">Source preferensi: SR → Localizer → CT</span>
                    )}
                  </div>
                </div>
                {tagsLoading && (
                  <div className="py-6 text-center text-muted-foreground text-sm">Memuat tags…</div>
                )}
                {tagsError && (
                  <div className="py-6 text-center text-destructive text-sm">{tagsError}</div>
                )}
                {!tagsLoading && !tagsError && tagsData && (
                  <div className="max-h-[60vh] overflow-auto rounded">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted">
                        <tr className="border-b border-border">
                          <th className="px-3 py-2 text-left text-muted-foreground">Tag</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">Keyword</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">Type</th>
                          <th className="px-3 py-2 text-left text-muted-foreground">Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tagRows.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Tidak ada hasil untuk pencarian ini.</td>
                          </tr>
                        )}
                        {tagRows.map((row) => (
                          <>
                            <tr key={row.tag} className="border-b border-border hover:bg-muted/30">
                              <td className="px-3 py-2 font-mono text-xs text-foreground">{row.tag}</td>
                              <td className="px-3 py-2 text-foreground">{row.name || '-'}</td>
                              <td className="px-3 py-2 text-muted-foreground">{row.type || '-'}</td>
                              <td className="px-3 py-2 text-muted-foreground">
                                <div className="flex items-center gap-2">
                                  <span>{row.value || '-'}</span>
                                  {row.type === 'Sequence' && Array.isArray(row.rawValue) && (
                                    <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => toggleSeq(row.tag)}>
                                      {expandedSeq[row.tag] ? 'Tutup' : 'Detail'}
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {row.type === 'Sequence' && Array.isArray(row.rawValue) && expandedSeq[row.tag] && (
                              <tr className="border-b border-border">
                                <td colSpan={4} className="px-3 py-2">
                                  <div className="rounded bg-muted/40 p-2">
                                    {row.rawValue.length === 0 ? (
                                      <div className="text-xs text-muted-foreground">Sequence kosong.</div>
                                    ) : (
                                      row.rawValue.map((item: any, idx: number) => (
                                        <div key={idx} className="mb-3">
                                          <div className="mb-1 text-xs font-medium text-foreground">Item #{idx + 1}</div>
                                          <div className="overflow-auto">
                                            <table className="w-full text-xs">
                                              <thead>
                                                <tr className="border-b border-border">
                                                  <th className="px-2 py-1 text-left text-muted-foreground">Tag</th>
                                                  <th className="px-2 py-1 text-left text-muted-foreground">Keyword</th>
                                                  <th className="px-2 py-1 text-left text-muted-foreground">Type</th>
                                                  <th className="px-2 py-1 text-left text-muted-foreground">Value</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {Object.entries(item).map(([childTag, childInfo]: [string, any]) => (
                                                  <tr key={childTag} className="border-b border-border">
                                                    <td className="px-2 py-1 font-mono">{childTag}</td>
                                                    <td className="px-2 py-1">{childInfo?.Name ?? '-'}</td>
                                                    <td className="px-2 py-1 text-muted-foreground">{childInfo?.Type ?? '-'}</td>
                                                    <td className="px-2 py-1 text-muted-foreground">{formatValue(childInfo?.Value, childInfo?.Type) || '-'}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                            </table>
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {!tagsLoading && !tagsError && !tagsData && (
                  <div className="py-6 text-center text-muted-foreground text-sm">Tidak ada data tags.</div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-6 flex justify-between border-t border-border pt-6">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button onClick={handleSave} className="bg-primary text-primary-foreground hover:bg-primary/90">
                Save
              </Button>
            </div>
            {extraction?.extraction_status && (
              <div className="text-right text-xs text-muted-foreground">
                Status: {extraction.extraction_status}
                {extraction.extraction_method ? ` · Metode: ${extraction.extraction_method}` : ""}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EditEntryDialog;
