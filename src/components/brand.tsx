import { Spade } from "lucide-react";

export function Brand({ href = "#/", size = "md" }: { href?: string; size?: "md" | "lg" }) {
  const large = size === "lg";
  return (
    <a href={href} className="inline-flex items-center gap-3" aria-label="PrimePoker home">
      <Spade aria-hidden className={`${large ? "size-10" : "size-8"} fill-accent text-accent drop-shadow-[0_0_10px_rgb(227_180_90/0.45)]`} strokeWidth={1.5} />
      <span className={`${large ? "text-4xl" : "text-2xl"} font-extrabold tracking-tight`}>
        PRIME<span className="text-accent">POKER</span>
      </span>
    </a>
  );
}
