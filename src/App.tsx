import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./supabase";

type Shift = { id: string; name: string; start: string; end: string };
type Emp = { id: string; no: string; name: string; shiftId: string; restDay: number };
type Punch = { id: string; empId: string; date: string; timeIn: string; timeOut: string };
type Leave = { id: string; empId: string; date: string; type: string; paid: boolean };
type Holiday = { id: string; date: string; name: string; type: string };
type Settings = { breakMin: number; graceMin: number; otMinMin: number };
type Row = {
  empId: string; no: string; name: string; date: string; shift: string; dayType: string;
  status: string; leaveType: string; timeIn: string; timeOut: string;
  late: number; under: number; ot: number; worked: number; days: number;
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const LEAVES = ["Vacation", "Sick", "Emergency", "Maternity", "Paternity", "Unpaid"];
const HOLS = ["Regular Holiday", "Special Holiday"];
const inp = "border rounded px-2 py-1 text-sm";
const btn = "bg-blue-600 text-white rounded px-3 py-1 text-sm disabled:opacity-50";

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (d: Date) => d.toLocaleDateString("en-CA");
const today = () => fmt(new Date());
const nowTime = () => new Date().toTimeString().slice(0, 5);
const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hrs = (m: number) => (m / 60).toFixed(2);
const dow = (d: string) => new Date(d + "T00:00:00").getDay();
const range = (a: string, b: string) => {
  const out: string[] = [];
  for (let d = new Date(a + "T00:00:00"); d <= new Date(b + "T00:00:00"); d.setDate(d.getDate() + 1)) out.push(fmt(d));
  return out;
};

function useStore<T>(key: string, init: T) {
  const [v, setV] = useState<T>(init);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    supabase.from("app_data").select("value").eq("key", key).maybeSingle().then(({ data }) => {
      if (data) setV(data.value as T);
      setReady(true);
    });
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    supabase.from("app_data").upsert({ key, value: v, updated_at: new Date().toISOString() });
  }, [key, v, ready]);
  return [v, setV] as const;
}

function build(e: Emp, date: string, shifts: Shift[], punches: Punch[], leaves: Leave[], holidays: Holiday[], s: Settings): Row {
  const sh = shifts.find((x) => x.id === e.shiftId) ?? shifts[0];
  const hol = holidays.find((h) => h.date === date);
  const rest = dow(date) === e.restDay;
  const dayType = hol ? hol.type + (rest ? " + Rest Day" : "") : rest ? "Rest Day" : "Regular";
  const base: Row = {
    empId: e.id, no: e.no, name: e.name, date, shift: sh ? `${sh.start}-${sh.end}` : "", dayType,
    status: "", leaveType: "", timeIn: "", timeOut: "", late: 0, under: 0, ot: 0, worked: 0, days: 0,
  };
  if (!sh) return { ...base, status: "No Shift" };
  const p = punches.find((x) => x.empId === e.id && x.date === date);
  const lv = leaves.find((x) => x.empId === e.id && x.date === date);

  if (p?.timeIn) {
    if (!p.timeOut) return { ...base, timeIn: p.timeIn, status: date < today() ? "Incomplete" : "Working", days: 1 };
    const tin = toMin(p.timeIn);
    let tout = toMin(p.timeOut); if (tout <= tin) tout += 1440;
    const ss = toMin(sh.start); let se = toMin(sh.end); if (se <= ss) se += 1440;
    const span = tout - tin;
    const worked = Math.max(0, span - (span > 300 ? s.breakMin : 0));
    const paid = se - ss - s.breakMin;
    let late = 0, under = 0, ot = 0;
    if (dayType === "Regular") {
      late = tin - ss > s.graceMin ? tin - ss : 0;
      under = tout < se ? se - tout : 0;
      ot = tout - se >= s.otMinMin ? tout - se : 0;
    } else {
      ot = worked - paid >= s.otMinMin ? worked - paid : 0;
    }
    return { ...base, status: "Present", timeIn: p.timeIn, timeOut: p.timeOut, late, under, ot, worked, days: 1 };
  }
  if (lv) return { ...base, status: "Leave", leaveType: `${lv.type} (${lv.paid ? "Paid" : "Unpaid"})` };
  if (hol) return { ...base, status: "Holiday" };
  if (rest) return { ...base, status: "Rest Day" };
  return { ...base, status: date < today() ? "Absent" : "Pending" };
}

function Table({ head, body }: { head: string[]; body: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border">
        <thead className="bg-blue-50">
          <tr>{head.map((h) => <th key={h} className="p-2 text-left whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {body.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((c, j) => <td key={j} className="p-2 whitespace-nowrap">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("Clock");
  const [shifts, setShifts] = useStore<Shift[]>("att:shifts", [{ id: "s1", name: "Day Shift", start: "08:00", end: "17:00" }]);
  const [emps, setEmps] = useStore<Emp[]>("att:emps", []);
  const [punches, setPunches] = useStore<Punch[]>("att:punches", []);
  const [leaves, setLeaves] = useStore<Leave[]>("att:leaves", []);
  const [holidays, setHolidays] = useStore<Holiday[]>("att:holidays", []);
  const [s, setS] = useStore<Settings>("att:settings", { breakMin: 60, graceMin: 0, otMinMin: 5 });

  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 20); return fmt(d); });
  const [to, setTo] = useState(today());
  const [fe, setFe] = useState("all");
  const [ce, setCe] = useState("");
  const [m, setM] = useState({ empId: "", date: today(), timeIn: "", timeOut: "" });
  const [lf, setLf] = useState({ empId: "", from: today(), to: today(), type: LEAVES[0], paid: true });
  const [ef, setEf] = useState({ no: "", name: "", shiftId: "", restDay: 0 });
  const [sf, setSf] = useState({ name: "", start: "08:00", end: "17:00" });
  const [hf, setHf] = useState({ date: today(), name: "", type: HOLS[0] });

  const nm = (id: string) => emps.find((e) => e.id === id)?.name ?? "?";
  const empSelect = (value: string, onChange: (v: string) => void, all = false) => (
    <select className={inp} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{all ? "" : "Select employee"}</option>
      {all && <option value="all">All employees</option>}
      {emps.map((e) => <option key={e.id} value={e.id}>{e.no} - {e.name}</option>)}
    </select>
  );

  const rows = useMemo(() => {
    const days = range(from, to).filter((d) => d <= today());
    return emps
      .filter((e) => fe === "all" || e.id === fe)
      .flatMap((e) => days.map((d) => build(e, d, shifts, punches, leaves, holidays, s)));
  }, [emps, shifts, punches, leaves, holidays, s, from, to, fe]);

  const summary = useMemo(() =>
    emps.filter((e) => fe === "all" || e.id === fe).map((e) => {
      const r = rows.filter((x) => x.empId === e.id);
      const sum = (f: (x: Row) => number) => r.reduce((a, x) => a + f(x), 0);
      return {
        e, days: sum((x) => x.days), late: sum((x) => x.late), under: sum((x) => x.under), ot: sum((x) => x.ot),
        absent: r.filter((x) => x.status === "Absent").length,
        leave: r.filter((x) => x.status === "Leave").length,
        hol: r.filter((x) => x.days && x.dayType.includes("Holiday")).length,
        rest: r.filter((x) => x.days && x.dayType.includes("Rest Day")).length,
        worked: sum((x) => x.worked),
      };
    }), [rows, emps, fe]);

  const loadSeed = () => {
    const addDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return fmt(d); };
    const hm = (t: string, d: number) => {
      const x = toMin(t) + d;
      return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
    };
    const sh: Shift[] = [
      { id: "s1", name: "Day Shift", start: "08:00", end: "17:00" },
      { id: "s2", name: "Mid Shift", start: "10:00", end: "19:00" },
    ];
    const em: Emp[] = [
      { id: "e1", no: "DEMO-001", name: "Juan Dela Cruz", shiftId: "s2", restDay: 0 },
      { id: "e2", no: "DEMO-002", name: "Maria Santos", shiftId: "s1", restDay: 6 },
      { id: "e3", no: "DEMO-003", name: "Pedro Reyes", shiftId: "s1", restDay: 0 },
      { id: "e4", no: "DEMO-004", name: "Jose Garcia", shiftId: "s2", restDay: 3 },
      { id: "e5", no: "DEMO-005", name: "Ana Mendoza", shiftId: "s1", restDay: 0 },
      { id: "e6", no: "DEMO-006", name: "Liza Torres", shiftId: "s1", restDay: 6 },
      { id: "e7", no: "DEMO-007", name: "Carlo Ramos", shiftId: "s1", restDay: 0 },
      { id: "e8", no: "DEMO-008", name: "Grace Villanueva", shiftId: "s1", restDay: 0 },
      { id: "e9", no: "DEMO-009", name: "Mark Bautista", shiftId: "s2", restDay: 2 },
      { id: "e10", no: "DEMO-010", name: "Sofia Aquino", shiftId: "s1", restDay: 0 },
      { id: "e11", no: "DEMO-011", name: "Rosa Navarro", shiftId: "s1", restDay: 0 },
    ];
    const lv: Leave[] = [
      { id: uid(), empId: "e2", date: addDays(-5), type: "Sick", paid: true },
      { id: uid(), empId: "e5", date: addDays(-12), type: "Emergency", paid: false },
      ...range(addDays(-20), addDays(-1)).filter((d) => dow(d) !== 0).map((d) => ({ id: uid(), empId: "e11", date: d, type: "Vacation", paid: true })),
    ];
    const hol: Holiday[] = [
      { id: uid(), date: addDays(-10), name: "Sample Regular Holiday", type: "Regular Holiday" },
      { id: uid(), date: addDays(-3), name: "Sample Special Holiday", type: "Special Holiday" },
    ];
    const pu: Punch[] = [];
    em.forEach((e, ei) => {
      const s0 = sh.find((x) => x.id === e.shiftId)!;
      for (let n = -20; n <= -1; n++) {
        const date = addDays(n);
        const i = Math.abs(n) + ei * 3;
        if (dow(date) === e.restDay) continue;
        if (lv.some((l) => l.empId === e.id && l.date === date)) continue;
        if (i % 11 === 0) continue; // absent
        let tin = hm(s0.start, -5);
        let tout = hm(s0.end, 2);
        if (i % 4 === 1) tin = hm(s0.start, 10 + (i % 3) * 5); // late
        if (i % 9 === 4) tout = hm(s0.end, -30); // undertime
        if (i % 5 === 2) tout = hm(s0.end, 60); // overtime
        pu.push({ id: uid(), empId: e.id, date, timeIn: tin, timeOut: tout });
      }
    });
    const rd = range(addDays(-20), addDays(-1)).find((d) => dow(d) === 0);
    if (rd) pu.push({ id: uid(), empId: "e1", date: rd, timeIn: "08:00", timeOut: "17:00" }); // rest day work
    setShifts(sh); setEmps(em); setLeaves(lv); setHolidays(hol); setPunches(pu);
  };

  const timeIn = () => {
    if (!ce) return;
    if (punches.some((p) => p.empId === ce && p.date === today())) return alert("Already timed in today");
    setPunches([...punches, { id: uid(), empId: ce, date: today(), timeIn: nowTime(), timeOut: "" }]);
  };
  const timeOut = () => {
    const p = punches.find((x) => x.empId === ce && !x.timeOut);
    if (!p) return alert("No active time in");
    setPunches(punches.map((x) => (x.id === p.id ? { ...x, timeOut: nowTime() } : x)));
  };
  const saveManual = () => {
    if (!m.empId || !m.date || !m.timeIn) return;
    setPunches([...punches.filter((p) => !(p.empId === m.empId && p.date === m.date)), { id: uid(), ...m }]);
  };
  const saveLeave = () => {
    if (!lf.empId) return;
    const days = range(lf.from, lf.to);
    setLeaves([
      ...leaves.filter((l) => !(l.empId === lf.empId && days.includes(l.date))),
      ...days.map((d) => ({ id: uid(), empId: lf.empId, date: d, type: lf.type, paid: lf.paid })),
    ]);
  };

  const recHead = ["Employee No", "Name", "Date", "Shift", "Day Type", "Status", "Leave", "Time In", "Time Out", "Late (min)", "Undertime (min)", "Overtime (min)", "Total Hours"];
  const recData = rows.map((r) => [r.no, r.name, r.date, r.shift, r.dayType, r.status, r.leaveType, r.timeIn, r.timeOut, r.late, r.under, r.ot, hrs(r.worked)]);
  const exportCsv = () => {
    const csv = [recHead, ...recData].map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "attendance.csv";
    a.click();
  };

  const filter = (
    <div className="flex flex-wrap gap-2 items-end mb-4">
      <label className="text-xs">From<input type="date" className={inp + " block"} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
      <label className="text-xs">To<input type="date" className={inp + " block"} value={to} onChange={(e) => setTo(e.target.value)} /></label>
      {empSelect(fe, setFe, true)}
      <button className={btn} onClick={exportCsv}>Export CSV</button>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto p-4">
      <h1 className="text-xl font-semibold text-blue-700 mb-3">Attendance</h1>
      <div className="flex gap-1 mb-4 border-b">
        {["Clock", "Records", "Summary", "Leave", "Setup"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm ${tab === t ? "border-b-2 border-blue-600 text-blue-700 font-medium" : "text-gray-500"}`}>{t}</button>
        ))}
      </div>

      {tab === "Clock" && (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-2 items-center">
            {empSelect(ce, setCe)}
            <button className={btn} onClick={timeIn}>Time In</button>
            <button className={btn} onClick={timeOut}>Time Out</button>
          </div>
          <div className="flex flex-wrap gap-2 items-end">
            {empSelect(m.empId, (v) => setM({ ...m, empId: v }))}
            <label className="text-xs">Date<input type="date" className={inp + " block"} value={m.date} onChange={(e) => setM({ ...m, date: e.target.value })} /></label>
            <label className="text-xs">Time In<input type="time" className={inp + " block"} value={m.timeIn} onChange={(e) => setM({ ...m, timeIn: e.target.value })} /></label>
            <label className="text-xs">Time Out<input type="time" className={inp + " block"} value={m.timeOut} onChange={(e) => setM({ ...m, timeOut: e.target.value })} /></label>
            <button className={btn} onClick={saveManual}>Save</button>
          </div>
        </div>
      )}

      {tab === "Records" && (
        <>
          {filter}
          <Table
            head={[...recHead, ""]}
            body={rows.map((r, i) => [
              ...recData[i],
              r.days ? (
                <button className="text-red-600" onClick={() => setPunches(punches.filter((p) => !(p.empId === r.empId && p.date === r.date)))}>Delete</button>
              ) : "",
            ])}
          />
        </>
      )}

      {tab === "Summary" && (
        <>
          {filter}
          <Table
            head={["Employee", "Days Worked", "Late (min)", "Undertime (min)", "Overtime (hrs)", "Absent", "Leave", "Holiday Work", "Rest Day Work", "Total Hours"]}
            body={summary.map((x) => [`${x.e.no} - ${x.e.name}`, x.days, x.late, x.under, hrs(x.ot), x.absent, x.leave, x.hol, x.rest, hrs(x.worked)])}
          />
        </>
      )}

      {tab === "Leave" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            {empSelect(lf.empId, (v) => setLf({ ...lf, empId: v }))}
            <label className="text-xs">From<input type="date" className={inp + " block"} value={lf.from} onChange={(e) => setLf({ ...lf, from: e.target.value })} /></label>
            <label className="text-xs">To<input type="date" className={inp + " block"} value={lf.to} onChange={(e) => setLf({ ...lf, to: e.target.value })} /></label>
            <select className={inp} value={lf.type} onChange={(e) => setLf({ ...lf, type: e.target.value })}>{LEAVES.map((t) => <option key={t}>{t}</option>)}</select>
            <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={lf.paid} onChange={(e) => setLf({ ...lf, paid: e.target.checked })} />Paid</label>
            <button className={btn} onClick={saveLeave}>Save</button>
          </div>
          <Table
            head={["Employee", "Date", "Type", "Paid", ""]}
            body={[...leaves].sort((a, b) => b.date.localeCompare(a.date)).map((l) => [
              nm(l.empId), l.date, l.type, l.paid ? "Yes" : "No",
              <button className="text-red-600" onClick={() => setLeaves(leaves.filter((x) => x.id !== l.id))}>Delete</button>,
            ])}
          />
        </div>
      )}

      {tab === "Setup" && (
        <div className="space-y-8">
          <button className={btn} onClick={loadSeed}>Load sample data</button>

          <section className="space-y-2">
            <h2 className="font-medium">Settings</h2>
            <div className="flex flex-wrap gap-3">
              <label className="text-xs">Break (min)<input type="number" className={inp + " block w-24"} value={s.breakMin} onChange={(e) => setS({ ...s, breakMin: +e.target.value })} /></label>
              <label className="text-xs">Grace period (min)<input type="number" className={inp + " block w-24"} value={s.graceMin} onChange={(e) => setS({ ...s, graceMin: +e.target.value })} /></label>
              <label className="text-xs">Min. overtime (min)<input type="number" className={inp + " block w-24"} value={s.otMinMin} onChange={(e) => setS({ ...s, otMinMin: +e.target.value })} /></label>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">Shifts</h2>
            <div className="flex flex-wrap gap-2 items-end">
              <input className={inp} placeholder="Name" value={sf.name} onChange={(e) => setSf({ ...sf, name: e.target.value })} />
              <input type="time" className={inp} value={sf.start} onChange={(e) => setSf({ ...sf, start: e.target.value })} />
              <input type="time" className={inp} value={sf.end} onChange={(e) => setSf({ ...sf, end: e.target.value })} />
              <button className={btn} onClick={() => sf.name && (setShifts([...shifts, { id: uid(), ...sf }]), setSf({ ...sf, name: "" }))}>Add</button>
            </div>
            <Table head={["Name", "Start", "End", ""]} body={shifts.map((x) => [x.name, x.start, x.end,
              <button className="text-red-600" onClick={() => setShifts(shifts.filter((y) => y.id !== x.id))}>Remove</button>])} />
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">Employees</h2>
            <div className="flex flex-wrap gap-2 items-end">
              <input className={inp} placeholder="Employee No" value={ef.no} onChange={(e) => setEf({ ...ef, no: e.target.value })} />
              <input className={inp} placeholder="Name" value={ef.name} onChange={(e) => setEf({ ...ef, name: e.target.value })} />
              <select className={inp} value={ef.shiftId} onChange={(e) => setEf({ ...ef, shiftId: e.target.value })}>
                <option value="">Select shift</option>
                {shifts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <select className={inp} value={ef.restDay} onChange={(e) => setEf({ ...ef, restDay: +e.target.value })}>
                {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
              <button className={btn} onClick={() => ef.no && ef.name && ef.shiftId && (setEmps([...emps, { id: uid(), ...ef }]), setEf({ ...ef, no: "", name: "" }))}>Add</button>
            </div>
            <Table head={["No", "Name", "Shift", "Rest Day", ""]} body={emps.map((e) => [e.no, e.name, shifts.find((x) => x.id === e.shiftId)?.name ?? "", DAYS[e.restDay],
              <button className="text-red-600" onClick={() => setEmps(emps.filter((y) => y.id !== e.id))}>Remove</button>])} />
          </section>

          <section className="space-y-2">
            <h2 className="font-medium">Holidays</h2>
            <div className="flex flex-wrap gap-2 items-end">
              <input type="date" className={inp} value={hf.date} onChange={(e) => setHf({ ...hf, date: e.target.value })} />
              <input className={inp} placeholder="Name" value={hf.name} onChange={(e) => setHf({ ...hf, name: e.target.value })} />
              <select className={inp} value={hf.type} onChange={(e) => setHf({ ...hf, type: e.target.value })}>{HOLS.map((t) => <option key={t}>{t}</option>)}</select>
              <button className={btn} onClick={() => hf.name && (setHolidays([...holidays, { id: uid(), ...hf }]), setHf({ ...hf, name: "" }))}>Add</button>
            </div>
            <Table head={["Date", "Name", "Type", ""]} body={[...holidays].sort((a, b) => a.date.localeCompare(b.date)).map((h) => [h.date, h.name, h.type,
              <button className="text-red-600" onClick={() => setHolidays(holidays.filter((y) => y.id !== h.id))}>Remove</button>])} />
          </section>
        </div>
      )}
    </div>
  );
}
