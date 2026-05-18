"use client";

import { useEffect, useState } from "react";
import {
  STYLE_LABELS,
  STYLE_DESCRIPTIONS,
  PPU_BY_STYLE,
  FILTER_MODE_BY_STYLE,
  type Style,
  type ChromaColor,
  type BaseResponse,
} from "@/lib/validators";
import type { ProviderId } from "@/lib/providers/types";

const STYLES: Style[] = ["pixel16", "pixel32", "cartoon", "modern"];

const SESSION_KEY = "spriteCreator.baseCharacter";
const PROVIDER_PREF_KEY = "spriteCreator.providerPref";

interface PersistedBase {
  request: {
    description: string;
    style: Style;
    chromaColor: ChromaColor;
    provider: ProviderId;
  };
  response: BaseResponse;
}

interface ProviderSummary {
  id: ProviderId;
  label: string;
  modelLabel: string;
  available: boolean;
  whyUnavailable: string | null;
  supportsReference: boolean;
}

interface HealthResponse {
  providers: {
    available: ProviderId[];
    default: ProviderId;
    providers: ProviderSummary[];
  };
}

interface ApiError {
  error: string;
  message?: string;
  provider?: ProviderId;
  issues?: { fieldErrors: Record<string, string[] | undefined> };
  scope?: "minute" | "day";
  retryAfterSeconds?: number;
}

const FALLBACK_PROVIDER: ProviderId = "pollinations";

export function GenerateForm() {
  const [description, setDescription] = useState("");
  const [style, setStyle] = useState<Style>("pixel32");
  const [chromaColor, setChromaColor] = useState<ChromaColor>("#00FF00");
  const [provider, setProvider] = useState<ProviderId>(FALLBACK_PROVIDER);
  const [providers, setProviders] = useState<ProviderSummary[]>([]);
  const [defaultProvider, setDefaultProvider] = useState<ProviderId>(FALLBACK_PROVIDER);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BaseResponse | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadHealth() {
      try {
        const res = await fetch("/api/health");
        const body = (await res.json()) as HealthResponse;
        if (cancelled) return;
        setProviders(body.providers.providers);
        setDefaultProvider(body.providers.default);
        const storedPref =
          (typeof window !== "undefined"
            ? (window.sessionStorage.getItem(PROVIDER_PREF_KEY) as ProviderId | null)
            : null) ?? body.providers.default;
        const isPrefAvailable = body.providers.available.includes(storedPref);
        setProvider(isPrefAvailable ? storedPref : body.providers.default);
      } catch {
        // health failed; stick with fallback
      }
    }
    void loadHealth();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as PersistedBase;
      /* eslint-disable react-hooks/set-state-in-effect -- hydrating from browser storage */
      setDescription(parsed.request.description);
      setStyle(parsed.request.style);
      setChromaColor(parsed.request.chromaColor);
      if (parsed.request.provider) setProvider(parsed.request.provider);
      setResult(parsed.response);
      setAccepted(true);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // ignore malformed sessionStorage
    }
  }, []);

  function handleProviderChange(next: ProviderId) {
    setProvider(next);
    try {
      sessionStorage.setItem(PROVIDER_PREF_KEY, next);
    } catch {
      // sessionStorage may be unavailable in some embeds
    }
  }

  const charCount = description.trim().length;
  const canGenerate = !loading && charCount >= 10 && charCount <= 500;
  const currentProvider = providers.find((p) => p.id === provider);

  async function handleGenerate() {
    setError(null);
    setLoading(true);
    setAccepted(false);
    try {
      const res = await fetch("/api/generate-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: description.trim(),
          style,
          chromaColor,
          provider,
        }),
      });
      const body = (await res.json()) as BaseResponse | ApiError;
      if (!res.ok) {
        setError(body as ApiError);
        setResult(null);
        return;
      }
      setResult(body as BaseResponse);
    } catch (err) {
      setError({
        error: "network_error",
        message: err instanceof Error ? err.message : "Network request failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  function handleAccept() {
    if (!result) return;
    const payload: PersistedBase = {
      request: { description: description.trim(), style, chromaColor, provider },
      response: result,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    setAccepted(true);
  }

  function handleClear() {
    sessionStorage.removeItem(SESSION_KEY);
    setAccepted(false);
    setResult(null);
    setError(null);
  }

  return (
    <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1fr_1fr]">
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label
            htmlFor="provider"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Image provider
          </label>
          <select
            id="provider"
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
            className="rounded-lg border border-zinc-300 bg-white p-2 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {providers.length === 0 ? (
              <option value={FALLBACK_PROVIDER}>Pollinations (loading…)</option>
            ) : (
              providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>
                  {p.label}
                  {p.id === defaultProvider ? " — default" : ""}
                  {!p.available ? " — unavailable" : ""}
                </option>
              ))
            )}
          </select>
          {currentProvider?.whyUnavailable && !currentProvider.available && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {currentProvider.whyUnavailable}
            </p>
          )}
          {currentProvider && (
            <p className="text-xs text-zinc-500">
              Model: <span className="font-mono">{currentProvider.modelLabel}</span>
              {!currentProvider.supportsReference && (
                <>
                  {" · "}
                  No reference-image conditioning (character identity in Phase 2 will rely on
                  prompt + seed reuse, not native consistency).
                </>
              )}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="description"
            className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Character description
          </label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={5}
            placeholder="A small green dragon with red eyes, leather wings, and a fierce expression."
            className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm leading-relaxed text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <div className="flex justify-between text-xs text-zinc-500">
            <span>Minimum 10 characters.</span>
            <span
              className={
                charCount > 500
                  ? "text-red-600"
                  : charCount < 10 && charCount > 0
                    ? "text-amber-600"
                    : ""
              }
            >
              {charCount}/500
            </span>
          </div>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Style
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {STYLES.map((s) => (
              <label
                key={s}
                className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors ${
                  style === s
                    ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-900"
                    : "border-zinc-300 hover:border-zinc-500 dark:border-zinc-700 dark:hover:border-zinc-500"
                }`}
              >
                <input
                  type="radio"
                  name="style"
                  value={s}
                  checked={style === s}
                  onChange={() => setStyle(s)}
                  className="sr-only"
                />
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {STYLE_LABELS[s]}
                </span>
                <span className="text-xs text-zinc-600 dark:text-zinc-400">
                  {STYLE_DESCRIPTIONS[s]}
                </span>
                <span className="text-xs text-zinc-500">
                  PPU {PPU_BY_STYLE[s]} · Filter {FILTER_MODE_BY_STYLE[s]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Chroma-key background
          </legend>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setChromaColor("#00FF00")}
              className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                chromaColor === "#00FF00"
                  ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-900"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <span
                aria-hidden
                className="h-4 w-4 rounded"
                style={{ backgroundColor: "#00FF00" }}
              />
              Green (default)
            </button>
            <button
              type="button"
              onClick={() => setChromaColor("#FF00FF")}
              className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors ${
                chromaColor === "#FF00FF"
                  ? "border-zinc-900 bg-zinc-50 dark:border-zinc-50 dark:bg-zinc-900"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <span
                aria-hidden
                className="h-4 w-4 rounded"
                style={{ backgroundColor: "#FF00FF" }}
              />
              Magenta
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Use magenta when your character has prominent green elements (a green hood, green
            scales, etc.) so the chroma key won&apos;t cut into the character.
          </p>
        </fieldset>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate}
          className="rounded-lg bg-zinc-900 py-3 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200 dark:disabled:bg-zinc-700"
        >
          {loading ? "Generating…" : result ? "Regenerate" : "Generate base character"}
        </button>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Preview</h2>
        <div
          className="aspect-square w-full overflow-hidden rounded-lg border border-zinc-300 dark:border-zinc-700"
          style={{
            backgroundImage:
              "linear-gradient(45deg, #e5e5e5 25%, transparent 25%), linear-gradient(-45deg, #e5e5e5 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e5e5e5 75%), linear-gradient(-45deg, transparent 75%, #e5e5e5 75%)",
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 0 10px, 10px -10px, 10px 0",
          }}
        >
          {loading ? (
            <div className="flex h-full items-center justify-center text-sm text-zinc-600">
              <div className="flex flex-col items-center gap-2">
                <div
                  aria-hidden
                  className="h-8 w-8 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700"
                />
                <span>
                  Generating via {currentProvider?.label.split(" (")[0] ?? provider}…
                </span>
              </div>
            </div>
          ) : result ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={result.image}
              alt="Generated base character"
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
              Your generated sprite will appear here on a transparency-pattern background.
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
          >
            <p className="font-medium">
              {error.error === "validation_failed"
                ? "Validation failed"
                : error.error === "safety"
                  ? "Content blocked by safety filter"
                  : error.error === "rate_limited" || error.error === "rate_limit"
                    ? `Rate limit hit${error.scope ? ` (${error.scope})` : ""}`
                    : error.error === "timeout"
                      ? "Generation timed out"
                      : error.error === "provider_unavailable"
                        ? "Provider not configured"
                        : "Generation failed"}
            </p>
            {error.message && <p className="mt-1">{error.message}</p>}
            {error.retryAfterSeconds && (
              <p className="mt-1 text-xs">Retry after {error.retryAfterSeconds} seconds.</p>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <dt className="font-medium text-zinc-500">Size</dt>
                <dd>
                  {result.meta.width} × {result.meta.height} px
                </dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">PPU</dt>
                <dd>{result.meta.ppu}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Style</dt>
                <dd>{STYLE_LABELS[result.meta.style]}</dd>
              </div>
              <div>
                <dt className="font-medium text-zinc-500">Provider</dt>
                <dd className="truncate">{result.meta.provider}</dd>
              </div>
              <div className="col-span-2">
                <dt className="font-medium text-zinc-500">Model</dt>
                <dd className="truncate font-mono">{result.meta.model}</dd>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <a
                href={result.image}
                download={`base_character.png`}
                className="rounded-md bg-zinc-900 px-3 py-1.5 font-medium text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900"
              >
                Download PNG
              </a>
              {!accepted ? (
                <button
                  type="button"
                  onClick={handleAccept}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  Accept as base
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                >
                  Clear accepted base
                </button>
              )}
            </div>
            {accepted && (
              <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                ✓ Saved as the project base character. Action sheets will use this in Phase 2.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
