/**
 * Kielimallirajapinta (vaihe 7, ennen 7B:tä).
 *
 * Kaikki mallikutsut kulkevat tämän moduulin kautta. Palveluntarjoajan vaihto:
 * MALLI_TARJOAJA + MALLI_NIMI (+ tarvittava API-avain).
 *
 * Ympäristö:
 * - MALLI_TARJOAJA: gemini | anthropic | openai (oletus gemini)
 * - MALLI_NIMI: mallin tunniste (oletus gemini-2.0-flash)
 * - MALLI_API_URL: OpenAI-yhteensopivan endpointin juuri (oletus https://api.openai.com/v1)
 * - MALLI_API_KEY tai GEMINI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY
 * - MALLI_PAIVA_KATTO: päivittäinen kutsukatto (oletus 500)
 * - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (loki)
 */
import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { lataaPaikallinenYmparisto } from "./ymparisto";

export type MalliVastaus = { teksti: string; kaytetytTokenit: number };

export interface MalliTarjoaja {
  kysy(kehote: string, jarjestelma?: string): Promise<MalliVastaus>;
}

export type MalliKyselyOpts = {
  /** Välimuistin avain: sama dokumentti + sama kysymys. */
  dokumenttiUrl?: string;
  /** Ohita välimuisti (testaus). */
  eiValimuistia?: boolean;
};

type TarjoajaTunnus = "gemini" | "anthropic" | "openai";

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000] as const;

const valimuisti = new Map<string, MalliVastaus>();

let supabaseLoki: SupabaseClient | null = null;
let paivaLaskuri: { paiva: string; maara: number } | null = null;

function sha256(teksti: string): string {
  return createHash("sha256").update(teksti, "utf8").digest("hex");
}

function tanaanIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function paivaKatto(): number {
  const n = Number(process.env.MALLI_PAIVA_KATTO ?? "500");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 500;
}

function tarjoaja(): TarjoajaTunnus {
  const t = (process.env.MALLI_TARJOAJA ?? "gemini").trim().toLowerCase();
  if (t === "anthropic" || t === "openai") return t;
  return "gemini";
}

function malliNimi(): string {
  return (process.env.MALLI_NIMI ?? "gemini-2.0-flash").trim();
}

function apiAvain(t: TarjoajaTunnus): string {
  const yleinen = process.env.MALLI_API_KEY?.trim();
  if (yleinen) return yleinen;
  if (t === "gemini") return process.env.GEMINI_API_KEY?.trim() ?? "";
  if (t === "anthropic") return process.env.ANTHROPIC_API_KEY?.trim() ?? "";
  return process.env.OPENAI_API_KEY?.trim() ?? "";
}

function lokiAsiakas(): SupabaseClient | null {
  if (supabaseLoki) return supabaseLoki;
  lataaPaikallinenYmparisto();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const avain = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !avain) return null;
  supabaseLoki = createClient(url, avain, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseLoki;
}

async function paivitaPaivaLaskuri(): Promise<number> {
  const paiva = tanaanIso();
  if (paivaLaskuri?.paiva === paiva) return paivaLaskuri.maara;

  const sb = lokiAsiakas();
  if (!sb) {
    paivaLaskuri = { paiva, maara: 0 };
    return 0;
  }
  const alku = `${paiva}T00:00:00.000Z`;
  const { count, error } = await sb
    .from("mallikutsut")
    .select("*", { count: "exact", head: true })
    .gte("luotu_pvm", alku);
  if (error) throw new Error(`mallikutsut-laskuri: ${error.message}`);
  const maara = count ?? 0;
  paivaLaskuri = { paiva, maara };
  return maara;
}

async function tarkistaPaivaKatto(): Promise<void> {
  const maara = await paivitaPaivaLaskuri();
  if (maara >= paivaKatto()) {
    throw new Error(
      `Mallikutsujen päiväkatto (${paivaKatto()}) täynnä (${maara} tänään).`,
    );
  }
}

function valimuistiAvain(
  kehote: string,
  jarjestelma: string | undefined,
  dokumenttiUrl: string | undefined,
): string {
  return sha256(
    JSON.stringify({
      t: tarjoaja(),
      m: malliNimi(),
      k: kehote,
      j: jarjestelma ?? "",
      d: dokumenttiUrl ?? "",
    }),
  );
}

async function kirjaaKutsu(rivi: {
  kehotteenTiiviste: string;
  kaytetytTokenit: number;
  onnistui: boolean;
  virhe?: string;
  dokumenttiUrl?: string;
}): Promise<void> {
  if (paivaLaskuri && paivaLaskuri.paiva === tanaanIso()) {
    paivaLaskuri.maara += 1;
  }
  const sb = lokiAsiakas();
  if (!sb) return;
  const { error } = await sb.from("mallikutsut").insert({
    tarjoaja: tarjoaja(),
    malli_nimi: malliNimi(),
    kehotteen_tiiviste: rivi.kehotteenTiiviste,
    kaytetyt_tokenit: rivi.kaytetytTokenit,
    onnistui: rivi.onnistui,
    virhe: rivi.virhe ?? null,
    dokumentti_url: rivi.dokumenttiUrl ?? null,
  });
  if (error) {
    console.warn(`mallikutsut-kirjaus epäonnistui: ${error.message}`);
  }
}

async function odota(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function onRateLimit(status: number, body: string): boolean {
  return status === 429 || /rate.?limit|resource.?exhausted|too many requests/i.test(body);
}

async function fetchBackoff(
  url: string,
  init: RequestInit,
): Promise<Response> {
  let viimeinen: Response | null = null;
  for (let i = 0; i <= BACKOFF_MS.length; i++) {
    const vastaus = await fetch(url, init);
    viimeinen = vastaus;
    if (vastaus.ok || !onRateLimit(vastaus.status, await vastaus.clone().text())) {
      return vastaus;
    }
    if (i < BACKOFF_MS.length) {
      await odota(BACKOFF_MS[i]!);
    }
  }
  return viimeinen!;
}

async function kysyGemini(kehote: string, jarjestelma?: string): Promise<MalliVastaus> {
  const avain = apiAvain("gemini");
  if (!avain) throw new Error("GEMINI_API_KEY tai MALLI_API_KEY puuttuu.");
  const malli = malliNimi();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(malli)}:generateContent?key=${encodeURIComponent(avain)}`;
  const system = jarjestelma?.trim();
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: kehote }] }],
    generationConfig: { temperature: 0 },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }
  const vastaus = await fetchBackoff(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await vastaus.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    usageMetadata?: { totalTokenCount?: number };
    error?: { message?: string };
  };
  if (!vastaus.ok) {
    throw new Error(json.error?.message ?? `Gemini ${vastaus.status}`);
  }
  const teksti =
    json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const tokenit = json.usageMetadata?.totalTokenCount ?? arvioiTokenit(kehote, teksti);
  return { teksti: teksti.trim(), kaytetytTokenit: tokenit };
}

async function kysyAnthropic(kehote: string, jarjestelma?: string): Promise<MalliVastaus> {
  const avain = apiAvain("anthropic");
  if (!avain) throw new Error("ANTHROPIC_API_KEY tai MALLI_API_KEY puuttuu.");
  const vastaus = await fetchBackoff("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": avain,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: malliNimi(),
      max_tokens: 4096,
      temperature: 0,
      system: jarjestelma?.trim() || undefined,
      messages: [{ role: "user", content: kehote }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await vastaus.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
  };
  if (!vastaus.ok) {
    throw new Error(json.error?.message ?? `Anthropic ${vastaus.status}`);
  }
  const teksti =
    json.content?.filter((c) => c.type === "text").map((c) => c.text ?? "").join("") ?? "";
  const tokenit =
    (json.usage?.input_tokens ?? 0) + (json.usage?.output_tokens ?? 0) ||
    arvioiTokenit(kehote, teksti);
  return { teksti: teksti.trim(), kaytetytTokenit: tokenit };
}

async function kysyOpenAi(kehote: string, jarjestelma?: string): Promise<MalliVastaus> {
  const avain = apiAvain("openai");
  if (!avain) throw new Error("OPENAI_API_KEY tai MALLI_API_KEY puuttuu.");
  const juuri = (process.env.MALLI_API_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const viestit: { role: string; content: string }[] = [];
  if (jarjestelma?.trim()) {
    viestit.push({ role: "system", content: jarjestelma.trim() });
  }
  viestit.push({ role: "user", content: kehote });
  const vastaus = await fetchBackoff(`${juuri}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${avain}`,
    },
    body: JSON.stringify({
      model: malliNimi(),
      messages: viestit,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await vastaus.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { total_tokens?: number };
    error?: { message?: string };
  };
  if (!vastaus.ok) {
    throw new Error(json.error?.message ?? `OpenAI-yhteensopiva ${vastaus.status}`);
  }
  const teksti = json.choices?.[0]?.message?.content ?? "";
  const tokenit = json.usage?.total_tokens ?? arvioiTokenit(kehote, teksti);
  return { teksti: teksti.trim(), kaytetytTokenit: tokenit };
}

function arvioiTokenit(kehote: string, vastaus: string): number {
  return Math.ceil((kehote.length + vastaus.length) / 4);
}

async function kysyTarjoajalta(kehote: string, jarjestelma?: string): Promise<MalliVastaus> {
  const t = tarjoaja();
  if (t === "anthropic") return kysyAnthropic(kehote, jarjestelma);
  if (t === "openai") return kysyOpenAi(kehote, jarjestelma);
  return kysyGemini(kehote, jarjestelma);
}

/** Luo tarjoajan, joka kirjaa kutsut ja noudattaa kattoa. */
export function luoMalli(): MalliTarjoaja {
  return {
    async kysy(kehote: string, jarjestelma?: string): Promise<MalliVastaus> {
      return kysyMallia(kehote, { jarjestelma });
    },
  };
}

type SisainenOpts = MalliKyselyOpts & { jarjestelma?: string };

/** Yksittäinen kysely välimuistilla ja lokituksella. */
export async function kysyMallia(
  kehote: string,
  opts: SisainenOpts = {},
): Promise<MalliVastaus> {
  const kehotteenTiiviste = sha256(kehote);
  const valimuistiKey = valimuistiAvain(kehote, opts.jarjestelma, opts.dokumenttiUrl);

  if (!opts.eiValimuistia && valimuisti.has(valimuistiKey)) {
    return valimuisti.get(valimuistiKey)!;
  }

  await tarkistaPaivaKatto();

  try {
    const vastaus = await kysyTarjoajalta(kehote, opts.jarjestelma);
    if (!opts.eiValimuistia) {
      valimuisti.set(valimuistiKey, vastaus);
    }
    await kirjaaKutsu({
      kehotteenTiiviste,
      kaytetytTokenit: vastaus.kaytetytTokenit,
      onnistui: true,
      dokumenttiUrl: opts.dokumenttiUrl,
    });
    return vastaus;
  } catch (syy) {
    const viesti = syy instanceof Error ? syy.message : String(syy);
    await kirjaaKutsu({
      kehotteenTiiviste,
      kaytetytTokenit: 0,
      onnistui: false,
      virhe: viesti.slice(0, 500),
      dokumenttiUrl: opts.dokumenttiUrl,
    });
    throw syy;
  }
}

/** Tyhjennä prosessin sisäinen välimuisti (testaus). */
export function tyhjennaMalliValimuisti(): void {
  valimuisti.clear();
}
