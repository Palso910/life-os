import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { NextResponse, type NextRequest } from "next/server";

interface SubscriptionRow {
  id: string;
  user_id: string;
  subscription: webpush.PushSubscription;
  timezone: string;
  last_sent_key: string | null;
}

interface HabitRow {
  id: string;
  name: string;
  emoji: string;
  schedule: number[];
  reminder_time: string | null;
}

function localClock(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdayShort = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date());
  const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
    weekday: weekdays[weekdayShort] ?? new Date().getDay(),
  };
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Accès interdit." }, { status: 401 });
  }
  if (!url || !serviceKey || !publicKey || !privateKey) {
    return NextResponse.json({ error: "Configuration serveur des notifications incomplète." }, { status: 503 });
  }

  webpush.setVapidDetails("mailto:lifeos@example.com", publicKey, privateKey);
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: subscriptions, error } = await admin.from("push_subscriptions")
    .select("id,user_id,subscription,timezone,last_sent_key");
  if (error) return NextResponse.json({ error: `Lecture des abonnements impossible : ${error.message}` }, { status: 500 });

  let sent = 0;
  let expired = 0;
  for (const raw of subscriptions ?? []) {
    const subscription = raw as SubscriptionRow;
    let clock: ReturnType<typeof localClock>;
    try {
      clock = localClock(subscription.timezone || "UTC");
    } catch (timezoneError) {
      console.error("Fuseau horaire invalide pour un abonnement LifeOS.", timezoneError);
      continue;
    }

    const { data: habits, error: habitsError } = await admin.from("habits")
      .select("id,name,emoji,schedule,reminder_time")
      .eq("user_id", subscription.user_id)
      .is("archived_at", null);
    if (habitsError) {
      console.error("Lecture des routines pour rappel impossible.", habitsError);
      continue;
    }
    const due = ((habits ?? []) as HabitRow[]).filter((habit) =>
      habit.reminder_time?.slice(0, 5) === clock.time && habit.schedule.includes(clock.weekday),
    );
    if (!due.length) continue;

    const { data: completions, error: logError } = await admin.from("habit_logs")
      .select("habit_id")
      .eq("user_id", subscription.user_id)
      .eq("day", clock.date)
      .eq("completed", true)
      .in("habit_id", due.map((habit) => habit.id));
    if (logError) {
      console.error("Vérification des habitudes déjà faites impossible.", logError);
      continue;
    }
    const done = new Set((completions ?? []).map((row) => row.habit_id));
    const pending = due.filter((habit) => !done.has(habit.id));
    if (!pending.length) continue;

    const sentKey = `${clock.date}:${clock.time}:${pending.map((habit) => habit.id).sort().join(",")}`;
    if (subscription.last_sent_key === sentKey) continue;
    const names = pending.map((habit) => `${habit.emoji} ${habit.name}`).join(" · ");
    try {
      await webpush.sendNotification(subscription.subscription, JSON.stringify({
        title: "LifeOS · ton rappel",
        body: names,
        url: "/",
      }));
      const { error: updateError } = await admin.from("push_subscriptions")
        .update({ last_sent_key: sentKey, updated_at: new Date().toISOString() })
        .eq("id", subscription.id);
      if (updateError) console.error("Enregistrement du dernier rappel impossible.", updateError);
      sent += 1;
    } catch (pushError) {
      const status = pushError && typeof pushError === "object" && "statusCode" in pushError
        ? Number((pushError as { statusCode: unknown }).statusCode)
        : 0;
      if (status === 404 || status === 410) {
        const { error: deleteError } = await admin.from("push_subscriptions").delete().eq("id", subscription.id);
        if (deleteError) console.error("Suppression d’un abonnement expiré impossible.", deleteError);
        expired += 1;
      } else {
        console.error("Envoi de notification LifeOS échoué.", pushError);
      }
    }
  }

  return NextResponse.json({ sent, expired });
}
