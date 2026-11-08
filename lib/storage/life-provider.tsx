"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";
import { badgeIds, xpForDifficulty } from "@/lib/domain/gamification";
import { localToday } from "@/lib/domain/dates";
import { emptyLifeState, loadLocalState, saveLocalState } from "@/lib/domain/legacy";
import { createSupabaseBrowserClient, hasSupabaseConfig } from "@/lib/supabase/client";
import { syncLifeState } from "@/lib/supabase/sync";
import type { Habit, HabitLog, LifeState } from "@/lib/domain/types";

interface LifeContextValue {
  state: LifeState;
  hydrated: boolean;
  user: User | null;
  syncEnabled: boolean;
  syncBusy: boolean;
  syncError: string | null;
  update: (mutator: (state: LifeState) => LifeState) => void;
  toggleHabit: (habit: Habit, day: string) => void;
  addHabit: (habit: Omit<Habit, "id" | "createdAt" | "updatedAt" | "archivedAt">) => void;
  signIn: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  syncNow: () => Promise<void>;
  replaceState: (state: LifeState) => void;
  clearLocalData: () => void;
}

const LifeContext = createContext<LifeContextValue | null>(null);

function freshId(): string {
  return crypto.randomUUID();
}

function mergeConcurrentState(current: LifeState, incoming: LifeState): LifeState {
  const latest = <T extends { id: string; updatedAt: string }>(left: T[], right: T[]) => {
    const records = new Map(left.map((item) => [item.id, item]));
    right.forEach((item) => {
      const previous = records.get(item.id);
      if (!previous || item.updatedAt > previous.updatedAt) records.set(item.id, item);
    });
    return [...records.values()];
  };
  const logs = new Map(current.logs.map((log) => [`${log.habitId}:${log.day}`, log]));
  incoming.logs.forEach((log) => {
    const key = `${log.habitId}:${log.day}`;
    const previous = logs.get(key);
    if (!previous || log.updatedAt > previous.updatedAt) logs.set(key, log);
  });
  const incomingIsNewer = incoming.updatedAt > current.updatedAt;
  return {
    ...(incomingIsNewer ? current : incoming),
    habits: latest(current.habits, incoming.habits),
    logs: [...logs.values()],
    tasks: latest(current.tasks, incoming.tasks),
    deadlines: latest(current.deadlines, incoming.deadlines),
    notes: latest(current.notes, incoming.notes),
    focusSessions: latest(current.focusSessions, incoming.focusSessions),
    achievements: [...new Set([...current.achievements, ...incoming.achievements])],
    settings: incomingIsNewer ? incoming.settings : current.settings,
    difficulties: incomingIsNewer ? incoming.difficulties : current.difficulties,
    activeTimer: incomingIsNewer ? incoming.activeTimer : current.activeTimer,
    images: incomingIsNewer ? incoming.images : current.images,
    updatedAt: incomingIsNewer ? incoming.updatedAt : current.updatedAt,
  };
}

export function LifeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<LifeState>(() => emptyLifeState());
  const [hydrated, setHydrated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const mergeRemoteState = useCallback((incoming: LifeState) => {
    setState((current) => {
      const merged = mergeConcurrentState(current, incoming);
      return JSON.stringify(current) === JSON.stringify(merged) ? current : merged;
    });
  }, []);

  const update = useCallback((mutator: (current: LifeState) => LifeState) => {
    setState((current) => ({ ...mutator(current), updatedAt: new Date().toISOString() }));
  }, []);

  const replaceState = useCallback((next: LifeState) => {
    setState({ ...next, updatedAt: new Date().toISOString() });
  }, []);

  const toggleHabit = useCallback((habit: Habit, day: string) => {
    const now = new Date().toISOString();
    setState((current) => {
      const previous = current.logs.find((log) => log.habitId === habit.id && log.day === day);
      const completed = !previous?.completed;
      const log: HabitLog = {
        habitId: habit.id,
        day,
        completed,
        xpAwarded: completed ? xpForDifficulty(habit.difficulty) : 0,
        timeKnown: true,
        updatedAt: now,
      };
      const logs = [...current.logs.filter((item) => item.habitId !== habit.id || item.day !== day), log];
      return {
        ...current,
        logs,
        achievements: badgeIds(logs, current.habits),
        updatedAt: now,
      };
    });
  }, []);

  const addHabit = useCallback((input: Omit<Habit, "id" | "createdAt" | "updatedAt" | "archivedAt">) => {
    const now = new Date().toISOString();
    setState((current) => ({
      ...current,
      habits: [{
        ...input,
        id: freshId(),
        createdAt: now,
        updatedAt: now,
        archivedAt: null,
      }, ...current.habits],
      updatedAt: now,
    }));
  }, []);

  const syncNow = useCallback(async () => {
    if (!supabase || !user) return;
    setSyncBusy(true);
    setSyncError(null);
    try {
      const result = await syncLifeState(supabase, user.id, stateRef.current);
      mergeRemoteState(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erreur inattendue de synchronisation.";
      setSyncError(message);
      throw error;
    } finally {
      setSyncBusy(false);
    }
  }, [mergeRemoteState, supabase, user]);

  const signIn = useCallback(async (email: string) => {
    if (!supabase) throw new Error("Configure Supabase dans .env.local pour activer la connexion.");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) throw new Error(`Lien de connexion non envoyé : ${error.message}`);
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(`Déconnexion impossible : ${error.message}`);
    setUser(null);
  }, [supabase]);

  const clearLocalData = useCallback(() => {
    const clean = emptyLifeState();
    window.localStorage.removeItem("lifeos-v1");
    setState(clean);
    saveLocalState(clean);
  }, []);

  useEffect(() => {
    setState(loadLocalState());
    setHydrated(true);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
        console.error("Installation du service worker impossible.", error);
      });
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      saveLocalState(state);
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Sauvegarde locale impossible.");
    }
  }, [hydrated, state]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const loadUser = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setSyncError(`Session Supabase inaccessible : ${error.message}`);
        return;
      }
      if (active) setUser(data.session?.user ?? null);
    };
    void loadUser();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !user || !hydrated) return;
    let cancelled = false;
    const run = async () => {
      setSyncBusy(true);
      setSyncError(null);
      try {
        const merged = await syncLifeState(supabase, user.id, stateRef.current);
        if (!cancelled) mergeRemoteState(merged);
      } catch (error) {
        if (!cancelled) setSyncError(error instanceof Error ? error.message : "Synchronisation impossible.");
      } finally {
        if (!cancelled) setSyncBusy(false);
      }
    };
    void run();
    const onOnline = () => void run();
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener("online", onOnline);
    };
  }, [mergeRemoteState, supabase, user?.id, hydrated]);

  useEffect(() => {
    if (!hydrated || !user || !supabase) return;
    const timer = window.setTimeout(() => {
      void syncLifeState(supabase, user.id, stateRef.current).then((remote) => {
        mergeRemoteState(remote);
      }).catch((error: unknown) => {
        setSyncError(error instanceof Error ? error.message : "Synchronisation impossible.");
      });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [state, hydrated, user, supabase, mergeRemoteState]);

  useEffect(() => {
    const checkReminders = () => {
      if (!("Notification" in window) || Notification.permission !== "granted") return;
      const now = new Date();
      const today = localToday();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const due = state.habits.filter((habit) =>
        !habit.archivedAt && habit.reminderTime === time && habit.schedule.includes(now.getDay()),
      );
      due.forEach((habit) => {
        const key = `lifeos-reminder:${habit.id}:${today}:${time}`;
        if (localStorage.getItem(key)) return;
        new Notification(`LifeOS · ${habit.name}`, { body: "C’est le bon moment pour ta routine.", icon: "/images/logo.svg" });
        localStorage.setItem(key, "1");
      });
    };
    const interval = window.setInterval(checkReminders, 30_000);
    return () => window.clearInterval(interval);
  }, [state.habits]);

  const value = useMemo<LifeContextValue>(() => ({
    state,
    hydrated,
    user,
    syncEnabled: hasSupabaseConfig(),
    syncBusy,
    syncError,
    update,
    toggleHabit,
    addHabit,
    signIn,
    signOut,
    syncNow,
    replaceState,
    clearLocalData,
  }), [state, hydrated, user, syncBusy, syncError, update, toggleHabit, addHabit, signIn, signOut, syncNow, replaceState, clearLocalData]);

  return <LifeContext.Provider value={value}>{children}</LifeContext.Provider>;
}

export function useLife(): LifeContextValue {
  const context = useContext(LifeContext);
  if (!context) throw new Error("useLife doit être utilisé dans LifeProvider.");
  return context;
}
