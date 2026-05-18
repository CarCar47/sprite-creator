import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About — Sprite Creator",
  description:
    "How Sprite Creator works: providers, free-tier caveats, license, and a brief tech overview.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-4 py-12 text-zinc-800 dark:text-zinc-200">
      <header className="flex flex-col gap-2">
        <Link
          href="/"
          className="text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-700 dark:hover:text-zinc-300"
        >
          ← Back to Sprite Creator
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          About Sprite Creator
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          A free, self-hosted web app that turns a text description into a Unity-ready 2D
          character base plus seven animated action sheets. Built for indie game devs who
          want consistent characters without paying per image.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">What you get</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            A single transparent PNG of your base character with a JSON metadata sidecar
            (style, PPU, recommended filter mode, seed).
          </li>
          <li>
            Up to seven action sheets — idle, walk, run, jump, attack, hurt, death — each a
            horizontal strip of frames at 4 / 8 / 9 / 16-frame densities.
          </li>
          <li>
            Per-action JSON manifest with everything Unity&apos;s Sprite Editor needs:{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">frame_count</code>,{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">frame_width</code>,{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">columns</code>,{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">rows</code>,{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">fps</code>,{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">pivot</code>,{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">pixels_per_unit</code>,
            and a{" "}
            <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">frame_quality</code>{" "}
            array that flags suspect frames before you import them.
          </li>
          <li>
            One-click ZIP download bundling every PNG, every manifest, and a copy of the
            Unity import guide.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">Providers</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          The image-generation provider is pluggable. The dropdown on the homepage shows what
          is currently configured on this deployment.
        </p>
        <dl className="grid gap-3 text-sm">
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">
              HuggingFace FLUX.1-schnell
            </dt>
            <dd className="text-zinc-600 dark:text-zinc-400">
              Default when the deployment has an <code>HF_TOKEN</code>. Apache-2.0 licensed
              model, free monthly credits, ~9 seconds per image. Recommended.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">
              Pollinations (no token, fallback)
            </dt>
            <dd className="text-zinc-600 dark:text-zinc-400">
              Truly free, no signup. Community-run service that auto-routes among FLUX /
              Sana / SDXL. Quality is solid when it answers; expect ~2 of 3 requests to
              succeed on first try because of shared rate-limits across Vercel egress IPs.
              The route auto-retries once before surfacing an error.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-900 dark:text-zinc-100">
              Gemini 2.5 Flash Image
            </dt>
            <dd className="text-zinc-600 dark:text-zinc-400">
              Available with a paid Google Cloud project (billing enabled). Higher quality
              and the only provider with native multi-image reference support, which
              improves cross-frame identity preservation on action sheets. Not free as of
              May 2026.
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Honest quality notes
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>
            Background removal uses a tuned adaptive chroma key (detect the model&apos;s
            actual rendered background color, then key with the appropriate tolerance and
            two passes of alpha erosion). Real semantic segmentation via @imgly was ruled
            out because the deployable variants exceeded Vercel&apos;s 300 MB function
            limit. The chroma approach reaches ~95% of segmentation quality on
            subject-centered single-character outputs.
          </li>
          <li>
            On free providers without native multi-image reference, identity preservation
            across action frames lands around 50–60% per the engineering plan&apos;s
            target — meaningfully lower than Gemini&apos;s ~80% with reference. The seed
            is reused across base and action calls to nudge consistency higher, and the
            prompts restate the base character&apos;s description verbatim in every
            action.
          </li>
          <li>
            Free models occasionally bleed character pixels between grid cells. The route
            now ships a per-frame quality flag in the manifest so the UI can warn you
            before you import a noisy sheet. Hitting Regenerate usually resolves it on the
            next roll.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">
          Tech stack
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>Next.js 16 App Router, React 19, TypeScript strict + noUncheckedIndexedAccess</li>
          <li>Tailwind CSS 4</li>
          <li>
            <code>sharp</code> for raw-pixel chroma key, grid slicing, uniform-crop, and
            horizontal repack
          </li>
          <li>
            <code>zod</code> validators at every API boundary; <code>@upstash/ratelimit</code>{" "}
            with Upstash Redis for per-IP rate limiting that actually works across Vercel&apos;s
            stateless functions
          </li>
          <li>
            <code>jszip</code> for the client-side download bundle — no server round-trip
            required to package multiple files
          </li>
          <li>Vitest + Testing Library for unit and integration tests</li>
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-50">License & source</h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          MIT licensed. Source at{" "}
          <a
            className="text-zinc-900 underline underline-offset-4 hover:no-underline dark:text-zinc-50"
            href="https://github.com/CarCar47/sprite-creator"
          >
            github.com/CarCar47/sprite-creator
          </a>
          . Clone, deploy to your own Vercel, add your own <code>HF_TOKEN</code>, and you
          have your own free instance — no payment to anyone required for personal use.
        </p>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          When Gemini is the active provider, outputs carry Google&apos;s invisible SynthID
          provenance watermark — benign for game-development use but disclosed here for
          transparency. FLUX.1-schnell and Pollinations outputs carry no provenance marker.
        </p>
      </section>
    </main>
  );
}
