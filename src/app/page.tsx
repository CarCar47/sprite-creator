import { GenerateForm } from "@/components/GenerateForm";
import { ActionPanel } from "@/components/ActionPanel";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <div className="flex w-full max-w-5xl flex-col gap-2 pb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Sprite Creator
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Describe a character. Get a Unity-ready base sprite with a transparent background, then
          generate animated action sheets (idle, walk, run, jump, attack, hurt, death) and
          download everything as a Unity-importable ZIP.
        </p>
      </div>
      <GenerateForm />
      <ActionPanel />
      <footer className="mt-12 text-xs text-zinc-500">
        Free image providers · MIT licensed ·{" "}
        <a
          className="underline underline-offset-4 hover:text-zinc-700 dark:hover:text-zinc-300"
          href="/about"
        >
          About
        </a>{" "}
        ·{" "}
        <a
          className="underline underline-offset-4 hover:text-zinc-700 dark:hover:text-zinc-300"
          href="https://github.com/CarCar47/sprite-creator"
        >
          github.com/CarCar47/sprite-creator
        </a>
      </footer>
    </main>
  );
}
