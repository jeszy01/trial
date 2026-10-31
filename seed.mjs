import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
const supabase = createClient(url, key);

const uid = () => Math.random().toString(36).slice(2, 10);
const fmt = (d) => d.toLocaleDateString("en-CA");
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const dow = (d) => new Date(d + "T00:00:00").getDay();
const range = (a, b) => {
  const out = [];
  for (let d = new Date(a + "T00:00:00"); d <= new Date(b + "T00:00:00"); d.setDate(d.getDate() + 1)) out.push(fmt(d));
  return out;
};
const hm = (t, d) => {
  const x = toMin(t) + d;
  return `${String(Math.floor(x / 60)).padStart(2, "0")}:${String(x % 60).padStart(2, "0")}`;
};

const sh = [
  { id: "s1", name: "Day Shift", start: "08:00", end: "17:00" },
  { id: "s2", name: "Mid Shift", start: "10:00", end: "19:00" },
];
const em = [
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
const hol = [
  { id: uid(), date: "2026-10-02", name: "Sample Regular Holiday", type: "Regular Holiday" },
  { id: uid(), date: "2026-10-06", name: "Sample Special Holiday", type: "Special Holiday" },
  { id: uid(), date: "2026-10-14", name: "Sample Regular Holiday", type: "Regular Holiday" },
  { id: uid(), date: "2026-10-20", name: "Sample Special Holiday", type: "Special Holiday" },
];

const pu = [];
const lv = [];
const eid = (no) => em.find((x) => x.no === no).id;
const drop = (no, date) => {
  const id = eid(no);
  const i = pu.findIndex((p) => p.empId === id && p.date === date);
  if (i >= 0) pu.splice(i, 1);
};
const work = (no, date, tin, tout) => {
  drop(no, date);
  pu.push({ id: uid(), empId: eid(no), date, timeIn: tin, timeOut: tout });
};
const leave = (no, date, type, paid) => {
  drop(no, date);
  lv.push({ id: uid(), empId: eid(no), date, type, paid });
};

// normal attendance: Sep 26 - Oct 30
const days = range("2026-09-26", "2026-10-30");
em.forEach((e) => {
  const s0 = sh.find((x) => x.id === e.shiftId);
  days.forEach((date) => {
    if (dow(date) === e.restDay || hol.some((h) => h.date === date)) return;
    pu.push({ id: uid(), empId: e.id, date, timeIn: hm(s0.start, -5), timeOut: hm(s0.end, 2) });
  });
});

// Cutoff Sep 26 - Oct 9
work("DEMO-002", "2026-09-28", "08:25", "17:02"); // late
work("DEMO-003", "2026-09-29", "07:55", "16:30"); // undertime
work("DEMO-005", "2026-09-30", "07:55", "18:30"); // overtime
work("DEMO-007", "2026-10-01", "08:15", "16:45"); // late + undertime
drop("DEMO-008", "2026-10-01"); // absent
leave("DEMO-006", "2026-10-05", "Sick", true); // paid leave
leave("DEMO-010", "2026-10-07", "Emergency", false); // unpaid leave
work("DEMO-002", "2026-10-02", "08:00", "17:00"); // regular holiday worked
work("DEMO-003", "2026-10-02", "08:00", "19:00"); // regular holiday + OT
work("DEMO-005", "2026-10-06", "08:00", "17:00"); // special holiday worked
work("DEMO-009", "2026-10-06", "10:00", "19:00"); // special holiday + rest day
work("DEMO-001", "2026-10-04", "10:00", "19:00"); // rest day worked

// Cutoff Oct 10 - 25
work("DEMO-004", "2026-10-12", "10:20", "19:02"); // late
work("DEMO-005", "2026-10-13", "07:55", "16:00"); // undertime
work("DEMO-001", "2026-10-15", "09:55", "20:00"); // overtime
drop("DEMO-003", "2026-10-15"); // absent
drop("DEMO-004", "2026-10-16"); // absent
leave("DEMO-002", "2026-10-13", "Sick", true); // paid leave
leave("DEMO-005", "2026-10-22", "Emergency", false); // unpaid leave
work("DEMO-008", "2026-10-14", "08:00", "17:00"); // regular holiday worked
work("DEMO-004", "2026-10-14", "10:00", "19:00"); // regular holiday + rest day
work("DEMO-010", "2026-10-20", "08:00", "17:00"); // special holiday worked
work("DEMO-009", "2026-10-20", "10:00", "19:00"); // special holiday + rest day
work("DEMO-003", "2026-10-18", "08:00", "17:00"); // rest day worked
work("DEMO-002", "2026-10-24", "08:00", "17:00"); // rest day worked
range("2026-10-19", "2026-10-30").forEach((d) => {
  if (dow(d) !== 0) leave("DEMO-011", d, "Vacation", true); // on leave
});

// Cutoff Oct 26 - Nov 9 (partial)
work("DEMO-006", "2026-10-27", "08:10", "17:02"); // late
work("DEMO-008", "2026-10-28", "07:55", "18:00"); // overtime

const data = {
  "att:shifts": sh,
  "att:emps": em,
  "att:punches": pu,
  "att:leaves": lv,
  "att:holidays": hol,
  "att:settings": { breakMin: 60, graceMin: 0, otMinMin: 5 },
};

for (const [k, value] of Object.entries(data)) {
  const { error } = await supabase
    .from("app_data")
    .upsert({ key: k, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) { console.error("failed:", k, error.message); process.exit(1); }
  console.log("saved", k);
}
console.log("Done. Open the app once to sync attendance_records.");