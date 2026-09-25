import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Banknote, Building2, HeartPulse, Loader2, Receipt, TrendingUp, Users, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtIDR } from "@/components/app/admin-ui";
import { listWorkspaceRows } from "@/lib/data.functions";
import { useI18n } from "@/lib/i18n";
import { periodLabel, type SlipLine } from "@/lib/hr";

/**
 * Dasbor Slipp HR (Batch 2) — diporting dari ekspor `Business Suite New 2`
 * (`src/components/app/HrDashboard.tsx`). Perbedaan satu-satunya dengan ekspor:
 * data diambil lewat `listWorkspaceRows` (server fn MySQL) alih-alih Supabase,
 * dan status payroll memakai `approved` (bukan `posted`) sesuai model Old.
 */
const COLORS = ["#1e3a8a", "#d4a017", "#059669", "#0ea5e9", "#7c3aed", "#e11d48", "#64748b"];

interface EmpRow {
  status: string;
  department: string | null;
  position: string | null;
  base_salary: string | number | null;
  join_date: string | null;
  bpjs_kes: number | boolean | null;
  bpjs_tk: number | boolean | null;
}

interface RunRow {
  id: string;
  run_no: string;
  period: string;
  status: string;
  employee_count: number;
  total_gross: string | number | null;
  total_net: string | number | null;
  total_pph21: string | number | null;
  total_bpjs_company: string | number | null;
}

interface SlipRow {
  run_id: string;
  department: string | null;
  gross: string | number | null;
  net_pay: string | number | null;
  pph21: string | number | null;
  bpjs_employee: string | number | null;
  bpjs_company: string | number | null;
  allowances: SlipLine[] | null;
}

interface CompRow {
  code: string;
  kind: string;
  is_fixed: number | boolean | null;
}

interface DeptRow {
  name: string;
  is_active: number | boolean | null;
}

const short = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}M` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}jt` : n >= 1e3 ? `${Math.round(n / 1e3)}rb` : `${n}`;

const num = (v: string | number | null | undefined) => Number(v) || 0;
const truthy = (v: number | boolean | null | undefined) => v === 1 || v === true;

export function HrDashboard({ workspaceId }: { workspaceId: string }) {
  const { lang } = useI18n();
  const t = (en: string, id: string) => (lang === "id" ? id : en);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["hr-dashboard", workspaceId],
    queryFn: async () => {
      const [empRes, runsRes, slipsRes, compsRes, deptsRes] = await Promise.all([
        listWorkspaceRows({ data: { table: "hr_employees", workspaceId, orderBy: "code", limit: 1000 } }),
        listWorkspaceRows({
          data: { table: "hr_payroll_runs", workspaceId, orderBy: "period", orderDir: "desc", limit: 12 },
        }),
        listWorkspaceRows({ data: { table: "hr_payslips", workspaceId, orderBy: "employee_code", limit: 2000 } }),
        listWorkspaceRows({ data: { table: "hr_pay_components", workspaceId, orderBy: "code", limit: 200 } }),
        listWorkspaceRows({ data: { table: "hr_org_units", workspaceId, orderBy: "code", limit: 200 } }),
      ]);
      return {
        emp: (empRes?.rows ?? []) as unknown as EmpRow[],
        runs: (runsRes?.rows ?? []) as unknown as RunRow[],
        slips: (slipsRes?.rows ?? []) as unknown as SlipRow[],
        comps: (compsRes?.rows ?? []) as unknown as CompRow[],
        depts: ((deptsRes?.rows ?? []) as unknown as (DeptRow & { kind: string })[]).filter(
          (d) => d.kind === "department" && truthy(d.is_active),
        ),
      };
    },
  });

  if (isError) {
    // Jangan biarkan spinner berjalan selamanya bila salah satu query gagal.
    return (
      <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <p className="font-medium">{t("Could not load HR data", "Gagal memuat data HR")}</p>
        <p className="mt-1 text-muted-foreground">{error instanceof Error ? error.message : String(error)}</p>
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="py-20 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      </div>
    );
  }

  const now = new Date();
  const curPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevPeriod = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;

  const active = data.emp.filter((e) => e.status === "active");
  const newHires = active.filter((e) => e.join_date?.startsWith(curPeriod)).length;
  const runs = data.runs;
  const cur = runs.find((r) => r.period === curPeriod);
  const last = runs.find((r) => r.period === prevPeriod);
  const latest = cur ?? runs[0];
  const latestSlips = latest ? data.slips.filter((s) => s.run_id === latest.id) : [];
  const ytd = runs.filter((r) => r.period.startsWith(String(now.getFullYear())));
  const ytdTotal = ytd.reduce((a, r) => a + num(r.total_gross) + num(r.total_bpjs_company), 0);
  const change =
    cur && last && num(last.total_gross) ? ((num(cur.total_gross) - num(last.total_gross)) / num(last.total_gross)) * 100 : null;

  const variableCodes = new Set(data.comps.filter((c) => c.kind === "allowance" && !truthy(c.is_fixed)).map((c) => c.code));
  const variable = new Map<string, number>();
  let fixedAllow = 0;
  for (const s of latestSlips) {
    for (const a of s.allowances ?? []) {
      if (variableCodes.has(a.code)) variable.set(a.name, (variable.get(a.name) ?? 0) + num(a.amount));
      else fixedAllow += num(a.amount);
    }
  }
  const variableTotal = [...variable.values()].reduce((a, b) => a + b, 0);

  const netLabel = t("Net pay", "Gaji bersih");
  const bpjsLabel = t("Company BPJS", "BPJS perusahaan");
  const trend = [...runs].reverse().map((r) => ({
    name: periodLabel(r.period, lang).replace(/ \d{4}$/, ""),
    [netLabel]: num(r.total_net),
    "PPh 21": num(r.total_pph21),
    [bpjsLabel]: num(r.total_bpjs_company),
  }));

  const deptMap = new Map<string, { count: number; cost: number }>();
  for (const e of active) {
    const k = e.department || t("Unassigned", "Belum diatur");
    const v = deptMap.get(k) ?? { count: 0, cost: 0 };
    v.count += 1;
    deptMap.set(k, v);
  }
  for (const s of latestSlips) {
    const k = s.department || t("Unassigned", "Belum diatur");
    const v = deptMap.get(k) ?? { count: 0, cost: 0 };
    v.cost += num(s.gross) + num(s.bpjs_company);
    deptMap.set(k, v);
  }
  const deptRows = [...deptMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.cost - a.cost || b.count - a.count);

  const bpjsEmp = latestSlips.reduce((a, s) => a + num(s.bpjs_employee), 0);
  const bpjsCo = latestSlips.reduce((a, s) => a + num(s.bpjs_company), 0);
  const pph = latestSlips.reduce((a, s) => a + num(s.pph21), 0);
  const noBpjs = active.filter((e) => !truthy(e.bpjs_kes) || !truthy(e.bpjs_tk)).length;

  const kpis = [
    {
      icon: Users,
      label: t("Active employees", "Karyawan aktif"),
      value: String(active.length),
      sub: `${data.emp.length - active.length} ${t("inactive", "nonaktif")} · ${newHires} ${t("new this month", "baru bulan ini")}`,
    },
    {
      icon: Building2,
      label: t("Departments", "Departemen"),
      value: String(Math.max(data.depts.length, deptRows.filter((d) => d.count).length)),
      sub: t("active in master", "aktif di master"),
    },
    {
      icon: Wallet,
      label: t("Payroll this month", "Payroll bulan ini"),
      value: cur ? fmtIDR(num(cur.total_gross)) : "—",
      sub: cur
        ? `${cur.status === "approved" ? t("Posted", "Sudah posting") : "Draft"}${change != null ? ` · ${change >= 0 ? "+" : ""}${change.toFixed(1)}% ${t("vs last month", "vs bulan lalu")}` : ""}`
        : t("Not processed yet", "Belum diproses"),
    },
    {
      icon: Banknote,
      label: t("Last month payroll", "Payroll bulan lalu"),
      value: last ? fmtIDR(num(last.total_gross)) : "—",
      sub: last ? `${t("Net", "Bersih")} ${fmtIDR(num(last.total_net))}` : "",
    },
    {
      icon: TrendingUp,
      label: t("Total cost YTD", "Total biaya tahun berjalan"),
      value: fmtIDR(ytdTotal),
      sub: `${ytd.length} ${t("payroll runs", "kali payroll")}`,
    },
    {
      icon: Receipt,
      label: t("Base salary / month", "Gaji pokok / bulan"),
      value: fmtIDR(active.reduce((a, e) => a + num(e.base_salary), 0)),
      sub: t("active employees", "karyawan aktif"),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.28em] text-gold">SLIPP HR</p>
          <h1 className="text-2xl font-semibold text-navy dark:text-foreground">
            {t("Payroll Dashboard", "Dasbor Payroll")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {latest
              ? `${t("Showing details for", "Rincian untuk")} ${periodLabel(latest.period, lang)}`
              : t("No payroll yet — process your first payroll.", "Belum ada payroll — proses payroll pertama Anda.")}
          </p>
        </div>
        <Link
          to="/app/w/$workspaceId/$moduleId/$submoduleId"
          params={{ workspaceId, moduleId: "hr", submoduleId: "payroll" }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          {t("Process payroll", "Proses payroll")}
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="flex items-start gap-3 p-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <k.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className="truncate text-xl font-semibold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{t("Payroll trend (12 months)", "Tren payroll (12 bulan)")}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {trend.length ? (
              <ResponsiveContainer>
                <BarChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis tickFormatter={short} fontSize={11} />
                  <Tooltip formatter={(v: number) => fmtIDR(v)} />
                  <Legend />
                  <Bar dataKey={netLabel} stackId="a" fill={COLORS[0]} />
                  <Bar dataKey="PPh 21" stackId="a" fill={COLORS[1]} />
                  <Bar dataKey={bpjsLabel} stackId="a" fill={COLORS[2]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty t={t} />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Cost by department", "Biaya per departemen")}</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {deptRows.some((d) => d.cost) ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie data={deptRows.filter((d) => d.cost)} dataKey="cost" nameKey="name" innerRadius={50} outerRadius={85}>
                    {deptRows.map((d, i) => (
                      <Cell key={d.name} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtIDR(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <Empty t={t} />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <HeartPulse className="h-4 w-4" />
              BPJS &amp; PPh 21
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label={t("BPJS paid by employees", "BPJS ditanggung karyawan")} value={fmtIDR(bpjsEmp)} />
            <Row label={t("BPJS paid by company", "BPJS ditanggung perusahaan")} value={fmtIDR(bpjsCo)} />
            <Row label={t("Total BPJS to deposit", "Total BPJS disetor")} value={fmtIDR(bpjsEmp + bpjsCo)} bold />
            <Row label={t("PPh 21 to deposit", "PPh 21 disetor")} value={fmtIDR(pph)} bold />
            {noBpjs > 0 && (
              <Badge variant="secondary">
                {noBpjs} {t("employees not fully enrolled in BPJS", "karyawan belum ikut BPJS lengkap")}
              </Badge>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Incentives & overtime", "Insentif & lembur")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {variable.size ? (
              [...variable.entries()].map(([n, v]) => <Row key={n} label={n} value={fmtIDR(v)} />)
            ) : (
              <p className="text-muted-foreground">
                {t("No non-fixed allowances this period.", "Belum ada tunjangan tidak tetap periode ini.")}
              </p>
            )}
            <Row label={t("Total variable pay", "Total tunjangan tidak tetap")} value={fmtIDR(variableTotal)} bold />
            <Row label={t("Fixed allowances", "Tunjangan tetap")} value={fmtIDR(fixedAllow)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Headcount by department", "Karyawan per departemen")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {deptRows.length ? (
              deptRows.map((d) => (
                <div key={d.name} className="flex items-center justify-between gap-2">
                  <span className="truncate">{d.name}</span>
                  <span className="text-muted-foreground">
                    {d.count} · {fmtIDR(d.cost)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">{t("No employees yet.", "Belum ada karyawan.")}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Recent payroll runs", "Riwayat payroll")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {runs.slice(0, 6).map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 last:border-0">
              <span className="font-medium">
                {r.run_no} · {periodLabel(r.period, lang)}
              </span>
              <span className="text-muted-foreground">
                {r.employee_count} {t("employees", "karyawan")} · {fmtIDR(num(r.total_net))}
              </span>
              <Badge variant={r.status === "approved" ? "default" : "secondary"}>
                {r.status === "approved" ? t("Posted to journal", "Terposting ke jurnal") : "Draft"}
              </Badge>
            </div>
          ))}
          {!runs.length && <p className="text-muted-foreground">{t("No payroll runs yet.", "Belum ada payroll.")}</p>}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-semibold" : ""}`}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Empty({ t }: { t: (en: string, id: string) => string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      {t("No data yet", "Belum ada data")}
    </div>
  );
}
