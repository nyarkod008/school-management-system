import { useState, useEffect, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, SafeAreaView, StatusBar,
  KeyboardAvoidingView, Platform, StyleSheet,
  ActivityIndicator, Alert,
} from "react-native";
import { supabase } from "../../lib/supabase";

// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════

type AppMode       = "LANDING" | "TEACHER" | "STUDENT";
type Grade         = "A" | "B" | "C" | "D" | "F";
type Conduct       = "EXCELLENT" | "VERY GOOD" | "GOOD" | "FAIR" | "POOR";
type TeacherScreen = "T_LOGIN" | "T_DASHBOARD" | "T_STUDENT_LIST" | "T_RECORD" | "T_VIEW_SAVED";
type StudentScreen = "S_LOGIN" | "S_DASHBOARD" | "S_RESULTS" | "S_CONDUCT" | "S_REMARKS" | "S_ATTENDANCE";
type RecordTab     = "SCORES" | "CONDUCT" | "REMARKS" | "ATTENDANCE";

interface SubjectScore { name: string; classScore: string; examScore: string; }
interface ConductItem  { category: string; rating: Conduct; }

interface StudentRecord {
  id: string; name: string; className: string;
  gender: "M" | "F"; dob: string; guardian: string; pin: string;
  daysPresent: number; daysAbsent: number; totalDays: number; lateArrivals: number;
  subjects: SubjectScore[]; conduct: ConductItem[];
  classTeacherRemark: string; headTeacherRemark: string;
  saved: boolean; position: number;
}

interface TeacherAccount {
  id: string; name: string; pin: string; className: string; subject: string;
}

// ══════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════

const SCHOOL = {
  name:  "Ecole Enfant International",
  term:  "TERM 2",
  year:  "2025 / 2026",
  motto: "Knowledge · Excellence · Character",
};

const SUBJECTS = [
  "English Language", "Mathematics", "Science", "Social Studies",
  "R.M.E", "French", "Creative Arts", "German", "Computing", "Career Technology",
];

const CONDUCT_CATS = [
  "Punctuality", "Participation", "Neatness", "Cooperation", "Homework", "Respect",
];

const CONDUCT_OPTIONS: Conduct[] = ["EXCELLENT", "VERY GOOD", "GOOD", "FAIR", "POOR"];

// ── Design tokens ──
const C = {
  bg:     "#ffffff", card:   "#f7f7f7",
  border: "#cc000025", amber: "#1a1a1a",
  gold:   "#cc0000",  dim:   "#55555599",
  faint:  "#cc000012", green: "#007a33",
  red:    "#cc0000",
};

const GRADE_C: Record<Grade, string> = {
  A: "#007a33", B: "#cc0000", C: "#990000", D: "#666666", F: "#aaaaaa",
};
const COND_C: Record<Conduct, string> = {
  EXCELLENT: "#007a33", "VERY GOOD": "#cc0000", GOOD: "#ff6600", FAIR: "#888888", POOR: "#aaaaaa",
};
const COND_W: Record<Conduct, number> = {
  EXCELLENT: 100, "VERY GOOD": 80, GOOD: 60, FAIR: 40, POOR: 20,
};

const FONT = Platform.select({ ios: "Courier New", android: "monospace", default: "monospace" });

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

const getTotal  = (s: SubjectScore) => (parseFloat(s.classScore) || 0) + (parseFloat(s.examScore) || 0);
const getGrade  = (t: number): Grade => t >= 80 ? "A" : t >= 70 ? "B" : t >= 60 ? "C" : t >= 50 ? "D" : "F";
const attendPct = (st: StudentRecord) => st.totalDays ? Math.round((st.daysPresent / st.totalDays) * 100) : 0;

const getAvg = (st: StudentRecord) => {
  const filled = st.subjects.filter(s => s.classScore && s.examScore);
  if (!filled.length) return 0;
  return Math.round(filled.reduce((a, s) => a + getTotal(s), 0) / filled.length);
};

/** Build a blank StudentRecord from a raw DB row */
const buildBlank = (row: any): StudentRecord => ({
  id: row.id, name: row.name, className: row.class_name,
  gender: row.gender, dob: row.dob, guardian: row.guardian, pin: row.pin,
  daysPresent: 0, daysAbsent: 0, totalDays: 50, lateArrivals: 0,
  subjects: SUBJECTS.map(n => ({ name: n, classScore: "", examScore: "" })),
  conduct:  CONDUCT_CATS.map(c => ({ category: c, rating: "GOOD" as Conduct })),
  classTeacherRemark: "", headTeacherRemark: "",
  saved: false, position: row.position ?? 0,
});

// ══════════════════════════════════════════════════════════
// SUPABASE DATA LAYER
// ══════════════════════════════════════════════════════════

async function dbLoginTeacher(id: string, pin: string): Promise<TeacherAccount | null> {
  const { data } = await supabase
    .from("teachers").select("*")
    .ilike("id", id).eq("pin", pin).single();
  if (!data) return null;
  return { id: data.id, name: data.name, pin: data.pin, className: data.class_name, subject: data.subject };
}

async function dbLoginStudent(id: string, pin: string): Promise<StudentRecord | null> {
  const { data } = await supabase
    .from("students").select("*")
    .ilike("id", id).eq("pin", pin).single();
  if (!data) return null;
  return dbEnrichStudent(buildBlank(data));
}

async function dbLoadClass(className: string): Promise<StudentRecord[]> {
  const { data: rows } = await supabase
    .from("students").select("*")
    .eq("class_name", className).order("name");
  if (!rows?.length) return [];

  const ids = rows.map(r => r.id);

  // Batch-fetch scores + result_status for the whole class
  const [{ data: allScores }, { data: statuses }] = await Promise.all([
    supabase.from("scores").select("student_id,subject_name,class_score,exam_score")
      .in("student_id", ids).eq("term", SCHOOL.term).eq("year", SCHOOL.year),
    supabase.from("result_status").select("student_id,saved")
      .in("student_id", ids).eq("term", SCHOOL.term).eq("year", SCHOOL.year),
  ]);

  return rows.map(row => {
    const stu    = buildBlank(row);
    stu.saved    = statuses?.find(s => s.student_id === row.id)?.saved ?? false;
    const scores = allScores?.filter(s => s.student_id === row.id) ?? [];
    if (scores.length) {
      stu.subjects = SUBJECTS.map(name => {
        const f = scores.find(s => s.subject_name === name);
        return { name, classScore: f?.class_score ?? "", examScore: f?.exam_score ?? "" };
      });
    }
    return stu;
  });
}

async function dbEnrichStudent(stu: StudentRecord): Promise<StudentRecord> {
  const { id } = stu;
  const [scR, coR, reR, atR, stR] = await Promise.all([
    supabase.from("scores").select("*").eq("student_id", id).eq("term", SCHOOL.term).eq("year", SCHOOL.year),
    supabase.from("conduct").select("*").eq("student_id", id).eq("term", SCHOOL.term).eq("year", SCHOOL.year),
    supabase.from("remarks").select("*").eq("student_id", id).eq("term", SCHOOL.term).eq("year", SCHOOL.year).maybeSingle(),
    supabase.from("attendance").select("*").eq("student_id", id).eq("term", SCHOOL.term).eq("year", SCHOOL.year).maybeSingle(),
    supabase.from("result_status").select("*").eq("student_id", id).eq("term", SCHOOL.term).eq("year", SCHOOL.year).maybeSingle(),
  ]);

  if (scR.data?.length) {
    stu.subjects = SUBJECTS.map(name => {
      const f = scR.data!.find((s: any) => s.subject_name === name);
      return { name, classScore: f?.class_score ?? "", examScore: f?.exam_score ?? "" };
    });
  }
  if (coR.data?.length) {
    stu.conduct = CONDUCT_CATS.map(cat => {
      const f = coR.data!.find((c: any) => c.category === cat);
      return { category: cat, rating: (f?.rating ?? "GOOD") as Conduct };
    });
  }
  if (reR.data) {
    stu.classTeacherRemark = reR.data.class_teacher_remark ?? "";
    stu.headTeacherRemark  = reR.data.head_teacher_remark  ?? "";
  }
  if (atR.data) {
    stu.daysPresent  = atR.data.days_present  ?? 0;
    stu.daysAbsent   = atR.data.days_absent   ?? 0;
    stu.totalDays    = atR.data.total_days    ?? 50;
    stu.lateArrivals = atR.data.late_arrivals ?? 0;
  }
  stu.saved = stR.data?.saved ?? false;
  return stu;
}

async function dbSaveRecord(stu: StudentRecord): Promise<boolean> {
  try {
    await Promise.all([
      supabase.from("scores").upsert(
        stu.subjects.map(s => ({
          student_id: stu.id, subject_name: s.name,
          class_score: s.classScore, exam_score: s.examScore,
          term: SCHOOL.term, year: SCHOOL.year,
        })),
        { onConflict: "student_id,subject_name,term,year" }
      ),
      supabase.from("conduct").upsert(
        stu.conduct.map(c => ({
          student_id: stu.id, category: c.category, rating: c.rating,
          term: SCHOOL.term, year: SCHOOL.year,
        })),
        { onConflict: "student_id,category,term,year" }
      ),
      supabase.from("remarks").upsert([{
        student_id:            stu.id,
        class_teacher_remark:  stu.classTeacherRemark,
        head_teacher_remark:   stu.headTeacherRemark,
        term: SCHOOL.term, year: SCHOOL.year,
      }], { onConflict: "student_id,term,year" }),
      supabase.from("attendance").upsert([{
        student_id:   stu.id,
        days_present: stu.daysPresent,  days_absent:   stu.daysAbsent,
        total_days:   stu.totalDays,    late_arrivals: stu.lateArrivals,
        term: SCHOOL.term, year: SCHOOL.year,
      }], { onConflict: "student_id,term,year" }),
      supabase.from("result_status").upsert([{
        student_id: stu.id, saved: true,
        term: SCHOOL.term, year: SCHOOL.year,
      }], { onConflict: "student_id,term,year" }),
    ]);
    return true;
  } catch { return false; }
}

// ══════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════

const M = (extra?: object) => ({ fontFamily: FONT, color: C.amber, ...extra } as any);

const Loader = ({ color = C.red }: { color?: string }) => (
  <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: C.bg }}>
    <ActivityIndicator size="large" color={color} />
    <Text style={M({ fontSize: 9, color: C.dim, letterSpacing: 3, marginTop: 12 })}>LOADING...</Text>
  </View>
);

const TopBar = ({ title, sub, onBack, badge, dark = false }: {
  title: string; sub?: string; onBack?: () => void; badge?: string; dark?: boolean;
}) => (
  <View style={[st.topBar, dark && { backgroundColor: "#1a1a1a", borderBottomColor: "#cc000040" }]}>
    {onBack && (
      <TouchableOpacity onPress={onBack} style={{ marginRight: 10 }}>
        <Text style={M({ fontSize: 22, color: dark ? "#ffffff" : C.red })}>‹</Text>
      </TouchableOpacity>
    )}
    <View style={{ flex: 1 }}>
      {sub && <Text style={M({ fontSize: 8, color: dark ? "#ffffff80" : C.dim, letterSpacing: 2, marginBottom: 2 })}>{sub}</Text>}
      <Text style={M({ fontSize: 13, letterSpacing: 2, color: dark ? "#ffffff" : C.amber })} numberOfLines={1}>{title}</Text>
    </View>
    {badge && <Text style={M({ fontSize: 8, color: C.green, letterSpacing: 2 })}>{badge}</Text>}
  </View>
);

const SectionHead = ({ title, color = C.red }: { title: string; color?: string }) => (
  <View style={{ borderBottomWidth: 1, borderBottomColor: `${color}30`, paddingBottom: 8, marginBottom: 14 }}>
    <Text style={M({ fontSize: 9, letterSpacing: 4, color })}>▸ {title}</Text>
  </View>
);

const Pill = ({ label, color }: { label: string; color: string }) => (
  <View style={{ borderWidth: 1, borderColor: `${color}50`, backgroundColor: `${color}15`, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start" }}>
    <Text style={M({ fontSize: 8, letterSpacing: 2, color })}>● {label}</Text>
  </View>
);

const ProgressBar = ({ value, max = 100, color = C.red, height = 4 }: { value: number; max?: number; color?: string; height?: number }) => {
  const pct = max ? Math.round((Math.min(value, max) / max) * 100) : 0;
  return (
    <View style={{ height, backgroundColor: C.faint, marginTop: 6 }}>
      <View style={{ height, width: `${pct}%` as any, backgroundColor: color }} />
    </View>
  );
};

// ══════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════

export default function SchoolApp() {

  // ── App state ──
  const [mode, setMode] = useState<AppMode>("LANDING");

  // ── Teacher state ──
  const [tScreen,   setTScreen]   = useState<TeacherScreen>("T_LOGIN");
  const [tTeacher,  setTTeacher]  = useState<TeacherAccount | null>(null);
  const [tId,       setTId]       = useState("");
  const [tPin,      setTPin]      = useState("");
  const [tErr,      setTErr]      = useState("");
  const [tLoading,  setTLoading]  = useState(false);
  const [tStudents, setTStudents] = useState<StudentRecord[]>([]);
  const [tListLoad, setTListLoad] = useState(false);
  const [activeStu, setActiveStu] = useState<StudentRecord | null>(null);
  const [stuLoading,setStuLoading]= useState(false);
  const [tTab,      setTTab]      = useState<RecordTab>("SCORES");
  const [saving,    setSaving]    = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  // ── Student state ──
  const [sScreen,  setSScreen]  = useState<StudentScreen>("S_LOGIN");
  const [sStudent, setSStudent] = useState<StudentRecord | null>(null);
  const [sId,      setSId]      = useState("");
  const [sPin,     setSPin]     = useState("");
  const [sErr,     setSErr]     = useState("");
  const [sLoading, setSLoading] = useState(false);

  // ── Load class list when teacher navigates to student list ──
  useEffect(() => {
    if (tTeacher && tScreen === "T_STUDENT_LIST") {
      setTListLoad(true);
      dbLoadClass(tTeacher.className).then(list => {
        setTStudents(list);
        setTListLoad(false);
      });
    }
  }, [tTeacher, tScreen]);

  // ── Patch active student locally ──
  const patch = (p: Partial<StudentRecord>): void =>
    setActiveStu((prev: StudentRecord | null): StudentRecord | null => prev ? { ...prev, ...p } : prev);

  const updateScore = (i: number, field: "classScore" | "examScore", val: string) => {
    if (!activeStu) return;
    const max   = field === "classScore" ? 40 : 60;
    const clean = val.replace(/[^0-9]/g, "");
    if (clean === "" || parseInt(clean) <= max) {
      const updated = [...activeStu.subjects];
      updated[i] = { ...updated[i], [field]: clean };
      patch({ subjects: updated });
    }
  };

  const updateConduct = (i: number, rating: Conduct) => {
    if (!activeStu) return;
    const updated = [...activeStu.conduct];
    updated[i] = { ...updated[i], rating };
    patch({ conduct: updated });
  };

  // ── Open a student record (fetch full data) ──
  const openRecord = useCallback(async (stu: StudentRecord) => {
    setStuLoading(true);
    setTScreen("T_RECORD");
    setTTab("SCORES");
    const full = await dbEnrichStudent({ ...stu });
    setActiveStu(full);
    setStuLoading(false);
  }, []);

  // ── Save record to DB ──
  const handleSave = async () => {
    if (!activeStu) return;
    setSaving(true);
    const ok = await dbSaveRecord(activeStu);
    setSaving(false);
    if (ok) {
      setSaveFlash(true);
      setTStudents((prev: StudentRecord[]) => prev.map((s: StudentRecord) => s.id === activeStu.id ? { ...s, saved: true } : s));
      setTimeout(() => { setSaveFlash(false); setTScreen("T_STUDENT_LIST"); }, 1200);
    } else {
      Alert.alert("Save Failed", "Could not save to database. Check your connection and try again.");
    }
  };

  // ── Teacher login ──
  const doTeacherLogin = async () => {
    if (!tId || !tPin) return;
    setTLoading(true); setTErr("");
    const t = await dbLoginTeacher(tId, tPin);
    setTLoading(false);
    if (t) { setTTeacher(t); setTId(""); setTPin(""); setTScreen("T_DASHBOARD"); }
    else   { setTErr("INVALID ID OR PIN"); setTPin(""); }
  };

  // ── Student login ──
  const doStudentLogin = async () => {
    if (!sId || !sPin) return;
    setSLoading(true); setSErr("");
    const s = await dbLoginStudent(sId, sPin);
    setSLoading(false);
    if (s) { setSStudent(s); setSId(""); setSPin(""); setSScreen("S_DASHBOARD"); }
    else   { setSErr("INVALID ID OR PIN"); setSPin(""); }
  };

  // ── Refresh student data (called when student navigates to dashboard) ──
  const refreshStudent = async (base: StudentRecord) => {
    setSLoading(true);
    const fresh = await dbEnrichStudent({ ...base });
    setSStudent(fresh);
    setSLoading(false);
  };

  const savedCount: number = tStudents.filter((s: StudentRecord) => s.saved).length;

  // ══════════════════════════════════════════
  // LANDING
  // ══════════════════════════════════════════
  if (mode === "LANDING") return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView contentContainerStyle={{ padding: 24 }}>
        <View style={{ alignItems: "center", marginTop: 30, marginBottom: 44 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: C.red, alignItems: "center", justifyContent: "center", marginBottom: 14, borderWidth: 3, borderColor: "#1a1a1a" }}>
            <Text style={{ fontSize: 32, color: "#ffffff" }}>◈</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
            <View style={{ height: 3, width: 40, backgroundColor: C.red }} />
            <View style={{ height: 3, width: 40, backgroundColor: "#1a1a1a" }} />
          </View>
          <Text style={M({ fontSize: 16, letterSpacing: 2, textAlign: "center", fontWeight: "bold", color: "#1a1a1a", marginBottom: 4 })}>{SCHOOL.name}</Text>
          <Text style={M({ fontSize: 9, color: C.dim, letterSpacing: 2 })}>{SCHOOL.term} · {SCHOOL.year}</Text>
          <Text style={M({ fontSize: 8, color: C.red, letterSpacing: 2, marginTop: 6, fontStyle: "italic", textAlign: "center" })}> {SCHOOL.motto}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
            <View style={{ height: 3, width: 40, backgroundColor: "#1a1a1a" }} />
            <View style={{ height: 3, width: 40, backgroundColor: C.red }} />
          </View>
        </View>

        <Text style={M({ fontSize: 9, color: C.dim, letterSpacing: 4, textAlign: "center", marginBottom: 20 })}>SELECT PORTAL TO CONTINUE</Text>

        <TouchableOpacity onPress={() => { setMode("TEACHER"); setTScreen("T_LOGIN"); }}
          style={[st.portalBtn, { borderColor: C.red, backgroundColor: "#cc000010", borderLeftWidth: 5 }]}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.red, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 20, color: "#ffffff" }}>⌨</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={M({ fontSize: 13, letterSpacing: 2, fontWeight: "bold", color: "#1a1a1a", marginBottom: 4 })}>TEACHER PORTAL</Text>
            <Text style={M({ fontSize: 9, color: C.dim })}>Record scores · Conduct · Remarks</Text>
          </View>
          <Text style={M({ fontSize: 22, color: C.red })}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => { setMode("STUDENT"); setSScreen("S_LOGIN"); }}
          style={[st.portalBtn, { borderColor: "#1a1a1a", backgroundColor: "#1a1a1a08", borderLeftWidth: 5, marginTop: 10 }]}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#1a1a1a", alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 20, color: "#ffffff" }}>◉</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={M({ fontSize: 13, letterSpacing: 2, fontWeight: "bold", color: "#1a1a1a", marginBottom: 4 })}>STUDENT PORTAL</Text>
            <Text style={M({ fontSize: 9, color: C.dim })}>Check results · Attendance · Remarks</Text>
          </View>
          <Text style={M({ fontSize: 22, color: "#1a1a1a" })}>›</Text>
        </TouchableOpacity>

        <Text style={M({ fontSize: 8, color: C.dim, letterSpacing: 3, textAlign: "center", marginTop: 36 })}>
          © {new Date().getFullYear()} {SCHOOL.name}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );

  // ══════════════════════════════════════════
  // TEACHER LOGIN
  // ══════════════════════════════════════════
  if (mode === "TEACHER" && tScreen === "T_LOGIN") return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <TouchableOpacity onPress={() => setMode("LANDING")} style={{ marginBottom: 28 }}>
            <Text style={M({ fontSize: 11, color: C.red, letterSpacing: 2 })}>‹ BACK</Text>
          </TouchableOpacity>

          <View style={{ backgroundColor: C.red, padding: 16, marginBottom: 24, borderLeftWidth: 5, borderLeftColor: "#1a1a1a" }}>
            <Text style={{ fontFamily: FONT, fontSize: 9, color: "#ffffff99", letterSpacing: 5, marginBottom: 4 }}>⌨ TEACHER PORTAL</Text>
            <Text style={{ fontFamily: FONT, fontSize: 20, letterSpacing: 3, color: "#ffffff", fontWeight: "bold" }}>STAFF LOGIN</Text>
            <Text style={{ fontFamily: FONT, fontSize: 10, color: "#ffffff99", marginTop: 4 }}>{SCHOOL.name}</Text>
          </View>

          <Text style={st.label}>STAFF ID</Text>
          <TextInput value={tId} onChangeText={v => { setTId(v); setTErr(""); }}
            placeholder="e.g. TCH-001" placeholderTextColor="#aaaaaa"
            autoCapitalize="characters" style={[st.input, { marginBottom: 14 }]} />

          <Text style={st.label}>PIN</Text>
          <TextInput value={tPin} onChangeText={v => { setTPin(v); setTErr(""); }}
            placeholder="••••" placeholderTextColor="#aaaaaa"
            secureTextEntry keyboardType="number-pad" maxLength={4}
            style={[st.input, { textAlign: "center", fontSize: 22, letterSpacing: 12, borderColor: tErr ? C.red : "#dddddd" }]} />
          {tErr !== "" && <Text style={M({ fontSize: 9, color: C.red, letterSpacing: 2, marginTop: 6 })}>✕ {tErr}</Text>}

          <TouchableOpacity onPress={doTeacherLogin} disabled={tLoading}
            style={[st.primaryBtn, { marginTop: 22, opacity: tLoading ? 0.7 : 1 }]}>
            {tLoading
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={{ fontFamily: FONT, fontSize: 12, letterSpacing: 4, color: "#ffffff", fontWeight: "bold" }}>▸ LOGIN</Text>}
          </TouchableOpacity>

          <View style={[st.infoBox, { marginTop: 22 }]}>
            <Text style={M({ fontSize: 8, color: C.red, letterSpacing: 3, marginBottom: 8 })}>▸ DEMO ACCOUNTS</Text>
            <Text style={M({ fontSize: 9, color: C.dim, marginBottom: 4 })}>
              <Text style={{ color: C.red, fontWeight: "bold" }}>TCH-001</Text>{"  "}PIN: 1234{"  "}PRIMARY 6A
            </Text>
            <Text style={M({ fontSize: 9, color: C.dim })}>
              <Text style={{ color: C.red, fontWeight: "bold" }}>TCH-002</Text>{"  "}PIN: 2222{"  "}JHS 2B
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  // ══════════════════════════════════════════
  // TEACHER DASHBOARD
  // ══════════════════════════════════════════
  if (mode === "TEACHER" && tScreen === "T_DASHBOARD" && tTeacher) return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.card} />
      <TopBar title="TEACHER DASHBOARD" sub={`${tTeacher.className} · ${SCHOOL.term}`} badge={`${savedCount}/${tStudents.length} SAVED`} />
      <ScrollView contentContainerStyle={{ padding: 15 }}>
        <View style={[st.card, { borderColor: C.red, borderLeftWidth: 4, marginBottom: 14 }]}>
          <Text style={M({ fontSize: 8, color: C.red, letterSpacing: 3, marginBottom: 8 })}>▸ LOGGED IN AS</Text>
          <Text style={M({ fontSize: 15, letterSpacing: 1, fontWeight: "bold", marginBottom: 3 })}>{tTeacher.name}</Text>
          <Text style={M({ fontSize: 9, color: C.dim })}>{tTeacher.className} · {tTeacher.subject} · {SCHOOL.term} {SCHOOL.year}</Text>
        </View>

        {[
          { label: "▸ RECORD STUDENT RESULTS", desc: "Enter scores, conduct & remarks", sc: "T_STUDENT_LIST" },
          { label: "◈ VIEW SUBMITTED RECORDS",  desc: "Browse saved result reports",    sc: "T_VIEW_SAVED"   },
        ].map(({ label, desc, sc }) => (
          <TouchableOpacity key={sc} onPress={() => setTScreen(sc as TeacherScreen)}
            style={[st.menuBtn, { marginBottom: 8, borderLeftWidth: 4, borderLeftColor: C.red }]}>
            <Text style={M({ fontSize: 12, letterSpacing: 2, fontWeight: "bold", color: "#1a1a1a" })}>{label}</Text>
            <Text style={M({ fontSize: 9, color: C.dim, marginTop: 4 })}>{desc}</Text>
          </TouchableOpacity>
        ))}

        <TouchableOpacity onPress={() => { setTTeacher(null); setTStudents([]); setTScreen("T_LOGIN"); setMode("LANDING"); }}
          style={[st.ghostBtn, { marginTop: 14 }]}>
          <Text style={M({ fontSize: 10, letterSpacing: 3, color: C.dim })}>LOGOUT</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );

  // ══════════════════════════════════════════
  // TEACHER STUDENT LIST
  // ══════════════════════════════════════════
  if (mode === "TEACHER" && tScreen === "T_STUDENT_LIST") return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.card} />
      <TopBar title="SELECT STUDENT" sub={tTeacher?.className}
        onBack={() => setTScreen("T_DASHBOARD")} badge={`${savedCount}/${tStudents.length}`} />
      {tListLoad
        ? <Loader />
        : (
          <ScrollView contentContainerStyle={{ padding: 15 }}>
            <SectionHead title={`${tTeacher?.className} — ${tStudents.length} STUDENTS`} />
            {tStudents.map((stu: StudentRecord) => {
              const filled: number = stu.subjects.filter((x: SubjectScore) => x.classScore && x.examScore).length;
              const pct: number = Math.round((filled / stu.subjects.length) * 100);
              return (
                <TouchableOpacity key={stu.id} onPress={() => openRecord(stu)}
                  style={[st.card, {
                    borderLeftWidth: 4,
                    borderLeftColor: stu.saved ? C.green : C.red,
                    borderColor: stu.saved ? `${C.green}30` : C.border,
                    backgroundColor: stu.saved ? `${C.green}06` : C.card,
                    marginBottom: 6,
                  }]}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flex: 1 }}>
                      <Text style={M({ fontSize: 8, color: C.dim })}>{stu.id} · {stu.gender} · {stu.className}</Text>
                      <Text style={M({ fontSize: 13, letterSpacing: 1, fontWeight: "bold", color: "#1a1a1a", marginTop: 3 })}>{stu.name}</Text>
                    </View>
                    <Text style={M({ fontSize: 9, color: stu.saved ? C.green : pct > 0 ? C.red : C.dim })}>
                      {stu.saved ? "✓ SAVED" : `${pct}%`}
                    </Text>
                  </View>
                  <ProgressBar value={pct} color={stu.saved ? C.green : C.red} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
    </SafeAreaView>
  );

  // ══════════════════════════════════════════
  // TEACHER RECORD SCREEN
  // ══════════════════════════════════════════
  if (mode === "TEACHER" && tScreen === "T_RECORD") {
    if (stuLoading || !activeStu) return (
      <SafeAreaView style={st.safe}>
        <TopBar title="Loading student..." onBack={() => setTScreen("T_STUDENT_LIST")} />
        <Loader />
      </SafeAreaView>
    );
    const avg = getAvg(activeStu);
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar barStyle="dark-content" backgroundColor={C.card} />
        <TopBar title={activeStu.name} sub={`${activeStu.id} · ${activeStu.className}`}
          onBack={() => setTScreen("T_STUDENT_LIST")} />

        {/* Tabs */}
        <View style={{ flexDirection: "row", backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, padding: 8, gap: 4 }}>
          {(["SCORES", "CONDUCT", "REMARKS", "ATTENDANCE"] as RecordTab[]).map(t => (
            <TouchableOpacity key={t} onPress={() => setTTab(t)}
              style={[st.subTab, { flex: 1 }, tTab === t && { borderColor: C.red, backgroundColor: `${C.red}12`, borderBottomWidth: 2 }]}>
              <Text style={M({ fontSize: 7, letterSpacing: 1, textAlign: "center", color: tTab === t ? C.red : C.dim, fontWeight: tTab === t ? "bold" : "normal" })}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 90 }}>

            {/* SCORES */}
            {tTab === "SCORES" && (<>
              <SectionHead title="ENTER SUBJECT SCORES" />
              <View style={{ flexDirection: "row", marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.faint }}>
                <Text style={M({ fontSize: 7, color: C.dim, letterSpacing: 2, flex: 1 })}>SUBJECT</Text>
                <Text style={M({ fontSize: 7, color: C.dim, width: 62, textAlign: "center" })}>CLS/40</Text>
                <Text style={M({ fontSize: 7, color: C.dim, width: 62, textAlign: "center" })}>EXM/60</Text>
                <Text style={M({ fontSize: 7, color: C.dim, width: 50, textAlign: "center" })}>TOTAL</Text>
              </View>
              {activeStu.subjects.map((sub: SubjectScore, i: number) => {
                const total: number = getTotal(sub);
                const grade: Grade = getGrade(total);
                return (
                  <View key={sub.name} style={{ marginBottom: 11, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: C.faint }}>
                    <Text style={M({ fontSize: 9, color: C.red, fontWeight: "bold", letterSpacing: 1, marginBottom: 6 })}>{sub.name.toUpperCase()}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <View style={{ flex: 1 }} />
                      <TextInput value={sub.classScore} onChangeText={(v: string) => updateScore(i, "classScore", v)}
                        placeholder="0-40" placeholderTextColor="#aaaaaa" keyboardType="number-pad" maxLength={2}
                        style={[st.scoreInput, { width: 62 }]} />
                      <TextInput value={sub.examScore} onChangeText={(v: string) => updateScore(i, "examScore", v)}
                        placeholder="0-60" placeholderTextColor="#aaaaaa" keyboardType="number-pad" maxLength={2}
                        style={[st.scoreInput, { width: 62, marginLeft: 4 }]} />
                      <View style={{ width: 50, alignItems: "center" }}>
                        {sub.classScore && sub.examScore ? (<>
                          <Text style={M({ fontSize: 13, fontWeight: "bold", color: GRADE_C[grade] })}>{total}</Text>
                          <Text style={M({ fontSize: 9, color: GRADE_C[grade] })}>{grade}</Text>
                        </>) : <Text style={M({ fontSize: 12, color: C.faint })}>—</Text>}
                      </View>
                    </View>
                  </View>
                );
              })}
              {avg > 0 && (
                <View style={{ borderWidth: 1, borderColor: C.red, padding: 12, backgroundColor: `${C.red}08`, flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <Text style={M({ fontSize: 9, color: C.dim, letterSpacing: 3 })}>RUNNING AVERAGE</Text>
                  <Text style={M({ fontSize: 20, color: C.red, fontWeight: "bold" })}>{avg}%</Text>
                </View>
              )}
            </>)}

            {/* CONDUCT */}
            {tTab === "CONDUCT" && (<>
                    <SectionHead title="RATE STUDENT CONDUCT" />
                    {activeStu.conduct.map((c: ConductItem, i: number) => (
                    <View key={c.category} style={{ marginBottom: 20 }}>
                      <Text style={M({ fontSize: 9, color: C.dim, letterSpacing: 3, marginBottom: 8 })}>{c.category.toUpperCase()}</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                      {CONDUCT_OPTIONS.map((opt: Conduct) => (
                        <TouchableOpacity key={opt} onPress={() => updateConduct(i, opt)}
                        style={{ borderWidth: 1, borderColor: c.rating === opt ? COND_C[opt] : C.border, backgroundColor: c.rating === opt ? `${COND_C[opt]}15` : "transparent", paddingHorizontal: 10, paddingVertical: 7 }}>
                        <Text style={M({ fontSize: 8, letterSpacing: 1, color: c.rating === opt ? COND_C[opt] : C.dim, fontWeight: c.rating === opt ? "bold" : "normal" })}>{opt}</Text>
                        </TouchableOpacity>
                      ))}
                      </View>
                    </View>
                    ))}
                  </>)}

            {/* REMARKS */}
            {tTab === "REMARKS" && (<>
              <SectionHead title="CLASS TEACHER REMARK" />
              <TextInput value={activeStu.classTeacherRemark}
                onChangeText={v => patch({ classTeacherRemark: v })}
                placeholder="Write your remark about this student..."
                placeholderTextColor="#aaaaaa" multiline numberOfLines={4}
                style={[st.input, { height: 90, textAlignVertical: "top", lineHeight: 20 }]} />
              <Text style={M({ fontSize: 8, color: C.dim, marginTop: 5, letterSpacing: 2 })}>{activeStu.classTeacherRemark.length} CHARS</Text>
              <View style={{ marginTop: 16 }}>
                <SectionHead title="QUICK REMARKS" />
                {[
                  "An excellent student who demonstrates strong commitment to learning.",
                  "Shows great improvement and potential. Keep up the good work!",
                  "A hardworking and dedicated student with a positive attitude.",
                  "Needs to focus more on class activities and homework submission.",
                  "A brilliant and consistent student. We expect great things ahead.",
                ].map(q => (
                  <TouchableOpacity key={q} onPress={() => patch({ classTeacherRemark: q })}
                    style={[st.quickRemark, { marginBottom: 6 }]}>
                    <Text style={M({ fontSize: 9, color: C.dim, lineHeight: 16 })}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={{ marginTop: 20 }}>
                <SectionHead title="HEAD TEACHER REMARK" />
                <TextInput value={activeStu.headTeacherRemark}
                  onChangeText={v => patch({ headTeacherRemark: v })}
                  placeholder="Head teacher's remark (optional)..."
                  placeholderTextColor="#aaaaaa" multiline numberOfLines={3}
                  style={[st.input, { height: 80, textAlignVertical: "top", lineHeight: 20 }]} />
              </View>
            </>)}

            {/* ATTENDANCE */}
            {tTab === "ATTENDANCE" && (<>
              <SectionHead title="ATTENDANCE RECORD" />
              {([
                { field: "daysPresent",  label: "DAYS PRESENT",  max: 50, hint: "Out of total school days" },
                { field: "daysAbsent",   label: "DAYS ABSENT",   max: 50, hint: "Number of absences" },
                { field: "lateArrivals", label: "LATE ARRIVALS", max: 20, hint: "Times arrived late" },
              ] as const).map(({ field, label, max, hint }) => (
                <View key={field} style={{ marginBottom: 16 }}>
                  <Text style={st.label}>{label}{"  "}<Text style={{ color: "#aaaaaa" }}>({hint})</Text></Text>
                  <TextInput
                    value={(activeStu as any)[field] ? String((activeStu as any)[field]) : ""}
                    onChangeText={v => patch({ [field]: Math.min(parseInt(v) || 0, max) } as any)}
                    placeholder={`0 - ${max}`} placeholderTextColor="#aaaaaa"
                    keyboardType="number-pad" maxLength={2} style={st.input} />
                </View>
              ))}
              {activeStu.daysPresent > 0 && (
                <View style={{ borderWidth: 1, borderColor: C.red, padding: 12, backgroundColor: `${C.red}08`, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <Text style={M({ fontSize: 9, color: C.dim, letterSpacing: 3 })}>ATTENDANCE RATE</Text>
                  <Text style={M({ fontSize: 20, color: C.red, fontWeight: "bold" })}>{attendPct(activeStu)}%</Text>
                </View>
              )}
            </>)}
          </ScrollView>
        </KeyboardAvoidingView>

        {/* Save bar */}
        <View style={st.saveBar}>
          <TouchableOpacity onPress={() => setTScreen("T_STUDENT_LIST")}
            style={[st.saveBarBtn, { borderColor: C.border }]}>
            <Text style={M({ fontSize: 10, letterSpacing: 2, color: C.dim })}>‹ BACK</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSave} disabled={saving || saveFlash}
            style={[st.saveBarBtn, { flex: 1, backgroundColor: saveFlash ? C.green : C.red, borderColor: saveFlash ? C.green : C.red }]}>
            {saving
              ? <ActivityIndicator color="#ffffff" size="small" />
              : <Text style={{ fontFamily: FONT, fontSize: 10, letterSpacing: 2, fontWeight: "bold", color: "#ffffff" }}>
                  {saveFlash ? "✓ SAVED TO DATABASE!" : "SAVE TO DATABASE"}
                </Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════
  // TEACHER VIEW SAVED
  // ══════════════════════════════════════════
  if (mode === "TEACHER" && tScreen === "T_VIEW_SAVED") return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.card} />
      <TopBar title="SAVED RECORDS" sub={tTeacher?.className} onBack={() => setTScreen("T_DASHBOARD")} />
      <ScrollView contentContainerStyle={{ padding: 15 }}>
        <SectionHead title="SUBMITTED RESULTS" />
        {tStudents.filter((s: StudentRecord) => s.saved).length === 0
          ? <Text style={M({ fontSize: 10, color: C.dim, letterSpacing: 2, textAlign: "center", marginTop: 40 })}>NO RECORDS SAVED YET.</Text>
          : tStudents.filter((s: StudentRecord) => s.saved).map((stu: StudentRecord) => {
              const avg2: number = getAvg(stu);
              const g: Grade = getGrade(avg2);
              return (
          <View key={stu.id} style={[st.card, { borderColor: C.border, borderLeftWidth: 4, borderLeftColor: GRADE_C[g], marginBottom: 8 }]}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flex: 1 }}>
                <Text style={M({ fontSize: 8, color: C.dim })}>{stu.id}</Text>
                <Text style={M({ fontSize: 13, fontWeight: "bold", color: "#1a1a1a", marginTop: 3 })}>{stu.name}</Text>
                <Text style={M({ fontSize: 8, color: C.dim, marginTop: 2 })}>Avg: {avg2}%  ·  Attend: {attendPct(stu)}%</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={M({ fontSize: 24, color: GRADE_C[g], fontWeight: "bold" })}>{g}</Text>
                <Pill label="SAVED" color={C.green} />
              </View>
            </View>
          </View>
              );
            })}
      </ScrollView>
    </SafeAreaView>
  );

  // ══════════════════════════════════════════
  // STUDENT LOGIN
  // ══════════════════════════════════════════
  if (mode === "STUDENT" && sScreen === "S_LOGIN") return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <TouchableOpacity onPress={() => setMode("LANDING")} style={{ marginBottom: 28 }}>
            <Text style={M({ fontSize: 11, color: "#1a1a1a", letterSpacing: 2 })}>‹ BACK</Text>
          </TouchableOpacity>

          <View style={{ backgroundColor: "#1a1a1a", padding: 16, marginBottom: 24, borderLeftWidth: 5, borderLeftColor: C.red }}>
            <Text style={{ fontFamily: FONT, fontSize: 9, color: "#ffffff99", letterSpacing: 5, marginBottom: 4 }}>◉ STUDENT PORTAL</Text>
            <Text style={{ fontFamily: FONT, fontSize: 20, letterSpacing: 3, color: "#ffffff", fontWeight: "bold" }}>STUDENT LOGIN</Text>
            <Text style={{ fontFamily: FONT, fontSize: 10, color: "#ffffff99", marginTop: 4 }}>{SCHOOL.name}</Text>
          </View>

          <Text style={[st.label, { color: "#555555" }]}>STUDENT ID</Text>
          <TextInput value={sId} onChangeText={v => { setSId(v); setSErr(""); }}
            placeholder="e.g. STU-001" placeholderTextColor="#aaaaaa"
            autoCapitalize="characters" style={[st.input, { marginBottom: 14 }]} />

          <Text style={[st.label, { color: "#555555" }]}>PIN</Text>
          <TextInput value={sPin} onChangeText={v => { setSPin(v); setSErr(""); }}
            placeholder="••••" placeholderTextColor="#aaaaaa"
            secureTextEntry keyboardType="number-pad" maxLength={4}
            style={[st.input, { textAlign: "center", fontSize: 22, letterSpacing: 12, borderColor: sErr ? C.red : "#dddddd" }]} />
          {sErr !== "" && <Text style={M({ fontSize: 9, color: C.red, letterSpacing: 2, marginTop: 6 })}>✕ {sErr}</Text>}

          <TouchableOpacity onPress={doStudentLogin} disabled={sLoading}
            style={[st.primaryBtn, { marginTop: 22, backgroundColor: "#1a1a1a", borderColor: "#1a1a1a", opacity: sLoading ? 0.7 : 1 }]}>
            {sLoading
              ? <ActivityIndicator color="#ffffff" />
              : <Text style={{ fontFamily: FONT, fontSize: 12, letterSpacing: 4, color: "#ffffff", fontWeight: "bold" }}>▸ VIEW MY RESULTS</Text>}
          </TouchableOpacity>

          <View style={[st.infoBox, { marginTop: 22 }]}>
            <Text style={M({ fontSize: 8, color: C.red, letterSpacing: 3, marginBottom: 8 })}>▸ DEMO ACCOUNTS</Text>
            {[["STU-001","0001"],["STU-002","0002"],["STU-006","0006"],["STU-007","0007"]].map(([sid, p]) => (
              <Text key={sid} style={M({ fontSize: 9, color: C.dim, marginBottom: 4 })}>
                <Text style={{ color: "#1a1a1a", fontWeight: "bold" }}>{sid}</Text>{"  "}PIN: {p}
              </Text>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );

  // ══════════════════════════════════════════
  // STUDENT DASHBOARD
  // ══════════════════════════════════════════
  if (mode === "STUDENT" && sScreen === "S_DASHBOARD" && sStudent) {
    if (sLoading) return (
      <SafeAreaView style={st.safe}>
        <TopBar title={sStudent.name} dark />
        <Loader color="#1a1a1a" />
      </SafeAreaView>
    );
    const avg2 = getAvg(sStudent); const g = getGrade(avg2);
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <TopBar title={sStudent.name} sub={`${sStudent.className} · ${SCHOOL.term}`} dark />
        <ScrollView contentContainerStyle={{ padding: 15 }}>
          <View style={[st.card, { borderColor: "#1a1a1a", borderLeftWidth: 4, borderLeftColor: C.red, marginBottom: 14 }]}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {[
                ["ID",       sStudent.id],
                ["CLASS",    sStudent.className],
                ["GENDER",   sStudent.gender === "M" ? "MALE" : "FEMALE"],
                ["DOB",      sStudent.dob],
                ["GUARDIAN", sStudent.guardian],
                ["STATUS",   sStudent.saved ? "RESULTS READY" : "PENDING"],
              ].map(([lb, val]) => (
                <View key={lb} style={{ width: "47%" }}>
                  <Text style={M({ fontSize: 7, color: C.dim, letterSpacing: 3, marginBottom: 2 })}>{lb}</Text>
                  <Text style={M({ fontSize: 10, letterSpacing: 1, fontWeight: "bold", color: lb === "STATUS" && sStudent.saved ? C.green : "#1a1a1a" })}>{val}</Text>
                </View>
              ))}
            </View>
          </View>

          {sStudent.saved ? (<>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
              {[
                { label: "AVG SCORE",  value: `${avg2}%`, color: GRADE_C[g] },
                { label: "GRADE",      value: g,           color: GRADE_C[g] },
                { label: "ATTENDANCE", value: `${attendPct(sStudent)}%`, color: "#1a1a1a" },
              ].map(({ label, value, color }) => (
                <View key={label} style={[st.tile, { flex: 1 }]}>
                  <Text style={M({ fontSize: 7, color: C.dim, letterSpacing: 1, marginBottom: 4, textAlign: "center" })}>{label}</Text>
                  <Text style={M({ fontSize: 20, color, fontWeight: "bold", textAlign: "center" })}>{value}</Text>
                </View>
              ))}
            </View>
            {[
              { icon: "◈", label: "VIEW RESULTS",    desc: "Scores & grades per subject",   sc: "S_RESULTS" },
              { icon: "◉", label: "CONDUCT REPORT",  desc: "Behaviour & character ratings",  sc: "S_CONDUCT" },
              { icon: "▸", label: "TEACHER REMARKS", desc: "Comments from your teachers",    sc: "S_REMARKS" },
              { icon: "◌", label: "ATTENDANCE",      desc: "Presence & punctuality record",  sc: "S_ATTENDANCE" },
            ].map(({ icon, label, desc, sc }) => (
              <TouchableOpacity key={sc} onPress={() => setSScreen(sc as StudentScreen)}
                style={[st.menuBtn, { borderLeftWidth: 4, borderLeftColor: "#1a1a1a", marginBottom: 6 }]}>
                <Text style={M({ fontSize: 11, letterSpacing: 2, fontWeight: "bold", color: "#1a1a1a" })}>{icon} {label}</Text>
                <Text style={M({ fontSize: 9, color: C.dim, marginTop: 4 })}>{desc}</Text>
              </TouchableOpacity>
            ))}
          </>) : (
            <View style={[st.infoBox, { alignItems: "center", paddingVertical: 24, marginBottom: 14 }]}>
              <Text style={{ fontSize: 28, marginBottom: 10 }}>⏳</Text>
              <Text style={M({ fontSize: 11, color: C.dim, letterSpacing: 2, textAlign: "center" })}>RESULTS NOT YET PUBLISHED</Text>
              <Text style={M({ fontSize: 9, color: C.dim, marginTop: 8, textAlign: "center" })}>Your teacher has not submitted your results yet.</Text>
              <TouchableOpacity onPress={() => refreshStudent(sStudent)} style={{ marginTop: 16, borderWidth: 1, borderColor: C.red, paddingHorizontal: 20, paddingVertical: 8 }}>
                <Text style={M({ fontSize: 9, color: C.red, letterSpacing: 2 })}>↻ REFRESH</Text>
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity onPress={() => { setSStudent(null); setSScreen("S_LOGIN"); setMode("LANDING"); }}
            style={[st.ghostBtn, { marginTop: 14 }]}>
            <Text style={M({ fontSize: 10, letterSpacing: 3, color: C.dim })}>LOGOUT</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════
  // STUDENT RESULTS
  // ══════════════════════════════════════════
  if (mode === "STUDENT" && sScreen === "S_RESULTS" && sStudent) {
    const avg2 = getAvg(sStudent); const g = getGrade(avg2);
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <TopBar title="MY RESULTS" sub={`${sStudent.className} · ${SCHOOL.term}`}
          onBack={() => setSScreen("S_DASHBOARD")} dark />
        <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 30 }}>
          <View style={[st.card, { borderColor: GRADE_C[g], borderLeftWidth: 4, backgroundColor: `${GRADE_C[g]}08`, marginBottom: 14, flexDirection: "row", justifyContent: "space-around" }]}>
            {[{ label: "AVERAGE", value: `${avg2}%`, color: GRADE_C[g] }, { label: "GRADE", value: g, color: GRADE_C[g] }, { label: "TERM", value: SCHOOL.term, color: "#1a1a1a" }]
              .map(({ label, value, color }) => (
                <View key={label} style={{ alignItems: "center" }}>
                  <Text style={M({ fontSize: 7, color: C.dim, letterSpacing: 3, marginBottom: 4 })}>{label}</Text>
                  <Text style={M({ fontSize: 20, color, fontWeight: "bold" })}>{value}</Text>
                </View>
              ))}
          </View>

          <SectionHead title="SUBJECT RESULTS" />
          <View style={{ flexDirection: "row", marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: C.faint }}>
            <Text style={M({ fontSize: 7, color: C.dim, letterSpacing: 2, flex: 1 })}>SUBJECT</Text>
            <Text style={M({ fontSize: 7, color: C.dim, width: 36, textAlign: "center" })}>CLS</Text>
            <Text style={M({ fontSize: 7, color: C.dim, width: 36, textAlign: "center" })}>EXM</Text>
            <Text style={M({ fontSize: 7, color: C.dim, width: 42, textAlign: "center" })}>TOT</Text>
            <Text style={M({ fontSize: 7, color: C.dim, width: 28, textAlign: "center" })}>GRD</Text>
          </View>
          {sStudent.subjects.map(sub => {
            const t = getTotal(sub); const sg = getGrade(t);
            return (
              <View key={sub.name} style={{ flexDirection: "row", alignItems: "center", marginBottom: 9, paddingBottom: 7, borderBottomWidth: 1, borderBottomColor: C.faint }}>
                <Text style={M({ fontSize: 10, color: "#1a1a1a", flex: 1 })} numberOfLines={1}>{sub.name}</Text>
                <Text style={M({ fontSize: 11, color: C.dim, width: 36, textAlign: "center" })}>{sub.classScore || "—"}</Text>
                <Text style={M({ fontSize: 11, color: C.dim, width: 36, textAlign: "center" })}>{sub.examScore || "—"}</Text>
                <Text style={M({ fontSize: 13, fontWeight: "bold", color: GRADE_C[sg], width: 42, textAlign: "center" })}>{t || "—"}</Text>
                <Text style={M({ fontSize: 13, fontWeight: "bold", color: GRADE_C[sg], width: 28, textAlign: "center" })}>{sub.classScore && sub.examScore ? sg : "—"}</Text>
              </View>
            );
          })}
          <View style={{ flexDirection: "row", borderTopWidth: 2, borderTopColor: "#1a1a1a", paddingTop: 10, marginTop: 4, alignItems: "center" }}>
            <Text style={M({ fontSize: 9, color: C.dim, letterSpacing: 2, flex: 1 })}>OVERALL AVERAGE</Text>
            <Text style={M({ fontSize: 16, color: C.red, fontWeight: "bold", width: 42, textAlign: "center" })}>{avg2}%</Text>
            <Text style={M({ fontSize: 16, color: GRADE_C[g], fontWeight: "bold", width: 28, textAlign: "center" })}>{g}</Text>
          </View>

          <View style={[st.infoBox, { marginTop: 20 }]}>
            <SectionHead title="GRADING KEY" />
            <View style={{ flexDirection: "row", gap: 6 }}>
              {([["A","80-100","EXCL"],["B","70-79","V.GD"],["C","60-69","GOOD"],["D","50-59","AVG"],["F","0-49","FAIL"]] as const).map(([gd, range, lb]) => (
                <View key={gd} style={{ flex: 1, alignItems: "center" }}>
                  <View style={{ borderWidth: 1, borderColor: `${GRADE_C[gd]}40`, backgroundColor: `${GRADE_C[gd]}12`, width: "100%", alignItems: "center", paddingVertical: 5, marginBottom: 4 }}>
                    <Text style={M({ fontSize: 15, fontWeight: "bold", color: GRADE_C[gd] })}>{gd}</Text>
                  </View>
                  <Text style={M({ fontSize: 6, color: C.dim, textAlign: "center" })}>{range}</Text>
                  <Text style={M({ fontSize: 6, color: C.dim, textAlign: "center", marginTop: 1 })}>{lb}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ══════════════════════════════════════════
  // STUDENT CONDUCT
  // ══════════════════════════════════════════
  if (mode === "STUDENT" && sScreen === "S_CONDUCT" && sStudent) return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      <TopBar title="CONDUCT REPORT" sub={`${sStudent.className} · ${SCHOOL.term}`} onBack={() => setSScreen("S_DASHBOARD")} dark />
      <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 30 }}>
        <SectionHead title="CONDUCT & BEHAVIOUR" />
        {sStudent.conduct.map(c => (
          <View key={c.category} style={{ marginBottom: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <Text style={M({ fontSize: 9, color: C.dim, letterSpacing: 3 })}>{c.category.toUpperCase()}</Text>
              <Pill label={c.rating} color={COND_C[c.rating]} />
            </View>
            <View style={{ height: 6, backgroundColor: C.faint }}>
              <View style={{ height: 6, width: `${COND_W[c.rating]}%` as any, backgroundColor: COND_C[c.rating] }} />
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );

  // ══════════════════════════════════════════
  // STUDENT REMARKS
  // ══════════════════════════════════════════
  if (mode === "STUDENT" && sScreen === "S_REMARKS" && sStudent) return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
      <TopBar title="TEACHER REMARKS" sub={`${sStudent.className} · ${SCHOOL.term}`} onBack={() => setSScreen("S_DASHBOARD")} dark />
      <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 30 }}>
        <SectionHead title="CLASS TEACHER'S REMARK" />
        {sStudent.classTeacherRemark
          ? <View style={{ borderLeftWidth: 4, borderLeftColor: C.red, paddingLeft: 14, marginBottom: 24 }}>
              <Text style={M({ fontSize: 11, color: "#1a1a1a", lineHeight: 22, fontStyle: "italic" })}>{sStudent.classTeacherRemark}</Text>
              <Text style={M({ fontSize: 8, color: C.dim, marginTop: 8, letterSpacing: 2 })}>— CLASS TEACHER · {SCHOOL.term} {SCHOOL.year}</Text>
            </View>
          : <Text style={M({ fontSize: 10, color: C.dim, marginBottom: 24, letterSpacing: 2 })}>REMARK NOT YET ADDED.</Text>}

        <SectionHead title="HEAD TEACHER'S REMARK" />
        {sStudent.headTeacherRemark
          ? <View style={{ borderLeftWidth: 4, borderLeftColor: "#1a1a1a", paddingLeft: 14, marginBottom: 24 }}>
              <Text style={M({ fontSize: 11, color: "#1a1a1a", lineHeight: 22, fontStyle: "italic" })}>{sStudent.headTeacherRemark}</Text>
              <Text style={M({ fontSize: 8, color: C.dim, marginTop: 8, letterSpacing: 2 })}>— HEAD TEACHER · {SCHOOL.term} {SCHOOL.year}</Text>
            </View>
          : <Text style={M({ fontSize: 10, color: C.dim, marginBottom: 24, letterSpacing: 2 })}>REMARK NOT YET ADDED.</Text>}

        <View style={{ borderWidth: 1, borderColor: C.red, backgroundColor: `${C.red}08`, padding: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={M({ fontSize: 9, color: C.red, letterSpacing: 3, fontWeight: "bold" })}>★ PROMOTION STATUS</Text>
          <Text style={M({ fontSize: 10, color: C.red, fontWeight: "bold" })}>{getAvg(sStudent) >= 50 ? "ELIGIBLE" : "REVIEW REQ."}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );

  // ══════════════════════════════════════════
  // STUDENT ATTENDANCE
  // ══════════════════════════════════════════
  if (mode === "STUDENT" && sScreen === "S_ATTENDANCE" && sStudent) {
    const pct = attendPct(sStudent);
    return (
      <SafeAreaView style={st.safe}>
        <StatusBar barStyle="light-content" backgroundColor="#1a1a1a" />
        <TopBar title="ATTENDANCE" sub={`${sStudent.className} · ${SCHOOL.term}`} onBack={() => setSScreen("S_DASHBOARD")} dark />
        <ScrollView contentContainerStyle={{ padding: 15, paddingBottom: 30 }}>
          <SectionHead title="ATTENDANCE RECORD" />
          {[
            { label: "DAYS PRESENT",  value: sStudent.daysPresent, max: sStudent.totalDays, color: C.green },
            { label: "DAYS ABSENT",   value: sStudent.daysAbsent,  max: sStudent.totalDays, color: C.red },
            { label: "LATE ARRIVALS", value: sStudent.lateArrivals, max: 20,                color: "#1a1a1a" },
          ].map(({ label, value, max, color }) => (
            <View key={label} style={{ marginBottom: 22 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 7 }}>
                <Text style={M({ fontSize: 9, color: C.dim, letterSpacing: 3 })}>{label}</Text>
                <Text style={M({ fontSize: 14, color, fontWeight: "bold" })}>{value} / {max}</Text>
              </View>
              <View style={{ height: 8, backgroundColor: C.faint }}>
                <View style={{ height: 8, width: `${max ? Math.round((value / max) * 100) : 0}%` as any, backgroundColor: color }} />
              </View>
            </View>
          ))}
          <View style={[st.card, { flexDirection: "row", justifyContent: "space-around", marginTop: 8, borderLeftWidth: 4, borderLeftColor: C.red }]}>
            {[
              { label: "RATE",    value: `${pct}%`,              color: pct >= 80 ? C.green : pct >= 60 ? "#ff6600" : C.red },
              { label: "TOTAL",   value: `${sStudent.totalDays} days`, color: "#1a1a1a" },
              { label: "STATUS",  value: pct >= 80 ? "GOOD" : "ATTN", color: pct >= 80 ? C.green : C.red },
            ].map(({ label, value, color }) => (
              <View key={label} style={{ alignItems: "center" }}>
                <Text style={M({ fontSize: 7, color: C.dim, letterSpacing: 3, marginBottom: 5 })}>{label}</Text>
                <Text style={M({ fontSize: 15, color, fontWeight: "bold", textAlign: "center" })}>{value}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return null;
}

// ══════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════

const st = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.bg },
  topBar:     { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 15, paddingVertical: 12, flexDirection: "row", alignItems: "center" },
  card:       { borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 14 },
  tile:       { borderWidth: 1, borderColor: C.border, backgroundColor: C.card, padding: 10, alignItems: "center" },
  input:      { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dddddd", color: "#1a1a1a", fontFamily: Platform.select({ ios: "Courier New", android: "monospace", default: "monospace" }), fontSize: 13, paddingHorizontal: 11, paddingVertical: 9, width: "100%" },
  scoreInput: { backgroundColor: "#ffffff", borderWidth: 1, borderColor: "#dddddd", color: "#1a1a1a", fontFamily: Platform.select({ ios: "Courier New", android: "monospace", default: "monospace" }), fontSize: 12, paddingVertical: 7, textAlign: "center" },
  label:      { fontFamily: Platform.select({ ios: "Courier New", android: "monospace", default: "monospace" }), fontSize: 8, color: "#555555", letterSpacing: 3, marginBottom: 4 },
  subTab:     { borderWidth: 1, borderColor: "#dddddd", paddingVertical: 7, alignItems: "center" },
  primaryBtn: { borderWidth: 1, borderColor: C.red, backgroundColor: C.red, paddingVertical: 13, alignItems: "center", width: "100%" },
  ghostBtn:   { borderWidth: 1, borderColor: "#dddddd", paddingVertical: 10, alignItems: "center", width: "100%" },
  menuBtn:    { backgroundColor: C.card, borderWidth: 1, borderColor: C.border, padding: 14 },
  portalBtn:  { borderWidth: 1, padding: 20, flexDirection: "row", alignItems: "center" },
  saveBar:    { backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.border, paddingHorizontal: 15, paddingVertical: 11, flexDirection: "row", gap: 8 },
  saveBarBtn: { flex: 1, borderWidth: 1, paddingVertical: 11, alignItems: "center" },
  infoBox:    { backgroundColor: "#f5f5f5", borderWidth: 1, borderColor: "#dddddd", padding: 14 },
  quickRemark:{ borderWidth: 1, borderColor: "#eeeeee", padding: 10, backgroundColor: "#fafafa" },
});
