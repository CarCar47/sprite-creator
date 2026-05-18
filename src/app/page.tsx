export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 p-8 text-center dark:bg-zinc-950">
      <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Sprite Creator
      </h1>
      <p className="max-w-xl text-lg leading-relaxed text-zinc-600 dark:text-zinc-400">
        AI-powered sprite generator for Unity 2D. Phase 0 placeholder — base-character and
        action-sheet generation arrive in Phase 1.
      </p>
      <p className="text-sm text-zinc-500">
        <a
          className="underline underline-offset-4 hover:text-zinc-700 dark:hover:text-zinc-300"
          href="/api/health"
        >
          /api/health
        </a>
      </p>
    </main>
  );
}
