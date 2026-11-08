import { dateKey } from "@/lib/domain/dates";
import type {
  Accent, Deadline, FocusSession, Habit, HabitLog, LegacyData, LifeState, Note, Task,
} from "@/lib/domain/types";

const CACHE_KEY = "lifeos-v2";
const LEGACY_KEY = "lifeos-v1";

export function emptyLifeState(): LifeState {
  return {
    version: 2,
    habits: [],
    logs: [],
    tasks: [],
    deadlines: [],
    notes: [],
    focusSessions: [],
    activeTimer: null,
    achievements: [],
    settings: {
      mode: "nuit",
      accent: "bleu",
      gridScale: "semaine",
      chartScale: "30j",
      fx: true,
      sound: false,
      onboardingComplete: false,
      widgetOrder: ["habitudes", "taches", "focus", "calendrier", "notes"],
      emailReportTo: "",
    },
    difficulties: "",
    images: {
      logo: null,
      banniere: null,
      fond: null,
      sablier: null,
      trophee: null,
      focus: null,
    },
    updatedAt: new Date().toISOString(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isHabit(value: unknown): value is Habit {
  return isRecord(value) && isString(value.id) && isString(value.name) && isString(value.emoji)
    && typeof value.target === "number"
    && (value.difficulty === "facile" || value.difficulty === "normale" || value.difficulty === "difficile")
    && Array.isArray(value.schedule) && value.schedule.every((day) => typeof day === "number")
    && isString(value.reminderTime) && (value.archivedAt === null || isString(value.archivedAt))
    && isString(value.createdAt) && isString(value.updatedAt);
}

function parseHabitLog(value: unknown): HabitLog | null {
  if (!isRecord(value) || !isString(value.habitId) || !isString(value.day)
    || typeof value.completed !== "boolean" || typeof value.xpAwarded !== "number"
    || (typeof value.timeKnown !== "boolean" && value.timeKnown !== undefined)
    || !isString(value.updatedAt)) return null;
  return {
    habitId: value.habitId,
    day: value.day,
    completed: value.completed,
    xpAwarded: value.xpAwarded,
    timeKnown: typeof value.timeKnown === "boolean" ? value.timeKnown : true,
    updatedAt: value.updatedAt,
  };
}

function isTask(value: unknown): value is Task {
  return isRecord(value) && isString(value.id) && isString(value.title) && typeof value.done === "boolean"
    && (value.dueAt === null || isString(value.dueAt))
    && (value.deletedAt === null || isString(value.deletedAt)) && isString(value.updatedAt);
}

function isDeadline(value: unknown): value is Deadline {
  return isRecord(value) && isString(value.id) && isString(value.title) && isString(value.dueAt)
    && (value.deletedAt === null || isString(value.deletedAt)) && isString(value.updatedAt);
}

function isNote(value: unknown): value is Note {
  return isRecord(value) && isString(value.id) && isString(value.body) && isString(value.createdAt)
    && (value.deletedAt === null || isString(value.deletedAt)) && isString(value.updatedAt);
}

function isFocusSession(value: unknown): value is FocusSession {
  return isRecord(value) && isString(value.id) && isString(value.startedAt)
    && (value.endedAt === null || isString(value.endedAt))
    && typeof value.durationSeconds === "number" && isString(value.updatedAt);
}

function validDate(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const candidate = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback;
}

function legacyUuid(value: string): string {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return value;
  const hashes = [2166136261, 2246822519, 3266489917, 668265263];
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    for (let hashIndex = 0; hashIndex < hashes.length; hashIndex += 1) {
      hashes[hashIndex] = Math.imul(hashes[hashIndex] ^ (code + hashIndex * 31), 16777619) >>> 0;
    }
  }
  const hex = hashes.map((part) => part.toString(16).padStart(8, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)}${hex.slice(18, 20)}-${hex.slice(20, 32)}`;
}

function normalizeLifeState(value: unknown): LifeState | null {
  if (!isRecord(value) || value.version !== 2) return null;
  const defaults = emptyLifeState();
  const settings = isRecord(value.settings) ? value.settings : {};
  const images = isRecord(value.images) ? value.images : {};
  const image = (name: string): string | null => isString(images[name]) ? images[name] : null;
  const timer = value.activeTimer;
  const timerMode: "focus" | "pause" | null = isRecord(timer)
    && (timer.mode === "focus" || timer.mode === "pause") ? timer.mode : null;
  const activeTimer = isRecord(timer)
    && isString(timer.startedAt)
    && typeof timer.durationSeconds === "number"
    && timerMode
    ? { startedAt: timer.startedAt, durationSeconds: timer.durationSeconds, mode: timerMode }
    : null;
  const widgetOrder = Array.isArray(settings.widgetOrder)
    ? settings.widgetOrder.filter(isString)
    : defaults.settings.widgetOrder;
  return {
    version: 2,
    habits: Array.isArray(value.habits) ? value.habits.filter(isHabit) : [],
    logs: Array.isArray(value.logs)
      ? value.logs.flatMap((log) => {
        const parsed = parseHabitLog(log);
        return parsed ? [parsed] : [];
      })
      : [],
    tasks: Array.isArray(value.tasks) ? value.tasks.filter(isTask) : [],
    deadlines: Array.isArray(value.deadlines) ? value.deadlines.filter(isDeadline) : [],
    notes: Array.isArray(value.notes) ? value.notes.filter(isNote) : [],
    focusSessions: Array.isArray(value.focusSessions) ? value.focusSessions.filter(isFocusSession) : [],
    activeTimer,
    achievements: Array.isArray(value.achievements) ? value.achievements.filter(isString) : [],
    settings: {
      mode: settings.mode === "blanc" ? "blanc" : "nuit",
      accent: settings.accent === "bleu" || settings.accent === "vert" || settings.accent === "rose" || settings.accent === "violet"
        ? settings.accent : defaults.settings.accent,
      gridScale: settings.gridScale === "mois" || settings.gridScale === "annee" ? settings.gridScale : "semaine",
      chartScale: settings.chartScale === "7j" || settings.chartScale === "an" ? settings.chartScale : "30j",
      fx: typeof settings.fx === "boolean" ? settings.fx : defaults.settings.fx,
      sound: typeof settings.sound === "boolean" ? settings.sound : defaults.settings.sound,
      onboardingComplete: typeof settings.onboardingComplete === "boolean" ? settings.onboardingComplete : true,
      widgetOrder,
      emailReportTo: isString(settings.emailReportTo) ? settings.emailReportTo : "",
    },
    difficulties: isString(value.difficulties) ? value.difficulties : "",
    images: {
      logo: image("logo"),
      banniere: image("banniere"),
      fond: image("fond"),
      sablier: image("sablier"),
      trophee: image("trophee"),
      focus: image("focus"),
    },
    updatedAt: isString(value.updatedAt) ? value.updatedAt : new Date().toISOString(),
  };
}

export function parseLegacyData(input: unknown): LifeState {
  if (!isRecord(input)) throw new Error("Le fichier ne contient pas un objet JSON valide.");
  const root = input as LegacyData;
  const data = isRecord(root.data) ? root.data as LegacyData : root;
  if (!Array.isArray(data.habits) || !isRecord(data.checks)) {
    throw new Error("Sauvegarde non reconnue : les habitudes ou l’historique sont absents.");
  }

  const base = emptyLifeState();
  const now = new Date().toISOString();
  const habitIdMap = new Map<string, string>();
  const habits: Habit[] = data.habits.flatMap((raw): Habit[] => {
    if (!isRecord(raw) || typeof raw.id !== "string" || typeof raw.name !== "string") return [];
    const target = Number(raw.target);
    const difficulty = raw.difficulty;
    const id = legacyUuid(raw.id);
    habitIdMap.set(raw.id, id);
    return [{
      id,
      name: raw.name,
      emoji: typeof raw.emoji === "string" ? raw.emoji : "✨",
      target: Number.isInteger(target) && target >= 1 && target <= 7 ? target : 7,
      difficulty: difficulty === "facile" || difficulty === "difficile" ? difficulty : "normale",
      schedule: Array.isArray(raw.schedule) ? raw.schedule.map(Number).filter((n) => n >= 0 && n <= 6) : [0, 1, 2, 3, 4, 5, 6],
      reminderTime: typeof raw.reminderTime === "string" ? raw.reminderTime : "",
      archivedAt: typeof raw.archivedAt === "string" ? raw.archivedAt : null,
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
      updatedAt: now,
    }];
  });

  const logs: HabitLog[] = [];
  for (const habit of habits) {
    const originalId = [...habitIdMap.entries()].find(([, mapped]) => mapped === habit.id)?.[0];
    const history = originalId ? data.checks[originalId] : undefined;
    if (!isRecord(history)) continue;
    for (const [day, completed] of Object.entries(history)) {
      if (completed && /^\d{4}-\d{2}-\d{2}$/.test(day)) {
        const xpAwarded = habit.difficulty === "difficile" ? 30 : habit.difficulty === "facile" ? 10 : 20;
        logs.push({ habitId: habit.id, day, completed: true, xpAwarded, timeKnown: false, updatedAt: now });
      }
    }
  }

  const tasks = Array.isArray(data.tasks) ? data.tasks.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.id !== "string") return [];
    return [{
      id: legacyUuid(raw.id),
      title: typeof raw.title === "string" ? raw.title : typeof raw.text === "string" ? raw.text : "",
      done: Boolean(raw.done),
      dueAt: null,
      deletedAt: null,
      updatedAt: now,
    }];
  }) : [];

  const deadlines = Array.isArray(data.deadlines) ? data.deadlines.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.id !== "string") return [];
    const date = validDate(raw.date, dateKey(new Date()));
    return [{
      id: legacyUuid(raw.id),
      title: typeof raw.title === "string" ? raw.title : "Échéance",
      dueAt: `${date}T12:00:00`,
      deletedAt: null,
      updatedAt: now,
    }];
  }) : [];

  const notes = Array.isArray(data.notes) ? data.notes.flatMap((raw) => {
    if (!isRecord(raw) || typeof raw.id !== "string") return [];
    return [{
      id: legacyUuid(raw.id),
      body: typeof raw.body === "string" ? raw.body : typeof raw.text === "string" ? raw.text : "",
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
      deletedAt: null,
      updatedAt: now,
    }];
  }) : [];

  const focusSessions = isRecord(data.focus) ? Object.entries(data.focus).flatMap(([day, count]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || typeof count !== "number") return [];
    return Array.from({ length: Math.min(count, 100) }, (_, index) => {
      const startedAt = `${day}T12:${String(index % 60).padStart(2, "0")}:00`;
      return {
        id: legacyUuid(`legacy-focus-${day}-${index}`),
        startedAt,
        endedAt: startedAt,
        durationSeconds: 0,
        updatedAt: now,
      };
    });
  }) : [];

  const legacySettings = isRecord(data.settings) ? data.settings : {};
  const legacyImages = isRecord(data.images) ? data.images : {};
  const images = Object.entries(legacyImages).reduce<Record<string, string | null>>((result, [name, image]) => {
    if (image === null || typeof image === "string") result[name] = image;
    return result;
  }, {});
  const accent: Accent = legacySettings.accent === "bleu" || legacySettings.accent === "violet"
    || legacySettings.accent === "vert" || legacySettings.accent === "rose"
    ? legacySettings.accent : "bleu";
  const imported = emptyLifeState();
  return {
    ...imported,
    habits,
    logs,
    tasks,
    deadlines,
    notes,
    focusSessions,
    difficulties: typeof data.difficulties === "string" ? data.difficulties : "",
    images: { ...imported.images, ...images },
    settings: {
      ...base.settings,
      mode: legacySettings.mode === "blanc" ? "blanc" : "nuit",
      accent,
      gridScale: legacySettings.gridScale === "mois" || legacySettings.gridScale === "annee"
        ? legacySettings.gridScale : "semaine",
      chartScale: legacySettings.chartScale === "7j" || legacySettings.chartScale === "an"
        ? legacySettings.chartScale : "30j",
      fx: typeof legacySettings.fx === "boolean" ? legacySettings.fx : true,
      onboardingComplete: true,
    },
    updatedAt: now,
  };
}

export function parseBackupData(input: unknown): LifeState {
  if (!isRecord(input)) throw new Error("Le fichier ne contient pas un objet JSON valide.");
  const data = isRecord(input.data) ? input.data : input;
  const current = normalizeLifeState(data);
  return current ?? parseLegacyData(input);
}

export function loadLocalState(): LifeState {
  if (typeof window === "undefined") return emptyLifeState();
  try {
    const current = window.localStorage.getItem(CACHE_KEY);
    if (current) {
      const parsed: unknown = JSON.parse(current);
      const normalized = normalizeLifeState(parsed);
      if (normalized) return normalized;
    }
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = parseLegacyData(JSON.parse(legacy));
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (error) {
    console.error("Impossible de lire les données LifeOS locales.", error);
  }
  return emptyLifeState();
}

export function saveLocalState(state: LifeState): void {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("Échec de sauvegarde locale LifeOS.", error);
    throw new Error("Le stockage local est plein ou indisponible. Exporte tes données avant de continuer.");
  }
}
