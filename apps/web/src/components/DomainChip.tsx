import { DOMAIN_COLOR, DOMAIN_LABEL } from "@/lib/domains";

export function DomainChip({ domain, dark = false }: { domain: string; dark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        dark ? "bg-white/10 text-white/80" : "bg-ink/5 text-ink/70"
      }`}
    >
      <span
        className="inline-block h-2 w-2 rounded-full"
        style={{ background: DOMAIN_COLOR[domain] }}
      />
      {DOMAIN_LABEL[domain]}
    </span>
  );
}
