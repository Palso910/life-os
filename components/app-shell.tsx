"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BADGES, badgeIds, levelForXp, streakForHabit, totalXp, xpForDifficulty } from "@/lib/domain/gamification";
import { daysInMonth, dateKey, daysBetween, frenchDate, localToday, parseDateKey, shiftDate, startOfWeek } from "@/lib/domain/dates";
import { parseBackupData } from "@/lib/domain/legacy";
import { useLife } from "@/lib/storage/life-provider";
import type { Accent, ChartScale, Difficulty, Habit, HabitLog, LifeState } from "@/lib/domain/types";

type Page = "aujourdhui" | "habitudes" | "progression" | "donnees" | "reglages";
type TaskPeriod = "matin" | "midi" | "soir";

const TASK_PERIODS: { id: TaskPeriod; label: string; icon: string; hour: number }[] = [
  { id: "matin", label: "Matin", icon: "☀", hour: 8 },
  { id: "midi", label: "Midi", icon: "◐", hour: 13 },
  { id: "soir", label: "Soir", icon: "☾", hour: 19 },
];
const NAV: { id: Page; label: string; icon: string; href: string }[] = [
  { id: "aujourdhui", label: "Aujourd’hui", icon: "⌂", href: "/" },
  { id: "habitudes", label: "Habitudes", icon: "◷", href: "/habitudes" },
  { id: "progression", label: "Progression", icon: "⌁", href: "/progression" },
  { id: "donnees", label: "Mes données", icon: "▤", href: "/donnees" },
  { id: "reglages", label: "Réglages", icon: "⚙", href: "/reglages" },
];
const DAYS_SHORT = ["L", "M", "M", "J", "V", "S", "D"];
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const COLORS: Record<Accent, string> = { bleu: "#8db4ff", violet: "#aa96ff", vert: "#72d9ad", rose: "#ff9fbd" };
const TITLES: Record<Page, { title: string; subtitle: string; eyebrow: string }> = {
  aujourdhui: { title: "Ton espace, aujourd’hui", subtitle: "Chaque petit pas compte. Avance à ton rythme.", eyebrow: "Ton quotidien" },
  habitudes: { title: "Tes habitudes", subtitle: "Construis une régularité qui te ressemble.", eyebrow: "Routines & historique" },
  progression: { title: "Tu avances", subtitle: "Regarde le chemin parcouru, pas seulement la destination.", eyebrow: "Tes progrès" },
  donnees: { title: "Tes données", subtitle: "Elles t’appartiennent. Exporte-les ou importe une sauvegarde à tout moment.", eyebrow: "Confidentialité" },
  reglages: { title: "Ton LifeOS", subtitle: "Adapte ton espace, tes rappels et ta synchronisation.", eyebrow: "Préférences" },
};

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(parseDateKey(value));
}

function taskPeriod(dueAt: string | null): TaskPeriod {
  if (!dueAt) return "matin";
  const hour = new Date(dueAt).getUTCHours();
  return hour < 11 ? "matin" : hour < 17 ? "midi" : "soir";
}

function taskDueAt(day: string, period: TaskPeriod): string {
  const hour = TASK_PERIODS.find((item) => item.id === period)?.hour ?? 8;
  // Keep the day and period in the existing synced timestamp; no schema change is needed.
  return `${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
}

function makeId(): string {
  return crypto.randomUUID();
}

function vapidKeyBytes(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return buffer;
}

function mergeImported(current: LifeState, incoming: LifeState): LifeState {
  const mergeList = <T extends { id: string; updatedAt: string }>(a: T[], b: T[]) => {
    const map = new Map(a.map((item) => [item.id, item]));
    b.forEach((item) => {
      const old = map.get(item.id);
      if (!old || item.updatedAt >= old.updatedAt) map.set(item.id, item);
    });
    return [...map.values()];
  };
  const logs = new Map(current.logs.map((log) => [`${log.habitId}:${log.day}`, log]));
  incoming.logs.forEach((log) => {
    const key = `${log.habitId}:${log.day}`;
    const old = logs.get(key);
    if (!old || log.updatedAt >= old.updatedAt) logs.set(key, log);
  });
  return {
    ...current,
    habits: mergeList(current.habits, incoming.habits),
    logs: [...logs.values()],
    tasks: mergeList(current.tasks, incoming.tasks),
    deadlines: mergeList(current.deadlines, incoming.deadlines),
    notes: mergeList(current.notes, incoming.notes),
    focusSessions: mergeList(current.focusSessions, incoming.focusSessions),
    achievements: [...new Set([...current.achievements, ...incoming.achievements])],
    difficulties: incoming.difficulties || current.difficulties,
    images: { ...current.images, ...incoming.images },
    updatedAt: new Date().toISOString(),
  };
}

function IconImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return <img className={className} src={src} alt={alt} onError={(event) => {
    event.currentTarget.style.display = "none";
  }} />;
}

function LoadingView() {
  return (
    <div className="app-shell">
      <aside className="sidebar"><div className="brand"><div className="brand-mark"><IconImage src="/images/logo.svg" alt="" /></div><div><div className="brand-name">LifeOS</div><div className="brand-caption">ton espace personnel</div></div></div></aside>
      <main className="main-area"><div className="content-wrap">
        <div className="skeleton" style={{ width: 140, height: 12, marginBottom: 15 }} />
        <div className="skeleton" style={{ width: "min(360px, 85%)", height: 36, marginBottom: 26 }} />
        <div className="skeleton" style={{ height: 168, marginBottom: 16 }} />
        <div className="grid grid-half">{[1, 2].map((item) => <div key={item} className="skeleton" style={{ height: 250 }} />)}</div>
      </div></main>
    </div>
  );
}

function Panel({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <section className={`panel card ${className}`} style={style}>{children}</section>;
}

function EmptyState({ image = "/images/empty-habits.svg", title, children }: { image?: string; title: string; children: ReactNode }) {
  return <div className="empty-state"><div><IconImage src={image} alt="" /><strong>{title}</strong><p>{children}</p></div></div>;
}

function ProgressRing({ value }: { value: number }) {
  return (
    <div style={{ position: "relative", display: "grid", width: 76, height: 76, flex: "0 0 auto", placeItems: "center", borderRadius: "50%", background: `conic-gradient(var(--accent) ${value * 3.6}deg, var(--surface-soft) 0deg)` }}>
      <div style={{ display: "grid", width: 62, height: 62, placeItems: "center", borderRadius: "50%", background: "var(--surface)" }}>
        <span style={{ font: "700 15px Manrope, sans-serif" }}>{value}%</span>
      </div>
    </div>
  );
}

function FocusWidget({ onNotice }: { onNotice: (text: string) => void }) {
  const { state, update } = useLife();
  const [now, setNow] = useState(Date.now());
  const [fullscreen, setFullscreen] = useState(false);
  const timer = state.activeTimer;
  const secondsLeft = timer
    ? Math.max(0, timer.durationSeconds - Math.floor((now - new Date(timer.startedAt).getTime()) / 1000))
    : 25 * 60;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const finish = useCallback((completed: boolean) => {
    if (!timer) return;
    const endedAt = new Date().toISOString();
    const elapsed = Math.min(timer.durationSeconds, Math.floor((Date.now() - new Date(timer.startedAt).getTime()) / 1000));
    update((current) => ({
      ...current,
      activeTimer: null,
      focusSessions: timer.mode === "focus" && completed
        ? [{ id: makeId(), startedAt: timer.startedAt, endedAt, durationSeconds: elapsed, updatedAt: endedAt }, ...current.focusSessions]
        : current.focusSessions,
    }));
    setFullscreen(false);
    onNotice(completed ? (timer.mode === "focus" ? "Bravo, session de focus terminée !" : "Pause terminée, tu peux reprendre.") : "Minuteur arrêté.");
  }, [timer, update, onNotice]);

  useEffect(() => {
    if (timer && secondsLeft === 0) finish(true);
  }, [timer, secondsLeft, finish]);

  const begin = (mode: "focus" | "pause") => {
    const durationSeconds = mode === "focus" ? 25 * 60 : 5 * 60;
    update((current) => ({
      ...current,
      activeTimer: { startedAt: new Date().toISOString(), durationSeconds, mode },
    }));
    setFullscreen(true);
  };
  const clock = `${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <>
      {fullscreen && <div className="celebration" style={{ zIndex: 80 }}>
        <div className="celebration-card">
          <div className="eyebrow">Mode concentration</div>
          <div className="focus-clock">{clock}</div>
          <p>{timer?.mode === "pause" ? "Prends une vraie pause." : "Une chose à la fois. Tu es exactement là où il faut."}</p>
          <div className="focus-controls"><button className="button button-quiet" onClick={() => setFullscreen(false)}>Réduire</button><button className="button button-danger" onClick={() => finish(false)}>Arrêter</button></div>
        </div>
      </div>}
      <Panel>
        <div className="card-head"><div><h2 className="card-title">Focus</h2><p className="card-subtitle">{timer ? timer.mode === "focus" ? "Session en cours" : "Pause en cours" : "Un moment pour toi"}</p></div><span className="tag">25 · 5</span></div>
        <div className="focus-clock">{clock}</div>
        <p className="tiny" style={{ textAlign: "center" }}>{state.focusSessions.filter((session) => session.startedAt.slice(0, 10) === localToday()).length} sessions aujourd’hui</p>
        <div className="focus-controls">
          {!timer ? <><button className="button button-primary" onClick={() => begin("focus")}>Démarrer</button><button className="button" onClick={() => begin("pause")}>Pause</button></> :
            <><button className="button button-primary" onClick={() => setFullscreen(true)}>Plein écran</button><button className="button button-danger" onClick={() => finish(false)}>Arrêter</button></>}
        </div>
      </Panel>
    </>
  );
}

export function AppShell({ page }: { page: Page }) {
  const router = useRouter();
  const {
    state, hydrated, user, syncEnabled, syncBusy, syncError, update, toggleHabit,
    addHabit, signIn, signOut, syncNow, replaceState, clearLocalData,
  } = useLife();
  const [toast, setToast] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [celebration, setCelebration] = useState<{ icon: string; title: string; detail: string } | null>(null);
  const [selectedDay, setSelectedDay] = useState(localToday());
  const [taskDay, setTaskDay] = useState(localToday());
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [habitView, setHabitView] = useState<"semaine" | "mois" | "annee">("semaine");
  const [newHabit, setNewHabit] = useState("");
  const [newEmoji, setNewEmoji] = useState("✨");
  const [newTarget, setNewTarget] = useState(7);
  const [newDifficulty, setNewDifficulty] = useState<Difficulty>("normale");
  const [newReminder, setNewReminder] = useState("");
  const [newTasks, setNewTasks] = useState<Record<TaskPeriod, string>>({ matin: "", midi: "", soir: "" });
  const [newDeadline, setNewDeadline] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [reflectionDraft, setReflectionDraft] = useState("");
  const [draggedWidget, setDraggedWidget] = useState<string | null>(null);
  const [chartScale, setChartScale] = useState<ChartScale>("30j");
  const title = TITLES[page];

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.mode = state.settings.mode;
    document.documentElement.dataset.accent = state.settings.accent;
    document.documentElement.classList.toggle("fx-off", !state.settings.fx);
    const wallpaper = state.images.fond ? `url("${state.images.fond}")` : 'url("/images/fond.svg")';
    document.documentElement.style.setProperty("--lifeos-wallpaper", wallpaper);
  }, [state.settings.mode, state.settings.accent, state.settings.fx, state.images.fond]);

  useEffect(() => {
    if (!celebration || !state.settings.sound || !("AudioContext" in window)) return;
    const audio = new AudioContext();
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, audio.currentTime + 0.13);
    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, audio.currentTime + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.3);
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.start();
    oscillator.stop(audio.currentTime + 0.31);
    oscillator.onended = () => void audio.close();
  }, [celebration, state.settings.sound]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth") === "configuration") notify("La configuration Supabase est absente; tu peux continuer en mode local.");
    if (params.get("auth") === "error") notify("Le lien de connexion a expiré ou n’est plus valide.");
  }, [notify]);

  useEffect(() => {
    if (page !== "habitudes") return;
    const date = new URLSearchParams(window.location.search).get("date");
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > localToday()) return;
    setSelectedDay(date);
    setHabitView("mois");
    const selected = parseDateKey(date);
    const today = new Date();
    setMonthOffset((selected.getFullYear() - today.getFullYear()) * 12 + selected.getMonth() - today.getMonth());
  }, [page]);

  const activeHabits = useMemo(() => state.habits.filter((habit) => !habit.archivedAt), [state.habits]);
  const todayLogs = useMemo(() => new Map<string, HabitLog>(
    state.logs.filter((log) => log.day === localToday()).map((log): [string, HabitLog] => [log.habitId, log]),
  ), [state.logs]);
  const completedToday = activeHabits.filter((habit) => todayLogs.get(habit.id)?.completed).length;
  const completionPct = activeHabits.length ? Math.round((completedToday / activeHabits.length) * 100) : 0;
  const xp = totalXp(state.logs);
  const level = levelForXp(xp);
  const bestStreak = Math.max(0, ...activeHabits.map((habit) => streakForHabit(habit.id, state.logs)));
  const openTasks = state.tasks.filter((task) => !task.deletedAt);
  const tasksForDay = openTasks.filter((task) => (task.dueAt?.slice(0, 10) ?? localToday()) === taskDay);
  const deadlines = state.deadlines.filter((item) => !item.deletedAt).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const currentMonth = new Date();
  currentMonth.setDate(1);
  currentMonth.setMonth(currentMonth.getMonth() + monthOffset);
  const monthName = `${MONTHS[currentMonth.getMonth()]} ${currentMonth.getFullYear()}`;

  function registerToggle(habit: Habit, day: string) {
    if (day > localToday()) return;
    const oldLog = state.logs.find((log) => log.habitId === habit.id && log.day === day);
    const wasCompleted = Boolean(oldLog?.completed);
    const nextLogs = [...state.logs.filter((log) => log.habitId !== habit.id || log.day !== day), {
      habitId: habit.id, day, completed: !wasCompleted,
      xpAwarded: wasCompleted ? 0 : xpForDifficulty(habit.difficulty), timeKnown: true, updatedAt: new Date().toISOString(),
    }];
    toggleHabit(habit, day);
    if (!wasCompleted) {
      if (navigator.vibrate) navigator.vibrate(12);
      const nextXp = totalXp(state.logs) + xpForDifficulty(habit.difficulty);
      const nextLevel = levelForXp(nextXp);
      const earned = badgeIds(nextLogs, state.habits);
      const newlyEarned = earned.find((id) => !state.achievements.includes(id));
      const wasPerfectDay = activeHabits.every((item) =>
        item.id === habit.id || Boolean(state.logs.find((log) => log.habitId === item.id && log.day === day)?.completed),
      );
      if (newlyEarned) {
        const badge = BADGES.find((item) => item.id === newlyEarned);
        setCelebration({ icon: badge?.icon ?? "🏆", title: badge?.title ?? "Nouveau badge !", detail: badge?.description ?? "Tu viens de débloquer un nouveau badge." });
      } else if (nextLevel.level > level.level) {
        setCelebration({ icon: "✨", title: `Niveau ${nextLevel.level} !`, detail: "Chaque petit pas construit quelque chose de grand." });
      } else if (wasPerfectDay && activeHabits.length > 0) {
        setCelebration({ icon: "🌟", title: "Journée parfaite !", detail: "Toutes tes habitudes sont cochées. Prends le temps de savourer." });
      }
    }
  }

  function setSetting<K extends keyof LifeState["settings"]>(key: K, value: LifeState["settings"][K]) {
    update((current) => ({ ...current, settings: { ...current.settings, [key]: value } }));
  }

  function handleAddHabit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newHabit.trim();
    if (!name) return;
    addHabit({
      name, emoji: newEmoji.trim() || "✨", target: newTarget, difficulty: newDifficulty,
      schedule: [0, 1, 2, 3, 4, 5, 6], reminderTime: newReminder,
    });
    setNewHabit("");
    setNewReminder("");
    notify("Habitude ajoutée à tes routines.");
  }

  function handleAddTask(event: FormEvent<HTMLFormElement>, period: TaskPeriod) {
    event.preventDefault();
    const title = newTasks[period].trim();
    if (!title) return;
    const now = new Date().toISOString();
    update((current) => ({
      ...current,
      tasks: [{ id: makeId(), title, done: false, dueAt: taskDueAt(taskDay, period), deletedAt: null, updatedAt: now }, ...current.tasks],
    }));
    setNewTasks((current) => ({ ...current, [period]: "" }));
    notify("Tâche ajoutée.");
  }

  function toggleTask(id: string) {
    const now = new Date().toISOString();
    update((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id ? { ...task, done: !task.done, updatedAt: now } : task),
    }));
  }

  function deleteTask(id: string) {
    const now = new Date().toISOString();
    update((current) => ({
      ...current,
      tasks: current.tasks.map((task) => task.id === id ? { ...task, deletedAt: now, updatedAt: now } : task),
    }));
  }

  function archiveHabit(habit: Habit) {
    if (!window.confirm(`Archiver « ${habit.name} » ? Son historique restera intact.`)) return;
    const now = new Date().toISOString();
    update((current) => ({
      ...current,
      habits: current.habits.map((item) => item.id === habit.id ? { ...item, archivedAt: now, updatedAt: now } : item),
    }));
    notify("Habitude archivée, historique conservé.");
  }

  function handleAddDeadline(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const title = newDeadline.trim();
    if (!title) return;
    const now = new Date().toISOString();
    update((current) => ({
      ...current,
      deadlines: [{ id: makeId(), title, dueAt: `${selectedDay}T12:00:00`, deletedAt: null, updatedAt: now }, ...current.deadlines],
    }));
    setNewDeadline("");
    notify("Échéance ajoutée.");
  }

  function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = noteDraft.trim();
    if (!body) return;
    const now = new Date().toISOString();
    update((current) => ({
      ...current,
      notes: [{ id: makeId(), body, createdAt: now, deletedAt: null, updatedAt: now }, ...current.notes],
    }));
    setNoteDraft("");
    notify("Note enregistrée.");
  }

  function exportJson() {
    const payload = {
      app: "LifeOS",
      version: 2,
      exportedAt: new Date().toISOString(),
      data: state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `LifeOS-sauvegarde-${localToday()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify("Sauvegarde JSON téléchargée.");
  }

  async function importJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const raw: unknown = JSON.parse(await file.text());
      const incoming = parseBackupData(raw);
      if (!window.confirm("Les données du fichier seront fusionnées à ton espace actuel (aucune suppression). Continuer ?")) return;
      const merged = mergeImported(state, incoming);
      replaceState(merged);
      notify(`Import réussi : ${incoming.habits.length} habitudes et ${incoming.logs.length} jours enregistrés fusionnés.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Ce fichier JSON ne peut pas être importé.");
    } finally {
      event.target.value = "";
    }
  }

  function sendWeeklyReport() {
    const start = shiftDate(localToday(), -6);
    const lines = activeHabits.map((habit) => {
      const done = state.logs.filter((log) => log.habitId === habit.id && log.completed && log.day >= start && log.day <= localToday()).length;
      return `${habit.emoji} ${habit.name} : ${done}/${habit.target} cette semaine`;
    });
    const body = [
      "Bonjour Maman,",
      "",
      "Voici mon petit bilan LifeOS de la semaine :",
      ...lines,
      "",
      `Série actuelle : ${bestStreak} jour${bestStreak > 1 ? "s" : ""}`,
      `XP total : ${xp}`,
      "",
      "À bientôt !",
    ].join("\n");
    const subject = encodeURIComponent("Mon rapport LifeOS de la semaine");
    const recipient = encodeURIComponent(state.settings.emailReportTo);
    window.location.href = `mailto:${recipient}?subject=${subject}&body=${encodeURIComponent(body)}`;
  }

  function sendDailyReport() {
    const checked = activeHabits.filter((habit) =>
      state.logs.some((log) => log.habitId === habit.id && log.day === localToday() && log.completed),
    );
    const unchecked = activeHabits.filter((habit) => !checked.some((item) => item.id === habit.id));
    const body = [
      "Bonjour Maman,",
      "",
      `Voici mon petit bilan LifeOS du ${frenchDate(localToday())} :`,
      "",
      `Habitudes réalisées : ${checked.length}/${activeHabits.length}`,
      ...checked.map((habit) => `✓ ${habit.emoji} ${habit.name}`),
      ...unchecked.map((habit) => `· ${habit.emoji} ${habit.name}`),
      "",
      `${xp} XP accumulés · série actuelle ${bestStreak} jour${bestStreak > 1 ? "s" : ""}.`,
      "",
      "À bientôt !",
    ].join("\n");
    const subject = encodeURIComponent("Mon rapport LifeOS du jour");
    window.location.href = `mailto:${encodeURIComponent(state.settings.emailReportTo)}?subject=${subject}&body=${encodeURIComponent(body)}`;
  }

  function reorderWidget(target: string) {
    if (!draggedWidget || draggedWidget === target) return;
    const order = [...state.settings.widgetOrder];
    const from = order.indexOf(draggedWidget);
    const to = order.indexOf(target);
    if (from < 0 || to < 0) return;
    order.splice(from, 1);
    order.splice(to, 0, draggedWidget);
    setSetting("widgetOrder", order);
    setDraggedWidget(null);
  }

  function moveWidget(id: string, direction: -1 | 1) {
    const order = [...state.settings.widgetOrder];
    const index = order.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    setSetting("widgetOrder", order);
  }

  function changeImage(slot: string, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 3_000_000) {
      notify("Choisis une image de moins de 3 Mo.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      update((current) => ({ ...current, images: { ...current.images, [slot]: reader.result as string } }));
      notify("Image personnalisée enregistrée sur cet appareil.");
    };
    reader.onerror = () => notify("Impossible de lire ce fichier image.");
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  async function enablePushReminders() {
    if (!user) {
      setAuthOpen(true);
      notify("Connecte-toi pour activer les rappels même quand LifeOS est fermé.");
      return;
    }
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      notify("Ajoute NEXT_PUBLIC_VAPID_PUBLIC_KEY et les clés VAPID côté serveur pour activer le push.");
      return;
    }
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      notify("Les notifications push ne sont pas prises en charge sur cet appareil.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      notify("Autorise les notifications dans les réglages de ton navigateur.");
      return;
    }
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription()
        ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(publicKey) });
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: subscription.toJSON(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body ? String(body.error) : "Impossible d’activer les notifications.";
        throw new Error(message);
      }
      notify("Rappels push activés sur cet appareil.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Impossible d’activer les notifications push.");
    }
  }

  async function disablePushReminders() {
    try {
      const response = await fetch("/api/push", { method: "DELETE" });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body ? String(body.error) : "Désactivation impossible.";
        throw new Error(message);
      }
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      notify("Rappels push désactivés.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Désactivation impossible.");
    }
  }

  const header = (
    <header className="page-heading">
      <div><div className="eyebrow">{title.eyebrow}</div><h1>{title.title}</h1><p>{title.subtitle}</p></div>
      <div className="date-pill"><span>◷</span>{frenchDate(localToday())}</div>
    </header>
  );

  const onboarding = !state.settings.onboardingComplete ? (
    <Onboarding
      onFinish={() => {
        setSetting("onboardingComplete", true);
        notify("Ton espace est prêt. Bienvenue !");
      }}
    />
  ) : null;

  if (!hydrated) return <LoadingView />;

  return (
    <>
      <FxLayers active={state.settings.fx} />
      <div className={`app-shell ${!state.settings.fx ? "fx-off" : ""}`}>
        <aside className="sidebar">
          <Link className="brand" href="/" aria-label="LifeOS, accueil">
            <span className="brand-mark"><IconImage src={state.images.logo ?? "/images/logo.svg"} alt="LifeOS" /></span>
            <span><span className="brand-name">LifeOS</span><span className="brand-caption" style={{ display: "block" }}>ton espace personnel</span></span>
          </Link>
          <div className="nav-caption">Espace de vie</div>
          <nav className="nav-list" aria-label="Navigation principale">
            {NAV.map((item) => (
              <Link key={item.id} className={`nav-link ${page === item.id ? "active" : ""}`} href={item.href}>
                <span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}
              </Link>
            ))}
          </nav>
          <div className="side-spacer" />
          <div className="sync-card">
            <div className="sync-title"><span className="sync-dot" style={{ background: syncError ? "var(--warning)" : syncBusy ? "var(--accent)" : undefined }} />
              {syncError ? "Sync à vérifier" : syncBusy ? "Synchronisation…" : user ? "Compte synchronisé" : "Données sur cet appareil"}
            </div>
            <div className="sync-copy">{syncError ?? (user ? user.email : syncEnabled ? "Connecte-toi pour retrouver ton espace sur tous tes appareils." : "Le mode invité fonctionne sans connexion.")}</div>
            {!user && syncEnabled && <button className="button" style={{ width: "100%", marginTop: 10 }} onClick={() => setAuthOpen(true)}>Activer la synchronisation</button>}
            {user && <button className="button button-quiet" style={{ width: "100%", marginTop: 6 }} onClick={() => void syncNow().then(() => notify("Tout est à jour.")).catch((error: unknown) => notify(error instanceof Error ? error.message : "Synchronisation impossible."))}>Synchroniser maintenant</button>}
          </div>
          <Link href="/reglages" className="profile-link"><span className="avatar"><IconImage src="/images/avatar-default.svg" alt="" /></span><span>{user?.email ?? "Mode invité"}<span className="brand-caption" style={{ display: "block" }}>{user ? "Compte connecté" : "Compte local"}</span></span></Link>
        </aside>
        <main className="main-area">
          <div className="mobile-top">
            <Link className="brand" href="/"><span className="brand-mark"><IconImage src={state.images.logo ?? "/images/logo.svg"} alt="LifeOS" /></span><span><span className="brand-name">LifeOS</span></span></Link>
            <button className="icon-button" aria-label="Ouvrir les réglages" onClick={() => router.push("/reglages")}>⚙</button>
          </div>
          <div className="content-wrap">
            {header}
            {page === "aujourdhui" && renderDashboard()}
            {page === "habitudes" && renderHabits()}
            {page === "progression" && renderProgression()}
            {page === "donnees" && renderDataPage()}
            {page === "reglages" && renderSettings()}
          </div>
        </main>
      </div>
      {onboarding}
      {authOpen && <Modal onClose={() => setAuthOpen(false)}>
        <h2>Retrouve tes données partout</h2>
        <p>Un lien magique sera envoyé par courriel. LifeOS ne te demandera jamais de mot de passe.</p>
        {authMessage && <div className="tag" style={{ marginBottom: 12, color: "var(--accent)" }}>{authMessage}</div>}
        <form onSubmit={async (event) => {
          event.preventDefault();
          try {
            await signIn(authEmail.trim());
            setAuthMessage("Lien envoyé. Consulte ta boîte de réception et reviens ici.");
          } catch (error) {
            setAuthMessage(error instanceof Error ? error.message : "Échec de l’envoi.");
          }
        }}>
          <label className="tiny" htmlFor="auth-email">Adresse courriel</label>
          <input id="auth-email" className="input" type="email" required autoComplete="email" placeholder="toi@exemple.fr" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} style={{ width: "100%", marginTop: 6 }} />
          <div className="modal-actions"><button type="button" className="button button-quiet" onClick={() => setAuthOpen(false)}>Plus tard</button><button className="button button-primary" type="submit">M’envoyer un lien</button></div>
        </form>
      </Modal>}
      {celebration && <div className="celebration" role="dialog" aria-modal="true" aria-label={celebration.title}>
        <Confetti active={state.settings.fx} />
        <div className="celebration-card"><div className="celebration-emblem">{celebration.icon}</div><div className="eyebrow">Une nouvelle étape</div><h2>{celebration.title}</h2><p>{celebration.detail}</p><button className="button button-primary" onClick={() => setCelebration(null)}>Continuer</button></div>
      </div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );

  function renderDashboard() {
    const widgets: Record<string, ReactNode> = {
      habitudes: <Panel className="widget" key="habitudes">
        <div className="card-head"><div><h2 className="card-title">Tes habitudes</h2><p className="card-subtitle">Un geste simple, répété avec intention.</p></div><ProgressRing value={completionPct} /></div>
        {activeHabits.length ? <div className="habit-list">{activeHabits.map((habit) => {
          const checked = Boolean(todayLogs.get(habit.id)?.completed);
          const streak = streakForHabit(habit.id, state.logs);
          return <div className={`habit-row ${checked ? "checked" : ""}`} key={habit.id}>
            <span className="habit-emoji">{habit.emoji}</span><div className="habit-info"><div className="habit-name">{habit.name}</div>
              <div className="habit-meta"><span>{habit.target}× / sem.</span><span>·</span><span className="streak">{streak >= 100 ? "👑 Légendaire" : streak >= 7 ? "🔥" : streak > 0 ? "🌱" : "—"} {streak} j</span></div>
            </div><button className={`check-button ${checked ? "checked" : ""}`} aria-label={`${checked ? "Décocher" : "Cocher"} ${habit.name}`} aria-pressed={checked} onClick={() => registerToggle(habit, localToday())}>{checked ? "✓" : ""}</button>
          </div>;
        })}</div> : <EmptyState title="Une première petite habitude ?">Choisis quelque chose de simple et réaliste. Le reste viendra.</EmptyState>}
        <form className="form-row" onSubmit={handleAddHabit} style={{ marginTop: 14 }}>
          <input aria-label="Icône d’habitude" className="input" value={newEmoji} maxLength={3} onChange={(event) => setNewEmoji(event.target.value)} style={{ width: 57, flex: "0 0 57px", textAlign: "center" }} />
          <input className="input" placeholder="Ajouter une habitude…" aria-label="Nom de l’habitude" value={newHabit} onChange={(event) => setNewHabit(event.target.value)} />
          <button className="button button-primary" type="submit" aria-label="Ajouter une habitude">＋ Ajouter</button>
        </form>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}><Link href="/habitudes" className="tiny">Voir tout l’historique →</Link></div>
      </Panel>,
      taches: <Panel className="widget" key="taches">
        <div className="card-head task-day-head">
          <div><h2 className="card-title">Ma journée</h2><p className="card-subtitle">{tasksForDay.filter((task) => task.done).length}/{tasksForDay.length} tâches terminées</p></div>
          <label className="task-date-control"><span className="sr-only">Choisir le jour des tâches</span><input className="input" type="date" value={taskDay} onChange={(event) => {
            if (/^\d{4}-\d{2}-\d{2}$/.test(event.target.value)) setTaskDay(event.target.value);
          }} /></label>
        </div>
        <div className="task-period-list">{TASK_PERIODS.map((period) => {
          const periodTasks = tasksForDay.filter((task) => taskPeriod(task.dueAt) === period.id);
          return <section className="task-period" key={period.id} aria-label={`Tâches du ${period.label.toLowerCase()}`}>
            <div className="task-period-heading"><span className="task-period-icon" aria-hidden="true">{period.icon}</span><h3>{period.label}</h3><span className="task-period-count">{periodTasks.filter((task) => task.done).length}/{periodTasks.length}</span></div>
            {periodTasks.length ? <div>{periodTasks.map((task) => <div className="task-item" key={task.id}>
              <button className={`task-toggle ${task.done ? "done" : ""}`} aria-label={`${task.done ? "Réouvrir" : "Terminer"} ${task.title}`} aria-pressed={task.done} onClick={() => toggleTask(task.id)}>{task.done ? "✓" : ""}</button>
              <span className={`task-copy ${task.done ? "done" : ""}`}>{task.title}</span><button className="task-delete" aria-label={`Supprimer ${task.title}`} onClick={() => deleteTask(task.id)}>×</button>
            </div>)}</div> : <p className="task-period-empty">Rien de prévu pour le moment.</p>}
            <form className="form-row task-period-form" onSubmit={(event) => handleAddTask(event, period.id)}>
              <input className="input" placeholder={`Ajouter une tâche…`} value={newTasks[period.id]} onChange={(event) => setNewTasks((current) => ({ ...current, [period.id]: event.target.value }))} aria-label={`Nouvelle tâche pour le ${period.label.toLowerCase()}`} />
              <button className="icon-button" type="submit" aria-label={`Ajouter au bloc ${period.label.toLowerCase()}`}>＋</button>
            </form>
          </section>;
        })}</div>
      </Panel>,
      focus: <div className="widget" key="focus"><FocusWidget onNotice={notify} /></div>,
      calendrier: <Panel className="widget" key="calendrier">
        <div className="card-head"><div><h2 className="card-title">Calendrier</h2><p className="card-subtitle">{monthName}</p></div><div style={{ display: "flex", gap: 5 }}><button className="icon-button" aria-label="Mois précédent" onClick={() => setMonthOffset((value) => value - 1)}>‹</button><button className="icon-button" aria-label="Mois suivant" onClick={() => setMonthOffset((value) => value + 1)}>›</button></div></div>
        {renderCalendar(true)}
      </Panel>,
      notes: <Panel className="widget" key="notes">
        <div className="card-head"><div><h2 className="card-title">Notes rapides</h2><p className="card-subtitle">Garde une trace de ce qui compte.</p></div><span>✎</span></div>
        <form onSubmit={saveNote}><textarea className="textarea" aria-label="Nouvelle note" placeholder="Une idée, un souvenir, un objectif…" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} style={{ minHeight: 75 }} /><button className="button button-primary" type="submit" style={{ marginTop: 8 }}>Enregistrer une note</button></form>
        <div style={{ marginTop: 9 }}>{state.notes.filter((note) => !note.deletedAt).slice(0, 3).map((note) => <div className="task-item" key={note.id}><span className="task-copy">{note.body}</span><button className="task-delete" aria-label="Supprimer cette note" onClick={() => {
          const now = new Date().toISOString();
          update((current) => ({ ...current, notes: current.notes.map((item) => item.id === note.id ? { ...item, deletedAt: now, updatedAt: now } : item) }));
        }}>×</button></div>)}</div>
      </Panel>,
      echeances: <Panel className="widget" key="echeances">
        <div className="card-head"><div><h2 className="card-title">À l’horizon</h2><p className="card-subtitle">Tes prochaines échéances</p></div><span>⌛</span></div>
        {deadlines.slice(0, 3).map((deadline) => {
          const day = deadline.dueAt.slice(0, 10);
          const left = daysBetween(localToday(), day);
          return <div className="deadline-item" key={deadline.id}><div className="deadline-date"><strong>{parseDateKey(day).getDate()}</strong><span>{MONTHS[parseDateKey(day).getMonth()].slice(0, 3)}</span></div><div className="task-copy"><strong>{deadline.title}</strong><div className="tiny">{left < 0 ? `En retard de ${Math.abs(left)} j` : left === 0 ? "Aujourd’hui" : `Dans ${left} jour${left > 1 ? "s" : ""}`}</div></div></div>;
        })}
        <form className="form-row" onSubmit={handleAddDeadline} style={{ marginTop: 9 }}>
          <input className="input" placeholder="Nouvelle échéance…" aria-label="Nouvelle échéance" value={newDeadline} onChange={(event) => setNewDeadline(event.target.value)} />
          <input className="input" type="date" aria-label="Date de l’échéance" value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} style={{ flex: "0 0 126px", minWidth: 126 }} />
          <button className="icon-button" type="submit" aria-label="Ajouter une échéance">＋</button>
        </form>
      </Panel>,
    };
    const order = state.settings.widgetOrder.filter((id) => widgets[id]);
    Object.keys(widgets).forEach((id) => { if (!order.includes(id)) order.push(id); });
    return <>
      <section className="hero-banner">
        <IconImage className="hero-image-slot" src={state.images.banniere ?? "/images/banniere-dashboard.svg"} alt="" />
        <div className="hero-copy"><div className="eyebrow">Bonjour, belle journée à toi</div><h2>Un pas après l’autre.<br />Tu es déjà en chemin.</h2><p>{activeHabits.length ? `${completedToday} habitude${completedToday > 1 ? "s" : ""} validée${completedToday > 1 ? "s" : ""} aujourd’hui` : "Commence par une petite habitude qui compte."}</p></div>
      </section>
      <div className="kpi-grid">
        <div className="panel kpi"><div className="kpi-label">Niveau actuel</div><div className="kpi-value">{level.level}</div><div className="kpi-detail">{xp} XP accumulés</div></div>
        <div className="panel kpi"><div className="kpi-label">Série la plus longue</div><div className="kpi-value">{bestStreak} j</div><div className="kpi-detail">{bestStreak >= 100 ? "👑 Série légendaire" : bestStreak >= 7 ? "🔥 Ça brûle !" : "Chaque jour compte"}</div></div>
        <div className="panel kpi"><div className="kpi-label">Aujourd’hui</div><div className="kpi-value">{completedToday}/{activeHabits.length}</div><div className="kpi-detail">habitudes réalisées</div></div>
        <div className="panel kpi"><div className="kpi-label">Badges</div><div className="kpi-value">{state.achievements.length}</div><div className="kpi-detail">sur {BADGES.length} à débloquer</div></div>
      </div>
      <div className="xp-line"><span>Niveau {level.level} · progression XP</span><span>{level.current} / {level.next} XP</span></div>
      <div className="progress-track" style={{ marginBottom: 18 }}><div className="progress-fill" style={{ width: `${Math.min(100, level.next ? level.current / level.next * 100 : 0)}%` }} /></div>
      <div className="grid grid-main">
        <div className="stack">{order.filter((id) => ["habitudes", "taches", "focus"].includes(id)).map((id) => <div className="widget-holder" key={id} draggable onDragStart={() => setDraggedWidget(id)} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={() => reorderWidget(id)}><div className="widget-reorder no-print"><button className="icon-button" aria-label="Déplacer plus haut" onClick={() => moveWidget(id, -1)}>↑</button><button className="icon-button" aria-label="Déplacer plus bas" onClick={() => moveWidget(id, 1)}>↓</button></div>{widgets[id]}</div>)}</div>
        <div className="stack">{order.filter((id) => ["calendrier", "echeances", "notes"].includes(id)).map((id) => <div className="widget-holder" key={id} draggable onDragStart={() => setDraggedWidget(id)} onDragOver={(event: DragEvent) => event.preventDefault()} onDrop={() => reorderWidget(id)}><div className="widget-reorder no-print"><button className="icon-button" aria-label="Déplacer plus haut" onClick={() => moveWidget(id, -1)}>↑</button><button className="icon-button" aria-label="Déplacer plus bas" onClick={() => moveWidget(id, 1)}>↓</button></div>{widgets[id]}</div>)}
          <Panel><div className="card-head"><div><h2 className="card-title">Ton bilan</h2><p className="card-subtitle">Une vue d’ensemble pour cette semaine.</p></div><span>✦</span></div>
            <div className="xp-line"><span>Régularité</span><strong>{completionPct}%</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${completionPct}%` }} /></div>
            <div className="divider" /><button className="button" style={{ width: "100%" }} onClick={sendWeeklyReport}>Préparer mon rapport hebdo ↗</button>
          </Panel>
        </div>
      </div>
      <div className="tiny" style={{ marginTop: 12 }}>Astuce : tu peux déplacer les cartes par glisser-déposer.</div>
    </>;
  }

  function renderCalendar(compact = false) {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const count = daysInMonth(year, month);
    const first = (new Date(year, month, 1).getDay() + 6) % 7;
    const cells = Array.from({ length: Math.ceil((first + count) / 7) * 7 }, (_, index) => {
      const dayNumber = index - first + 1;
      if (dayNumber < 1 || dayNumber > count) return <span key={`empty-${index}`} />;
      const day = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;
      const didComplete = state.logs.some((log) => log.day === day && log.completed);
      const isFuture = day > localToday();
      return <button key={day} className={`calendar-day ${day === localToday() ? "today" : ""} ${day === selectedDay ? "selected" : ""} ${didComplete ? "has-logs" : ""}`} disabled={isFuture} aria-label={`${frenchDate(day)}${didComplete ? ", activité enregistrée" : ""}`} onClick={() => { setSelectedDay(day); if (compact) router.push(`/habitudes?date=${day}`); else setHabitView("mois"); }}>
        {dayNumber}
      </button>;
    });
    return <><div className="calendar-head">{DAYS_SHORT.map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div><div className="calendar-grid">{cells}</div></>;
  }

  function renderHabits() {
    const datedMonth = new Date();
    datedMonth.setDate(1);
    datedMonth.setMonth(datedMonth.getMonth() + monthOffset);
    const year = datedMonth.getFullYear();
    const month = datedMonth.getMonth();
    const dayCells = habitView === "semaine"
      ? Array.from({ length: 7 }, (_, index) => shiftDate(startOfWeek(localToday()), index))
      : Array.from({ length: daysInMonth(year, month) }, (_, index) => `${year}-${String(month + 1).padStart(2, "0")}-${String(index + 1).padStart(2, "0")}`);
    const yearDayCount = new Date(selectedYear, 1, 29).getMonth() === 1 ? 366 : 365;
    const yearDays = Array.from({ length: yearDayCount }, (_, index) => {
      const date = new Date(selectedYear, 0, index + 1, 12);
      return dateKey(date);
    });
    const heatStart = (parseDateKey(yearDays[0]).getDay() + 6) % 7;
    const heatDays = [...Array.from({ length: heatStart }, () => ""), ...yearDays];
    const columns = Array.from({ length: Math.ceil(heatDays.length / 7) }, (_, col) => heatDays.slice(col * 7, col * 7 + 7));
    const logCounts = new Map<string, number>();
    state.logs.filter((log) => log.completed).forEach((log) => logCounts.set(log.day, (logCounts.get(log.day) ?? 0) + 1));
    const total = Math.max(1, activeHabits.length);
    return <>
      <div className="grid kpi-grid">
        <div className="panel kpi"><div className="kpi-label">Routines actives</div><div className="kpi-value">{activeHabits.length}</div><div className="kpi-detail">à ton rythme</div></div>
        <div className="panel kpi"><div className="kpi-label">Aujourd’hui</div><div className="kpi-value">{completedToday}/{activeHabits.length}</div><div className="kpi-detail">habitudes cochées</div></div>
        <div className="panel kpi"><div className="kpi-label">Série actuelle</div><div className="kpi-value">{bestStreak} jours</div><div className="kpi-detail">{bestStreak >= 7 ? "🔥 en feu" : "elle se construit"}</div></div>
        <div className="panel kpi"><div className="kpi-label">Historique</div><div className="kpi-value">{new Set(state.logs.filter((log) => log.completed).map((log) => log.day)).size}</div><div className="kpi-detail">jours enregistrés</div></div>
      </div>
      <Panel>
        <div className="card-head"><div><h2 className="card-title">Ton historique</h2><p className="card-subtitle">Chaque case correspond à une vraie date, sans conversion en millisecondes.</p></div>
          <div className="segmented">{(["semaine", "mois", "annee"] as const).map((view) => <button key={view} className={habitView === view ? "active" : ""} onClick={() => setHabitView(view)}>{view === "semaine" ? "7 jours" : view === "mois" ? "Mois" : "Année"}</button>)}</div>
        </div>
        {habitView === "annee" ? <>
          <div className="card-head"><span className="tag">{selectedYear} · {yearDays.length} jours</span><div style={{ display: "flex", gap: 5 }}><button className="icon-button" onClick={() => setSelectedYear((value) => value - 1)} aria-label="Année précédente">‹</button><button className="icon-button" onClick={() => setSelectedYear((value) => value + 1)} aria-label="Année suivante" disabled={selectedYear >= new Date().getFullYear()}>›</button></div></div>
          <div className="heatmap-scroll"><div className="heatmap">{columns.map((column, columnIndex) => <div className="heat-column" key={`col-${columnIndex}`}>{column.map((day, rowIndex) => {
            if (!day) return <span key={`pad-${columnIndex}-${rowIndex}`} />;
            const count = logCounts.get(day) ?? 0;
            const level = count === 0 ? 0 : count >= total ? 3 : count >= Math.ceil(total / 2) ? 2 : 1;
            const future = day > localToday();
            return <button key={day} className={`heat-cell level-${level} ${future ? "future" : ""}`} title={`${frenchDate(day)} · ${count} habitude${count === 1 ? "" : "s"}`} disabled={future} onClick={() => { setSelectedDay(day); setHabitView("mois"); }} />;
          })}</div>)}</div></div>
          <div className="heat-labels"><span>Jan</span><span>Mar</span><span>Mai</span><span>Jul</span><span>Sep</span><span>Nov</span><span>Déc</span></div>
          <div className="legend"><span><i className="legend-dot" style={{ background: "var(--surface-soft)" }} />Aucune</span><span><i className="legend-dot" style={{ opacity: .35 }} />Quelques</span><span><i className="legend-dot" />Toutes</span><span className="tiny">Sélectionne un jour pour ouvrir son détail.</span></div>
        </> : <>
          <div className="card-head"><div className="tag">{habitView === "semaine" ? `Semaine du ${shortDate(dayCells[0])}` : monthName}</div>{habitView === "mois" && <div style={{ display: "flex", gap: 5 }}><button className="icon-button" onClick={() => setMonthOffset((value) => value - 1)} aria-label="Mois précédent">‹</button><button className="icon-button" onClick={() => setMonthOffset((value) => value + 1)} aria-label="Mois suivant">›</button></div>}</div>
          {!activeHabits.length ? <EmptyState title="Ton historique commence ici">Ajoute ta première habitude et coche-la au fil des jours.</EmptyState> :
            <div className="table-scroll"><div className="habit-table">
              <div className={`table-row ${habitView === "mois" ? "month" : ""}`}><span className="table-name" />{dayCells.map((day, index) => <span className="table-head" key={day}>{habitView === "semaine" ? DAYS_SHORT[index] : String(index + 1)}</span>)}</div>
              {activeHabits.map((habit) => <div className={`table-row ${habitView === "mois" ? "month" : ""}`} key={habit.id}>
                <div className="table-name" title={habit.name}>{habit.emoji} {habit.name}</div>
                {dayCells.map((day) => {
                  const done = state.logs.some((log) => log.habitId === habit.id && log.day === day && log.completed);
                  return <button key={day} className={`table-cell ${done ? "done" : ""} ${day === selectedDay ? "selected" : ""} ${day > localToday() ? "future" : ""}`} disabled={day > localToday()} title={`${frenchDate(day)} · ${done ? "fait" : "à faire"}`} aria-label={`${habit.name}, ${frenchDate(day)}, ${done ? "fait" : "non fait"}`} onClick={() => { setSelectedDay(day); registerToggle(habit, day); }}>{done ? "✓" : "·"}</button>;
                })}
              </div>)}
            </div></div>}
        </>}
      </Panel>
      <div className="grid grid-half" style={{ marginTop: 17 }}>
        <Panel><div className="card-head"><div><h2 className="card-title">Tes routines</h2><p className="card-subtitle">Configure la difficulté et les rappels.</p></div></div>
          {activeHabits.length ? activeHabits.map((habit) => <div className="habit-row" key={habit.id}>
            <span className="habit-emoji">{habit.emoji}</span><div className="habit-info"><div className="habit-name">{habit.name}</div><div className="habit-meta"><span>{habit.difficulty}</span><span>·</span><span>{habit.reminderTime ? `Rappel ${habit.reminderTime}` : `${habit.target} fois / semaine`}</span></div></div><button className="task-delete" title="Archiver, historique conservé" onClick={() => archiveHabit(habit)}>Archiver</button>
          </div>) : <EmptyState title="Aucune routine active">Une routine personnalisée t’attend.</EmptyState>}
          <form onSubmit={handleAddHabit} className="stack" style={{ marginTop: 12 }}>
            <div className="form-row"><input className="input" aria-label="Emoji" value={newEmoji} maxLength={3} onChange={(event) => setNewEmoji(event.target.value)} style={{ width: 58, flex: "0 0 58px", textAlign: "center" }} /><input className="input" placeholder="Nom de l’habitude" value={newHabit} onChange={(event) => setNewHabit(event.target.value)} aria-label="Nom de l’habitude" /></div>
            <div className="form-row"><select className="select" aria-label="Difficulté" value={newDifficulty} onChange={(event) => setNewDifficulty(event.target.value as Difficulty)}><option value="facile">Facile · 10 XP</option><option value="normale">Normale · 20 XP</option><option value="difficile">Difficile · 30 XP</option></select><select className="select" aria-label="Fréquence hebdomadaire" value={newTarget} onChange={(event) => setNewTarget(Number(event.target.value))}>{[3, 4, 5, 6, 7].map((count) => <option value={count} key={count}>{count}× par semaine</option>)}</select><input className="input" type="time" aria-label="Heure du rappel" value={newReminder} onChange={(event) => setNewReminder(event.target.value)} /></div>
            <button type="submit" className="button button-primary">＋ Créer cette habitude</button>
          </form>
        </Panel>
        <Panel><div className="card-head"><div><h2 className="card-title">Échéances</h2><p className="card-subtitle">Les dates importantes, sans stress.</p></div></div>
          {deadlines.map((deadline) => {
            const day = deadline.dueAt.slice(0, 10);
            const left = daysBetween(localToday(), day);
            return <div className="deadline-item" key={deadline.id}><div className="deadline-date"><strong>{parseDateKey(day).getDate()}</strong><span>{MONTHS[parseDateKey(day).getMonth()].slice(0, 3)}</span></div><div className="task-copy"><strong>{deadline.title}</strong><div className="tiny">{left < 0 ? `En retard de ${-left} jour${left < -1 ? "s" : ""}` : left === 0 ? "Aujourd’hui" : `Dans ${left} jour${left > 1 ? "s" : ""}`}</div></div><button className="task-delete" aria-label={`Supprimer ${deadline.title}`} onClick={() => {
              const now = new Date().toISOString();
              update((current) => ({ ...current, deadlines: current.deadlines.map((item) => item.id === deadline.id ? { ...item, deletedAt: now, updatedAt: now } : item) }));
            }}>×</button></div>;
          })}
          {!deadlines.length && <EmptyState title="Pas de date limite">Ajoute les dates qui t’aident à garder le cap.</EmptyState>}
          <form className="stack" onSubmit={handleAddDeadline} style={{ marginTop: 12 }}><input className="input" placeholder="Nom de l’échéance" aria-label="Nom de l’échéance" value={newDeadline} onChange={(event) => setNewDeadline(event.target.value)} /><div className="form-row"><input className="input" type="date" aria-label="Date" value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} /><button className="button button-primary" type="submit">Ajouter</button></div></form>
        </Panel>
      </div>
    </>;
  }

  function renderProgression() {
    const scale = chartScale;
    const chartData = (() => {
      const count = scale === "7j" ? 7 : scale === "30j" ? 30 : 12;
      return Array.from({ length: count }, (_, index) => {
        if (scale === "an") {
          const date = new Date();
          date.setDate(1);
          date.setMonth(date.getMonth() - (count - 1 - index));
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
          const days = daysInMonth(date.getFullYear(), date.getMonth());
          const logs = state.logs.filter((log) => log.completed && log.day.startsWith(key));
          const possible = activeHabits.length * days;
          return { label: MONTHS[date.getMonth()].slice(0, 3), taux: possible ? Math.round(logs.length / possible * 100) : 0, total: logs.length };
        }
        const day = shiftDate(localToday(), -(count - 1 - index));
        const n = state.logs.filter((log) => log.completed && log.day === day).length;
        return { label: scale === "7j" ? DAYS_SHORT[(parseDateKey(day).getDay() + 6) % 7] : shortDate(day), taux: activeHabits.length ? Math.round(n / activeHabits.length * 100) : 0, total: n };
      });
    })();

    const radarData = activeHabits.slice(0, 8).map((habit) => {
      const logs = state.logs.filter((log) => log.completed && log.habitId === habit.id && daysBetween(log.day, localToday()) < 30).length;
      return { habitude: habit.name, score: Math.min(100, Math.round(logs / 30 * 100)) };
    });
    const now = new Date();
    const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthPrefix = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
    const thisMonthLogs = state.logs.filter((log) => log.completed && log.day.startsWith(thisMonthPrefix)).length;
    const previousWindowDays = Math.min(now.getDate(), daysInMonth(prevMonth.getFullYear(), prevMonth.getMonth()));
    const prevMonthLogs = state.logs.filter((log) =>
      log.completed && log.day.startsWith(prevMonthPrefix) && parseDateKey(log.day).getDate() <= previousWindowDays,
    ).length;
    const percentDelta = prevMonthLogs ? Math.round((thisMonthLogs - prevMonthLogs) / prevMonthLogs * 100) : null;
    const bestHabit = [...activeHabits].sort((a, b) => streakForHabit(b.id, state.logs) - streakForHabit(a.id, state.logs))[0];
    const bestHabitStreak = bestHabit ? streakForHabit(bestHabit.id, state.logs) : 0;
    const timeData = [
      { moment: "Matin", activite: state.logs.filter((log) => log.completed && log.timeKnown && new Date(log.updatedAt).getHours() < 12).length },
      { moment: "Après-midi", activite: state.logs.filter((log) => log.completed && log.timeKnown && new Date(log.updatedAt).getHours() >= 12 && new Date(log.updatedAt).getHours() < 18).length },
      { moment: "Soir", activite: state.logs.filter((log) => log.completed && log.timeKnown && new Date(log.updatedAt).getHours() >= 18).length },
    ];
    const earned = new Set([...state.achievements, ...badgeIds(state.logs, state.habits)]);
    return <>
      <div className="kpi-grid">
        <div className="panel kpi"><div className="kpi-label">XP collectés</div><div className="kpi-value">{xp}</div><div className="kpi-detail">Niveau {level.level}</div></div>
        <div className="panel kpi"><div className="kpi-label">Série à battre</div><div className="kpi-value">{bestStreak} j</div><div className="kpi-detail">{bestHabit?.name ?? "À construire"}</div></div>
        <div className="panel kpi"><div className="kpi-label">Ce mois-ci</div><div className="kpi-value">{thisMonthLogs}</div><div className="kpi-detail">habitudes cochées</div></div>
        <div className="panel kpi"><div className="kpi-label">Badges débloqués</div><div className="kpi-value">{earned.size}/{BADGES.length}</div><div className="kpi-detail">chaque étape compte</div></div>
      </div>
      <div className="xp-line"><span>Niveau {level.level}</span><span>{level.current} XP / {level.next} XP</span></div><div className="progress-track" style={{ marginBottom: 17 }}><div className="progress-fill" style={{ width: `${Math.min(100, level.current / level.next * 100)}%` }} /></div>
      <div className="grid grid-half">
        <Panel><div className="card-head"><div><h2 className="card-title">Ton rythme</h2><p className="card-subtitle">Taux de complétion sur la période.</p></div><div className="segmented">{(["7j", "30j", "an"] as const).map((value) => <button key={value} className={scale === value ? "active" : ""} onClick={() => setChartScale(value)}>{value === "an" ? "12 mois" : value}</button>)}</div></div>
          <div className="chart-wrap"><ResponsiveContainer width="100%" height={250}><AreaChart data={chartData} margin={{ top: 8, right: 7, bottom: 0, left: -20 }}><defs><linearGradient id="taux" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={COLORS[state.settings.accent]} stopOpacity={.35} /><stop offset="95%" stopColor={COLORS[state.settings.accent]} stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="var(--line)" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="label" tick={{ fill: "var(--muted)", fontSize: 9 }} interval={scale === "30j" ? 4 : 0} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} tick={{ fill: "var(--faint)", fontSize: 9 }} tickFormatter={(value: number) => `${value}%`} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 10 }} formatter={(value) => [`${value}%`, "Complétion"]} /><Area type="monotone" dataKey="taux" stroke={COLORS[state.settings.accent]} strokeWidth={2.5} fill="url(#taux)" activeDot={{ r: 5 }} /></AreaChart></ResponsiveContainer></div>
        </Panel>
        <Panel><div className="card-head"><div><h2 className="card-title">Équilibre des habitudes</h2><p className="card-subtitle">Les validations des 30 derniers jours.</p></div><span className="tag">30 jours</span></div>
          {radarData.length ? <div className="chart-wrap"><ResponsiveContainer width="100%" height={250}><RadarChart data={radarData}><PolarGrid stroke="var(--line)" /><PolarAngleAxis dataKey="habitude" tick={{ fill: "var(--muted)", fontSize: 9 }} /><PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} /><Radar dataKey="score" stroke={COLORS[state.settings.accent]} fill={COLORS[state.settings.accent]} fillOpacity={.23} /></RadarChart></ResponsiveContainer></div> : <EmptyState title="Un premier point sur le radar">Crée quelques habitudes pour voir leur régularité.</EmptyState>}
        </Panel>
        <Panel><div className="card-head"><div><h2 className="card-title">Comparaison mensuelle</h2><p className="card-subtitle">{MONTHS[prevMonth.getMonth()]} comparé à {MONTHS[now.getMonth()]}</p></div><span>{percentDelta === null ? "—" : percentDelta >= 0 ? "↗" : "↘"}</span></div>
          <div className="grid grid-half"><div className="kpi" style={{ padding: 0 }}><div className="kpi-label">Mois dernier</div><div className="kpi-value">{prevMonthLogs}</div></div><div className="kpi" style={{ padding: 0 }}><div className="kpi-label">Ce mois</div><div className="kpi-value">{thisMonthLogs}</div></div></div>
          <div className="divider" /><p className="muted" style={{ fontSize: 11 }}>{percentDelta === null ? "Les tendances apparaîtront avec tes prochaines validations." : `${Math.abs(percentDelta)}% ${percentDelta >= 0 ? "de validations en plus" : "de validations en moins"} que le mois précédent.`}</p>
          <div className="chart-wrap" style={{ minHeight: 140 }}><ResponsiveContainer width="100%" height={140}><BarChart data={[{ mois: MONTHS[prevMonth.getMonth()].slice(0, 3), validations: prevMonthLogs }, { mois: MONTHS[now.getMonth()].slice(0, 3), validations: thisMonthLogs }]}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="mois" tick={{ fill: "var(--muted)", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis hide /><Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 10 }} /><Bar dataKey="validations" fill={COLORS[state.settings.accent]} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </Panel>
        <Panel><div className="card-head"><div><h2 className="card-title">Tes meilleurs moments</h2><p className="card-subtitle">Selon l’heure de tes validations enregistrées.</p></div></div>
          <div className="chart-wrap" style={{ minHeight: 180 }}><ResponsiveContainer width="100%" height={180}><BarChart data={timeData}><CartesianGrid stroke="var(--line)" vertical={false} /><XAxis dataKey="moment" tick={{ fill: "var(--muted)", fontSize: 9 }} axisLine={false} tickLine={false} /><YAxis hide /><Tooltip contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--line)", borderRadius: 10, fontSize: 10 }} /><Bar dataKey="activite" fill={COLORS[state.settings.accent]} radius={[7, 7, 0, 0]} /></BarChart></ResponsiveContainer></div>
          <p className="tiny">Les validations historiques importées n’ont pas d’heure précise; leur moment ne peut donc pas être reconstruit.</p>
        </Panel>
      </div>
      <Panel style={{ marginTop: 17 }}><div className="card-head"><div><h2 className="card-title">Ce que tes données racontent</h2><p className="card-subtitle">Des repères concrets, sans jugement.</p></div><span>✦</span></div>
        {bestHabit && bestHabitStreak > 0 ? <p className="muted" style={{ fontSize: 12 }}>Ta série <strong style={{ color: "var(--text)" }}>{bestHabit.emoji} {bestHabit.name}</strong> est la plus longue en ce moment : <strong style={{ color: "var(--accent)" }}>{bestHabitStreak} jours</strong>. Continue à construire ton rythme, un jour à la fois.</p> : <p className="muted" style={{ fontSize: 12 }}>Tes premières validations feront apparaître des insights personnalisés ici.</p>}
      </Panel>
      <Panel><div className="card-head"><div><h2 className="card-title">Tes badges</h2><p className="card-subtitle">Chaque badge célèbre un effort réel.</p></div></div>
        <div className="badge-grid">{BADGES.map((badge) => <div className={`badge ${earned.has(badge.id) ? "" : "locked"}`} key={badge.id}><div className="badge-icon">{badge.icon}</div><div className="badge-title">{badge.title}</div><div className="badge-desc">{badge.description}</div></div>)}</div>
      </Panel>
    </>;
  }

  function renderDataPage() {
    const size = Math.round(new Blob([JSON.stringify(state)]).size / 1024);
    return <>
      <div className="grid grid-half">
        <Panel><div className="card-head"><div><h2 className="card-title">Sauvegarde et migration</h2><p className="card-subtitle">Télécharge une copie, ou fusionne une sauvegarde précédente.</p></div><span>◈</span></div>
          <div className="tag" style={{ marginBottom: 14 }}>Environ {size} Ko · {state.habits.length} habitudes · {state.logs.length} validations</div>
          <div className="stack"><button className="button button-primary" onClick={exportJson}>↓ Exporter mes données JSON</button>
            <label className="button" style={{ cursor: "pointer", justifyContent: "center" }}>↑ Importer un JSON (fusion non destructive)<input className="hidden-input" type="file" accept=".json,application/json" onChange={(event) => void importJson(event)} /></label>
            <p className="tiny">Compatible avec les exports LifeOS précédents (clé locale <code>lifeos-v1</code> comprise). L’import fusionne les éléments et n’efface rien.</p>
          </div>
        </Panel>
        <Panel className="no-print"><div className="card-head"><div><h2 className="card-title">Rapports</h2><p className="card-subtitle">À imprimer en PDF ou à envoyer par courriel.</p></div><span>✉</span></div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.65 }}>Prépare un bilan personnel des sept derniers jours. Le rapport reste sur ton appareil.</p>
          <div className="stack"><button className="button" onClick={() => window.print()}>Imprimer le rapport hebdo / PDF</button><button className="button button-quiet" onClick={sendWeeklyReport}>Envoyer le rapport hebdo ↗</button><button className="button button-quiet" onClick={sendDailyReport}>Préparer le rapport du jour ↗</button></div>
          <label className="tiny" htmlFor="report-email" style={{ display: "block", marginTop: 14 }}>Adresse de destination du rapport</label><input id="report-email" className="input" type="email" placeholder="maman@exemple.fr" value={state.settings.emailReportTo} onChange={(event) => setSetting("emailReportTo", event.target.value)} style={{ width: "100%", marginTop: 5 }} />
        </Panel>
      </div>
      <Panel className="weekly-report" style={{ marginTop: 17 }}>
        <div className="no-print"><div className="card-head"><div><h2 className="card-title">Aperçu de la semaine</h2><p className="card-subtitle">Le résumé prêt pour l’impression.</p></div></div>
          <div className="grid grid-third">{activeHabits.map((habit) => {
            const start = shiftDate(localToday(), -6);
            const count = state.logs.filter((log) => log.habitId === habit.id && log.completed && log.day >= start && log.day <= localToday()).length;
            return <div className="kpi" key={habit.id}><div className="kpi-label">{habit.emoji} {habit.name}</div><div className="kpi-value">{count}/{habit.target}</div><div className="kpi-detail">cette semaine</div></div>;
          })}</div>
          {!activeHabits.length && <EmptyState title="Pas encore de données">Tes bilans apparaîtront ici au fil de tes habitudes.</EmptyState>}
        </div>
        <div className="print-only"><h1>Mon bilan LifeOS · {frenchDate(localToday())}</h1><p>Semaine du {frenchDate(shiftDate(localToday(), -6))} au {frenchDate(localToday())}.</p>
          <p>{completedToday} habitudes validées aujourd’hui · {xp} XP au total · série maximale {bestStreak} jours.</p>
          <ul>{activeHabits.map((habit) => {
            const start = shiftDate(localToday(), -6);
            const count = state.logs.filter((log) => log.habitId === habit.id && log.completed && log.day >= start && log.day <= localToday()).length;
            return <li key={habit.id}>{habit.emoji} {habit.name} — {count}/{habit.target} cette semaine</li>;
          })}</ul>
        </div>
      </Panel>
      <Panel className="no-print" style={{ marginTop: 17 }}><div className="card-head"><div><h2 className="card-title">Confidentialité et compte</h2><p className="card-subtitle">Mode local ou synchronisation chiffrée par ton compte Supabase.</p></div></div>
        {!user ? <><p className="muted" style={{ fontSize: 12, lineHeight: 1.6 }}>En mode invité, tes données restent dans le stockage de ce navigateur. Connecte-toi pour synchroniser entre tes appareils.</p><button className="button button-primary" disabled={!syncEnabled} onClick={() => setAuthOpen(true)}>{syncEnabled ? "Connecter mon compte" : "Configurer Supabase pour synchroniser"}</button></> :
          <><p className="muted" style={{ fontSize: 12 }}>Connecté en tant que <strong>{user.email}</strong>.</p><div className="form-row"><button className="button" onClick={() => void syncNow().then(() => notify("Export distant vérifié et synchronisé.")).catch((error: unknown) => notify(error instanceof Error ? error.message : "Synchronisation impossible."))}>Synchroniser</button><button className="button button-quiet" onClick={() => void signOut().then(() => notify("Déconnecté. Tes données locales restent sur cet appareil."))}>Se déconnecter</button><button className="button button-danger" onClick={() => void deleteAccount()}>Supprimer mon compte</button></div></>}
      </Panel>
    </>;
  }

  function renderSettings() {
    const accents: { id: Accent; label: string }[] = [{ id: "bleu", label: "Bleu" }, { id: "violet", label: "Violet" }, { id: "vert", label: "Vert" }, { id: "rose", label: "Rose" }];
    const slots = [
      ["logo", "Logo / icône"], ["fond", "Fond d’écran"], ["banniere", "Bannière d’accueil"],
      ["focus", "Illustration Focus"], ["trophee", "Trophée"], ["sablier", "Sablier"],
    ] as const;
    return <>
      <div className="grid grid-half">
        <Panel><div className="card-head"><div><h2 className="card-title">Apparence</h2><p className="card-subtitle">Un espace calme, à tes couleurs.</p></div><span>◐</span></div>
          <div className="section-label">Thème</div><div className="form-row"><button className={`button ${state.settings.mode === "nuit" ? "button-primary" : ""}`} onClick={() => setSetting("mode", "nuit")}>☾ Nuit</button><button className={`button ${state.settings.mode === "blanc" ? "button-primary" : ""}`} onClick={() => setSetting("mode", "blanc")}>☼ Clair</button></div>
          <div className="divider" /><div className="section-label">Accent</div><div className="form-row">{accents.map((accent) => <button key={accent.id} className={`button ${state.settings.accent === accent.id ? "button-primary" : ""}`} onClick={() => setSetting("accent", accent.id)}><span style={{ width: 10, height: 10, borderRadius: "50%", background: COLORS[accent.id] }} />{accent.label}</button>)}</div>
          <div className="divider" /><div className="form-row" style={{ alignItems: "center", justifyContent: "space-between" }}><div><strong style={{ fontSize: 12 }}>Animations & effets</strong><p className="tiny">Confettis, transitions et micro-interactions.</p></div><button className="button" aria-pressed={state.settings.fx} onClick={() => setSetting("fx", !state.settings.fx)}>{state.settings.fx ? "FX activés" : "FX coupés"}</button></div>
          <div className="form-row" style={{ marginTop: 12, alignItems: "center", justifyContent: "space-between" }}><div><strong style={{ fontSize: 12 }}>Son de célébration</strong><p className="tiny">Un son discret au déblocage d’un palier.</p></div><button className="button" aria-pressed={state.settings.sound} onClick={() => setSetting("sound", !state.settings.sound)}>{state.settings.sound ? "Activé" : "Désactivé"}</button></div>
        </Panel>
        <Panel><div className="card-head"><div><h2 className="card-title">Rappels</h2><p className="card-subtitle">Notifications du navigateur selon tes routines.</p></div><span>◷</span></div>
          <p className="muted" style={{ fontSize: 11, lineHeight: 1.6 }}>Les rappels sont enregistrés avec l’habitude et utilisent l’heure locale de ton appareil. Autorise les notifications pour recevoir un rappel quand LifeOS est ouvert.</p>
          <button className="button button-primary" onClick={() => {
            if (!("Notification" in window)) { notify("Les notifications ne sont pas prises en charge par ce navigateur."); return; }
            void Notification.requestPermission().then((permission) => notify(permission === "granted" ? "Notifications activées pour cet appareil." : "Autorisation de notification refusée."));
          }}>Autoriser les notifications</button>
          <div className="form-row" style={{ marginTop: 9 }}>
            <button className="button" onClick={() => void enablePushReminders()}>Activer les rappels push</button>
            {user && <button className="button button-quiet" onClick={() => void disablePushReminders()}>Désactiver les rappels push</button>}
          </div>
          <p className="tiny" style={{ marginTop: 8 }}>Le push planifié nécessite les clés VAPID et le cron Vercel configurés dans le fichier de déploiement.</p>
          <div className="divider" /><div className="section-label">Focus</div><p className="tiny">Cycle Pomodoro de 25 min de concentration et 5 min de pause, avec mode plein écran.</p><Link className="button" href="/">Ouvrir mon espace focus</Link>
        </Panel>
      </div>
      <Panel style={{ marginTop: 17 }}><div className="card-head"><div><h2 className="card-title">Tes visuels</h2><p className="card-subtitle">Remplace les slots par tes images; elles s’adaptent au thème.</p></div><span>▧</span></div>
        <div className="grid grid-third">{slots.map(([slot, label]) => <div className="habit-row" key={slot} style={{ alignItems: "center" }}><span className="avatar" style={{ width: 47, height: 43, borderRadius: 10 }}><IconImage src={state.images[slot] ?? `/images/${slot === "banniere" ? "banniere-dashboard" : slot}.svg`} alt="" /></span><div className="habit-info"><div className="habit-name">{label}</div><label className="tiny" style={{ cursor: "pointer" }}>Remplacer<input className="hidden-input" type="file" accept="image/*" onChange={(event) => changeImage(slot, event)} /></label></div>{state.images[slot] && <button className="task-delete" onClick={() => update((current) => ({ ...current, images: { ...current.images, [slot]: null } }))}>Réinitialiser</button>}</div>)}</div>
        <p className="tiny" style={{ marginTop: 11 }}>Les fichiers personnalisés restent dans le cache local de cet appareil. Taille maximale par image : 3 Mo. Pour le déploiement, tu peux aussi remplacer les fichiers dans <code>public/images/</code>.</p>
      </Panel>
      <Panel style={{ marginTop: 17 }}><div className="card-head"><div><h2 className="card-title">Synchronisation et données</h2><p className="card-subtitle">{user ? `Connecté : ${user.email}` : syncEnabled ? "Compte Supabase non connecté." : "Mode invité disponible sans configuration."}</p></div></div>
        {!syncEnabled && <p className="muted" style={{ fontSize: 11 }}>La connexion multi-appareils s’active après ajout des variables Supabase dans <code>.env.local</code>. Tes données locales restent disponibles.</p>}
        <div className="form-row"><button className="button" onClick={exportJson}>Exporter JSON</button><label className="button" style={{ cursor: "pointer" }}>Importer JSON<input className="hidden-input" type="file" accept=".json,application/json" onChange={(event) => void importJson(event)} /></label>
          {user ? <button className="button button-quiet" onClick={() => void signOut()}>Se déconnecter</button> : syncEnabled && <button className="button button-primary" onClick={() => setAuthOpen(true)}>Se connecter</button>}
        </div>
      </Panel>
      <Panel style={{ marginTop: 17 }}><div className="card-head"><div><h2 className="card-title">Ton bilan du jour</h2><p className="card-subtitle">Un espace pour noter ce que tu as appris.</p></div></div>
        <form onSubmit={(event) => {
          event.preventDefault();
          update((current) => ({ ...current, difficulties: reflectionDraft }));
          setReflectionDraft("");
          notify("Ton bilan a été enregistré.");
        }}><textarea className="textarea" placeholder="Ce qui s’est bien passé, ce qui a été plus difficile…" value={reflectionDraft || state.difficulties} onChange={(event) => setReflectionDraft(event.target.value)} /><button className="button button-primary" type="submit" style={{ marginTop: 9 }}>Enregistrer le bilan</button></form>
      </Panel>
    </>;
  }

  async function deleteAccount() {
    if (!window.confirm("Cette action supprimera ton compte et ses données synchronisées. As-tu téléchargé une sauvegarde JSON ?")) return;
    try {
      const response = await fetch("/api/account", { method: "DELETE" });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(result && typeof result === "object" && "error" in result ? String(result.error) : "Suppression du compte impossible.");
      clearLocalData();
      try {
        await signOut();
      } catch (sessionError) {
        console.error("Le compte est supprimé, mais la fermeture de session locale a échoué.", sessionError);
        notify("Compte supprimé et données locales effacées. Ferme ta session navigateur si elle reste affichée.");
        return;
      }
      notify("Compte supprimé. Tes données locales ont également été effacées.");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Suppression impossible.");
    }
  }
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal">{children}</div></div>;
}

function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [step, setStep] = useState(0);
  const slides = [
    { image: "/images/onboarding-1.svg", title: "Un espace à toi", detail: "Rassemble tes habitudes, tes tâches et tes idées dans un endroit simple, sans pression." },
    { image: "/images/onboarding-2.svg", title: "Chaque effort compte", detail: "Les séries, l’XP et les badges célèbrent tes progrès, jamais la perfection." },
    { image: "/images/onboarding-3.svg", title: "Avec toi, partout", detail: "Commence en mode invité. Tes données restent sur ton appareil jusqu’à ce que tu choisisses de les synchroniser." },
  ];
  return <div className="onboarding"><div className="onboarding-card">
    <div className="brand" style={{ justifyContent: "center", padding: 0 }}><span className="brand-mark"><IconImage src="/images/logo.svg" alt="" /></span><span className="brand-name">LifeOS</span></div>
    <div className="onboarding-art"><IconImage src={slides[step].image} alt="" /></div>
    <div className="eyebrow">Ton nouveau départ · {step + 1}/3</div><h1 style={{ margin: "8px 0", font: "700 25px Manrope, sans-serif" }}>{slides[step].title}</h1><p className="muted" style={{ maxWidth: 390, margin: "0 auto", fontSize: 12, lineHeight: 1.7 }}>{slides[step].detail}</p>
    <div className="onboarding-dots">{slides.map((slide, index) => <span key={slide.title} className={`onboarding-dot ${index === step ? "active" : ""}`} />)}</div>
    <div className="form-row" style={{ justifyContent: "center" }}>{step > 0 && <button className="button button-quiet" onClick={() => setStep((value) => value - 1)}>Retour</button>}
      <button className="button button-primary" onClick={() => step === 2 ? onFinish() : setStep((value) => value + 1)}>{step === 2 ? "Commencer" : "Continuer"}</button>
    </div>
    <button className="button button-quiet" style={{ marginTop: 10 }} onClick={onFinish}>Passer l’introduction</button>
  </div></div>;
}

function FxLayers({ active }: { active: boolean }) {
  if (!active) return null;
  return <div className="fx-layers" aria-hidden="true">
    <div className="fx-aurora"><span /><span /><span /></div>
    <div className="fx-stars">{Array.from({ length: 34 }, (_, index) => {
      const size = 1 + (index % 3) * .65;
      return <span key={index} className="fx-star" style={{
        left: `${(index * 37 + 11) % 100}%`,
        top: `${(index * 53 + 7) % 110}%`,
        width: `${size}px`,
        height: `${size}px`,
        animationDuration: `${11 + (index * 7) % 13}s`,
        animationDelay: `${-((index * 3) % 20)}s`,
      }} />;
    })}</div>
  </div>;
}

function Confetti({ active }: { active: boolean }) {
  if (!active) return null;
  const colors = ["#aa96ff", "#70d7ae", "#f1bd76", "#8db4ff", "#ff9fbd"];
  return <div aria-hidden="true">{Array.from({ length: 42 }, (_, index) => <i key={index} className="confetti" style={{
    left: `${(index * 37 + 3) % 100}%`,
    background: colors[index % colors.length],
    animationDelay: `${(index % 11) * .055}s`,
    transform: `rotate(${index * 37}deg)`,
  }} />)}</div>;
}
