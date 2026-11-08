import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "Supabase n’est pas configuré." }, { status: 503 });

  const supabase = createServerClient(url, anonKey, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: () => undefined },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Connecte-toi pour activer les rappels push." }, { status: 401 });

  const body: unknown = await request.json();
  if (!body || typeof body !== "object" || !("subscription" in body)) {
    return NextResponse.json({ error: "Abonnement de notification invalide." }, { status: 400 });
  }
  const payload = (body as { subscription: unknown }).subscription;
  const timezone = body && typeof body === "object" && "timezone" in body
    ? String((body as { timezone: unknown }).timezone)
    : "UTC";
  if (!payload || typeof payload !== "object" || !("endpoint" in payload) || !("keys" in payload)) {
    return NextResponse.json({ error: "Abonnement de notification incomplet." }, { status: 400 });
  }
  const endpoint = (payload as { endpoint: unknown }).endpoint;
  if (typeof endpoint !== "string" || !endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "Point de terminaison de notification invalide." }, { status: 400 });
  }
  try {
    new Intl.DateTimeFormat("fr-FR", { timeZone: timezone });
  } catch {
    return NextResponse.json({ error: "Fuseau horaire invalide." }, { status: 400 });
  }
  const { data: existing, error: lookupError } = await supabase.from("push_subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .eq("subscription->>endpoint", endpoint)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ error: `Recherche de l’abonnement impossible : ${lookupError.message}` }, { status: 500 });
  const { error } = await supabase.from("push_subscriptions").upsert({
    id: existing?.id ?? crypto.randomUUID(),
    user_id: user.id,
    subscription: payload,
    timezone,
    updated_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: `Enregistrement du rappel impossible : ${error.message}` }, { status: 500 });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.json({ error: "Supabase n’est pas configuré." }, { status: 503 });
  const supabase = createServerClient(url, anonKey, {
    cookies: { getAll: () => request.cookies.getAll(), setAll: () => undefined },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Session connectée nécessaire." }, { status: 401 });
  const { error } = await supabase.from("push_subscriptions").delete().eq("user_id", user.id);
  if (error) return NextResponse.json({ error: `Désactivation des rappels impossible : ${error.message}` }, { status: 500 });
  return NextResponse.json({ success: true });
}
