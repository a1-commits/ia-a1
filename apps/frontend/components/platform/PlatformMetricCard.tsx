import { PlatformCard } from './PlatformCard';

type PlatformMetricCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'primary' | 'success';
};

const DOT: Record<NonNullable<PlatformMetricCardProps['tone']>, string> = {
  neutral: 'bg-[var(--muted)]',
  primary: 'bg-[var(--primary)]',
  success: 'bg-[var(--success)]',
};

export function PlatformMetricCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: PlatformMetricCardProps): React.ReactElement {
  return (
    <PlatformCard>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-[var(--muted)]">{label}</span>
        <span className={`h-2 w-2 rounded-full ${DOT[tone]}`} />
      </div>
      <div className="text-2xl font-semibold tracking-tight text-[var(--fg)] md:text-3xl">{value}</div>
      {hint && <p className="mt-2 text-xs text-[var(--muted)]">{hint}</p>}
    </PlatformCard>
  );
}
