import { useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, BarChart2, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
  idrl_category?: string;
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

const Dashboard = () => {
  const { toast } = useToast();
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", "1000");
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    return params.toString();
  }, [startDate, endDate]);

  const { data, isLoading, refetch } = useQuery<ReportingDataResponse>({
    queryKey: ["dashboard-reporting", queryParams],
    queryFn: async () => {
      const token = (() => { try { return localStorage.getItem("auth_token") || ""; } catch { return ""; } })();
      const res = await fetch(`${API_BASE}/api/v1/reporting-data?${queryParams}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!res.ok) throw new Error(`Gagal memuat data dashboard: ${res.status}`);
      return res.json();
    },
  });

  const records = data?.records ?? [];

  const metrics = useMemo(() => {
    const uniquePatientIds = new Set<string>();
    let above = 0;
    let normal = 0;
    let unknown = 0;
    let ctdivolSum = 0;
    let ctdivolCount = 0;
    let dlpSum = 0;
    let dlpCount = 0;
    const examMap: Record<string, number> = {};
    const examLabel: Record<string, string> = {};
    const dailyMap: Record<string, number> = {};

    const asNumber = (v: any) => {
      const n = typeof v === "string" ? parseFloat(v) : v;
      return typeof n === "number" && isFinite(n) ? n : undefined;
    };

    for (const r of records) {
      if (r.patient_id) uniquePatientIds.add(r.patient_id);
      const status = (r.idrl_status || "-").toLowerCase();
      if (status.includes("melewati")) above++;
      else if (status.includes("normal")) normal++;
      else unknown++;

      const ctdi = asNumber(r.ctdivol_average_mgy ?? r.ctdivol_mgy);
      if (ctdi !== undefined) {
        ctdivolSum += ctdi;
        ctdivolCount += 1;
      }
      const dlp = asNumber(r.total_dlp_mgycm);
      if (dlp !== undefined) {
        dlpSum += dlp;
        dlpCount += 1;
      }

      const rawExam = String(r.idrl_category || r.exam_type || "Unknown");
      const exam = rawExam.toUpperCase();
      examMap[exam] = (examMap[exam] || 0) + 1;
      if (!examLabel[exam]) examLabel[exam] = rawExam;

      const d = r.study_date ? String(r.study_date) : "Unknown";
      dailyMap[d] = (dailyMap[d] || 0) + 1;
    }

    const totalExams = records.length;
    const totalPatients = uniquePatientIds.size;
    const avgCtdivol = ctdivolCount ? ctdivolSum / ctdivolCount : undefined;
    const avgDlp = dlpCount ? dlpSum / dlpCount : undefined;
    const complianceRate = totalExams ? Math.round(((normal / (normal + above || 1)) * 100)) : 0;

    const examDistribution = Object.entries(examMap)
      .map(([key, count]) => ({ name: examLabel[key] || key, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const dailyTrend = Object.entries(dailyMap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const aboveList = records
      .filter((r) => (r.idrl_status || "").toLowerCase().includes("melewati"))
      .slice(0, 10);

    return {
      totalExams,
      totalPatients,
      above,
      normal,
      unknown,
      avgCtdivol,
      avgDlp,
      complianceRate,
      examDistribution,
      dailyTrend,
      aboveList,
    };
  }, [records]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="p-6 pt-14 transition-all duration-300" style={{ marginLeft: "var(--sidebar-width)" }}>
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
            <p className="text-muted-foreground">Ringkasan cepat status IDRL, tren, dan distribusi pemeriksaan</p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="date" placeholder="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="pl-9" />
            </div>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="date" placeholder="End date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="pl-9" />
            </div>
            <Button onClick={() => refetch()}>Apply Filter</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Total Pasien</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{metrics.totalPatients}</div>
              <p className="text-sm text-muted-foreground">Unik berdasarkan Patient ID</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pasien di atas ambang</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{metrics.above}</div>
              <p className="text-sm text-muted-foreground">Status IDRL: Melewati batas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pasien Normal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600">{metrics.normal}</div>
              <p className="text-sm text-muted-foreground">Sesuai IDRL</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Compliance Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-6 w-6 text-primary" />
                <div className="text-3xl font-bold">{metrics.complianceRate}%</div>
              </div>
              <p className="text-sm text-muted-foreground">Normal vs Melewati batas</p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Tren Pemeriksaan per Tanggal</CardTitle>
              <BarChart2 className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics.dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Distribusi Jenis Pemeriksaan</CardTitle>
              <BarChart2 className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={metrics.examDistribution}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={12} />
                  <YAxis fontSize={12} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        <div className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Daftar Pasien Melewati Batas (Top 10)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Patient ID</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Nama</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Jenis Pemeriksaan</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Kontras</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground">CTDIvol (mGy)</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground">DLP (mGy·cm)</th>
                      <th className="px-4 py-3 text-left text-sm font-medium text-foreground">Status IDRL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading && (
                      <tr>
                        <td className="px-4 py-3 text-sm text-muted-foreground" colSpan={7}>Loading...</td>
                      </tr>
                    )}
                    {!isLoading && metrics.aboveList.map((r) => (
                      <tr key={r.id} className="border-b border-border">
                        <td className="px-4 py-3 text-sm">{r.patient_id}</td>
                        <td className="px-4 py-3 text-sm">{r.patient_name}</td>
                        <td className="px-4 py-3 text-sm">{r.idrl_category || r.exam_type || "-"}</td>
                        <td className="px-4 py-3 text-sm">{r.contrast_used === true ? "Kontras" : r.contrast_used === false ? "Non-kontras" : "-"}</td>
                        <td className="px-4 py-3 text-sm">{r.ctdivol_average_mgy ?? r.ctdivol_mgy ?? "-"}</td>
                        <td className="px-4 py-3 text-sm">{r.total_dlp_mgycm ?? "-"}</td>
                        <td className="px-4 py-3 text-sm">{r.idrl_status || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
