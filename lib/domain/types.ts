export type Difficulty = "facile" | "normale" | "difficile";
export type ThemeMode = "nuit" | "blanc";
export type Accent = "bleu" | "violet" | "vert" | "rose";
export type GridScale = "semaine" | "mois" | "annee";
export type ChartScale = "7j" | "30j" | "an";

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  target: number;
  difficulty: Difficulty;
  schedule: number[];
  reminderTime: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HabitLog {
  habitId: string;
  day: string;
  completed: boolean;
  xpAwarded: number;
  timeKnown: boolean;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  done: boolean;
  dueAt: string | null;
  deletedAt: string | null;
  updatedAt: string;
}

export interface Deadline {
  id: string;
  title: string;
  dueAt: string;
  deletedAt: string | null;
  updatedAt: string;
}

export interface Note {
  id: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  updatedAt: string;
}

export interface FocusSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number;
  updatedAt: string;
}

export interface LifeSettings {
  mode: ThemeMode;
  accent: Accent;
  gridScale: GridScale;
  chartScale: ChartScale;
  fx: boolean;
  sound: boolean;
  onboardingComplete: boolean;
  widgetOrder: string[];
  emailReportTo: string;
}

export interface LifeState {
  version: 2;
  habits: Habit[];
  logs: HabitLog[];
  tasks: Task[];
  deadlines: Deadline[];
  notes: Note[];
  focusSessions: FocusSession[];
  activeTimer: { startedAt: string; durationSeconds: number; mode: "focus" | "pause" } | null;
  achievements: string[];
  settings: LifeSettings;
  difficulties: string;
  images: Record<string, string | null>;
  updatedAt: string;
}

export interface LegacyData {
  app?: string;
  version?: number;
  exportedAt?: string;
  data?: Record<string, unknown>;
  habits?: Array<Record<string, unknown>>;
  checks?: Record<string, Record<string, boolean>>;
  tasks?: Array<Record<string, unknown>>;
  deadlines?: Array<Record<string, unknown>>;
  notes?: Array<Record<string, unknown>>;
  focus?: Record<string, number>;
  difficulties?: string;
  images?: Record<string, string | null>;
  settings?: Record<string, unknown>;
}
