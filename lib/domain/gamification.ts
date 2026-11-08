import { daysBetween, localToday, shiftDate } from "@/lib/domain/dates";
import type { Habit, HabitLog } from "@/lib/domain/types";

export const BADGES = [
  { id: "premier-pas", title: "Premier pas", description: "Valide ta première habitude", icon: "🌱" },
  { id: "semaine-parfaite", title: "Semaine parfaite", description: "Complète toutes tes habitudes sur une semaine", icon: "🌟" },
  { id: "serie-7", title: "Une semaine en feu", description: "Garde une série de 7 jours", icon: "🔥" },
  { id: "serie-30", title: "Un mois solide", description: "Garde une série de 30 jours", icon: "🏅" },
  { id: "serie-100", title: "Légendaire", description: "Garde une série de 100 jours", icon: "👑" },
  { id: "focus-30", title: "Nuit protégée", description: "Évite les nuits blanches 30 fois", icon: "🌙" },
] as const;

export function xpForDifficulty(difficulty: Habit["difficulty"]): number {
  return difficulty === "difficile" ? 30 : difficulty === "normale" ? 20 : 10;
}

export function totalXp(logs: HabitLog[]): number {
  return logs.reduce((sum, log) => sum + (log.completed ? log.xpAwarded : 0), 0);
}

export function levelForXp(xp: number): { level: number; current: number; next: number } {
  const level = Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
  const current = (level - 1) ** 2 * 100;
  const next = level ** 2 * 100;
  return { level, current: xp - current, next: next - current };
}

export function streakForHabit(habitId: string, logs: HabitLog[]): number {
  const today = localToday();
  const completed = new Set(
    logs.filter((log) => log.habitId === habitId && log.completed).map((log) => log.day),
  );
  let cursor = completed.has(today) ? today : shiftDate(today, -1);
  let streak = 0;
  while (completed.has(cursor)) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function badgeIds(logs: HabitLog[], habits: Habit[]): string[] {
  const earned = new Set<string>();
  const completed = logs.filter((log) => log.completed);
  if (completed.length > 0) earned.add("premier-pas");

  for (const habit of habits) {
    const streak = streakForHabit(habit.id, logs);
    if (streak >= 7) earned.add("serie-7");
    if (streak >= 30) earned.add("serie-30");
    if (streak >= 100) earned.add("serie-100");
  }

  const byDay = new Map<string, Set<string>>();
  completed.forEach((log) => {
    const day = byDay.get(log.day) ?? new Set<string>();
    day.add(log.habitId);
    byDay.set(log.day, day);
  });
  const today = localToday();
  for (let weekOffset = 0; habits.some((habit) => !habit.archivedAt) && weekOffset < 52; weekOffset += 1) {
    const end = shiftDate(today, -weekOffset * 7);
    const start = shiftDate(end, -6);
    const week = Array.from({ length: 7 }, (_, index) => shiftDate(start, index));
    if (week.every((day) => {
      const done = byDay.get(day);
      return habits.filter((habit) => !habit.archivedAt).every((habit) => done?.has(habit.id));
    })) {
      earned.add("semaine-parfaite");
      break;
    }
  }

  const nights = new Set(completed.filter((log) => {
    const habit = habits.find((item) => item.id === log.habitId);
    return habit?.name.toLocaleLowerCase("fr").includes("coucher") && daysBetween(log.day, today) >= 0;
  }).map((log) => log.day));
  if (nights.size >= 30) earned.add("focus-30");
  return [...earned];
}
