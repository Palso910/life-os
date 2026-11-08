import type { SupabaseClient } from "@supabase/supabase-js";
import type { FocusSession, Habit, HabitLog, LifeState } from "@/lib/domain/types";

type RemoteRow = Record<string, unknown>;

function newestBy<T extends { id: string; updatedAt: string }>(local: T[], remote: T[]): T[] {
  const records = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) {
    const existing = records.get(item.id);
    if (!existing || item.updatedAt > existing.updatedAt) records.set(item.id, item);
  }
  return [...records.values()];
}

function mapHabit(row: RemoteRow): Habit {
  return {
    id: String(row.id),
    name: String(row.name),
    emoji: String(row.emoji ?? "✨"),
    target: Number(row.target ?? 7),
    difficulty: row.difficulty === "facile" || row.difficulty === "difficile" ? row.difficulty : "normale",
    schedule: Array.isArray(row.schedule) ? row.schedule.map(Number) : [0, 1, 2, 3, 4, 5, 6],
    reminderTime: typeof row.reminder_time === "string" ? row.reminder_time : "",
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    createdAt: String(row.created_at ?? row.updated_at),
    updatedAt: String(row.updated_at),
  };
}

function mapLog(row: RemoteRow): HabitLog {
  return {
    habitId: String(row.habit_id),
    day: String(row.day),
    completed: Boolean(row.completed),
    xpAwarded: Number(row.xp_awarded ?? 0),
    timeKnown: Boolean(row.time_known ?? true),
    updatedAt: String(row.updated_at),
  };
}

function mapFocus(row: RemoteRow): FocusSession {
  return {
    id: String(row.id),
    startedAt: String(row.started_at),
    endedAt: typeof row.ended_at === "string" ? row.ended_at : null,
    durationSeconds: Number(row.duration_seconds ?? 0),
    updatedAt: String(row.updated_at),
  };
}

export async function syncLifeState(client: SupabaseClient, userId: string, local: LifeState): Promise<LifeState> {
  const [habitsResult, logsResult, tasksResult, deadlinesResult, notesResult, sessionsResult, profileResult, achievementsResult] =
    await Promise.all([
      client.from("habits").select("*").eq("user_id", userId),
      client.from("habit_logs").select("*").eq("user_id", userId),
      client.from("tasks").select("*").eq("user_id", userId),
      client.from("deadlines").select("*").eq("user_id", userId),
      client.from("notes").select("*").eq("user_id", userId),
      client.from("focus_sessions").select("*").eq("user_id", userId),
      client.from("profiles").select("*").eq("id", userId).maybeSingle(),
      client.from("achievements").select("badge_id").eq("user_id", userId),
    ]);

  for (const result of [habitsResult, logsResult, tasksResult, deadlinesResult, notesResult, sessionsResult, profileResult, achievementsResult]) {
    if (result.error) throw new Error(`Synchronisation impossible : ${result.error.message}`);
  }

  const remoteHabits = (habitsResult.data ?? []).map((row) => mapHabit(row as RemoteRow));
  const remoteLogs = (logsResult.data ?? []).map((row) => mapLog(row as RemoteRow));
  const remoteTasks = (tasksResult.data ?? []).map((row) => {
    const item = row as RemoteRow;
    return {
      id: String(item.id),
      title: String(item.title),
      done: Boolean(item.done),
      dueAt: typeof item.due_at === "string" ? item.due_at : null,
      deletedAt: typeof item.deleted_at === "string" ? item.deleted_at : null,
      updatedAt: String(item.updated_at),
    };
  });
  const remoteDeadlines = (deadlinesResult.data ?? []).map((row) => {
    const item = row as RemoteRow;
    return {
      id: String(item.id), title: String(item.title), dueAt: String(item.due_at),
      deletedAt: typeof item.deleted_at === "string" ? item.deleted_at : null, updatedAt: String(item.updated_at),
    };
  });
  const remoteNotes = (notesResult.data ?? []).map((row) => {
    const item = row as RemoteRow;
    return {
      id: String(item.id), body: String(item.body), createdAt: String(item.created_at),
      deletedAt: typeof item.deleted_at === "string" ? item.deleted_at : null, updatedAt: String(item.updated_at),
    };
  });
  const remoteSessions = (sessionsResult.data ?? []).map((row) => mapFocus(row as RemoteRow));
  const remoteBadges = (achievementsResult.data ?? []).map((row) => String((row as RemoteRow).badge_id));
  const profilePreferences = profileResult.data?.preferences as Record<string, unknown> | null;
  const profileIsNewer = Boolean(
    profilePreferences && String(profileResult.data?.updated_at ?? "") > local.updatedAt,
  );
  const remoteLogsByKey = new Map(local.logs.map((log) => [`${log.habitId}:${log.day}`, log]));
  for (const log of remoteLogs) {
    const key = `${log.habitId}:${log.day}`;
    const current = remoteLogsByKey.get(key);
    if (!current || log.updatedAt > current.updatedAt) remoteLogsByKey.set(key, log);
  }

  const merged: LifeState = {
    ...local,
    habits: newestBy(local.habits, remoteHabits),
    logs: [...remoteLogsByKey.values()],
    tasks: newestBy(local.tasks, remoteTasks),
    deadlines: newestBy(local.deadlines, remoteDeadlines),
    notes: newestBy(local.notes, remoteNotes),
    focusSessions: newestBy(local.focusSessions, remoteSessions),
    achievements: [...new Set([...local.achievements, ...remoteBadges])],
    settings: profileIsNewer && profilePreferences
      ? { ...local.settings, ...(profilePreferences as Partial<LifeState["settings"]>) }
      : local.settings,
    difficulties: profileIsNewer && profilePreferences
      ? String(profilePreferences._dailyReflection ?? local.difficulties)
      : local.difficulties,
    activeTimer: profileIsNewer && profilePreferences
      ? (profilePreferences._activeTimer as LifeState["activeTimer"] | undefined) ?? local.activeTimer
      : local.activeTimer,
  };
  await uploadLifeState(client, userId, merged);
  return merged;
}

export async function uploadLifeState(client: SupabaseClient, userId: string, state: LifeState): Promise<void> {
  const writes = [
    client.from("profiles").upsert({
      id: userId,
      preferences: {
        ...state.settings,
        _dailyReflection: state.difficulties,
        _activeTimer: state.activeTimer,
      },
      dashboard_layout: state.settings.widgetOrder,
      updated_at: state.updatedAt,
    }),
    ...(state.habits.length ? [client.from("habits").upsert(state.habits.map((habit) => ({
      id: habit.id, user_id: userId, name: habit.name, emoji: habit.emoji, target: habit.target,
      difficulty: habit.difficulty, schedule: habit.schedule, reminder_time: habit.reminderTime || null,
      archived_at: habit.archivedAt, created_at: habit.createdAt, updated_at: habit.updatedAt,
    })))] : []),
    ...(state.logs.length ? [client.from("habit_logs").upsert(state.logs.map((log) => ({
      user_id: userId, habit_id: log.habitId, day: log.day, completed: log.completed,
      xp_awarded: log.xpAwarded, time_known: log.timeKnown, updated_at: log.updatedAt,
    })))] : []),
    ...(state.tasks.length ? [client.from("tasks").upsert(state.tasks.map((item) => ({
      id: item.id, user_id: userId, title: item.title, done: item.done,
      due_at: item.dueAt, deleted_at: item.deletedAt, updated_at: item.updatedAt,
    })))] : []),
    ...(state.deadlines.length ? [client.from("deadlines").upsert(state.deadlines.map((item) => ({
      id: item.id, user_id: userId, title: item.title, due_at: item.dueAt,
      deleted_at: item.deletedAt, updated_at: item.updatedAt,
    })))] : []),
    ...(state.notes.length ? [client.from("notes").upsert(state.notes.map((item) => ({
      id: item.id, user_id: userId, body: item.body, created_at: item.createdAt,
      deleted_at: item.deletedAt, updated_at: item.updatedAt,
    })))] : []),
    ...(state.focusSessions.length ? [client.from("focus_sessions").upsert(state.focusSessions.map((item) => ({
      id: item.id, user_id: userId, started_at: item.startedAt, ended_at: item.endedAt,
      duration_seconds: item.durationSeconds, updated_at: item.updatedAt,
    })))] : []),
    ...(state.achievements.length ? [client.from("achievements").upsert(state.achievements.map((badge_id) => ({
      user_id: userId,
      badge_id,
    }), { onConflict: "user_id,badge_id", ignoreDuplicates: true }))] : []),
  ];
  const results = await Promise.all(writes);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(`Enregistrement distant impossible : ${failed.error.message}`);
}
