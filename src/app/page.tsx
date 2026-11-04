import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { getUser } from "@/lib/session";

const FEATURES = [
  { title: "Private groups", text: "Invite your regulars by username, email or a shareable link. Every group keeps its own history and ranking." },
  { title: "Game nights", text: "Schedule events, set a seat limit and see who is going, maybe or out, in real time." },
  { title: "Results & points", text: "Enter the final standings after the game. Points are awarded automatically for 4 to 7 players." },
  { title: "Live leaderboards", text: "Wins, podiums, average finish and points over time, always up to date." },
];

export default async function Home() {
  if (await getUser()) redirect("/dashboard");
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Brand />
        <div className="flex gap-2">
          <Link href="/login" className="btn btn-sm">Log in</Link>
          <Link href="/signup" className="btn btn-primary btn-sm">Sign up</Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="rise py-16 text-center sm:py-24">
          <p className="badge badge-accent mb-5">In-person Texas Hold&apos;em, tracked properly</p>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Your poker night.<br />
            <span className="text-accent">Your league.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-muted">
            Felt manages the people, the invitations, the results and the ranking. The cards, the chips and the bluffing stay at your table.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link href="/signup" className="btn btn-primary">Create your league</Link>
            <Link href="/login" className="btn">I have an account</Link>
          </div>
        </section>

        <section className="grid gap-4 pb-16 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="card">
              <h2 className="font-semibold text-accent">{feature.title}</h2>
              <p className="mt-1.5 text-sm text-muted">{feature.text}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-line py-6 text-center text-xs text-muted">
        Felt only tracks results. There is no online poker, betting or payments.
      </footer>
    </div>
  );
}
