export function Brand({ href = "#/" }: { href?: string }) {
  return (
    <a href={href} className="inline-flex items-center gap-2.5">
      <span className="grid size-8 -rotate-6 place-items-center rounded-lg border border-accent/60 bg-accent-dim font-serif text-lg font-bold text-accent">F</span>
      <span className="font-serif text-2xl font-bold tracking-tight">Felt<span className="text-accent">.</span></span>
    </a>
  );
}
