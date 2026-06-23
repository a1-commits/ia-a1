import { Card } from './Card';

type MetricCardProps = {
  label: string;
  value: string | number;
  hint?: string;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
};

const DOT_CLASS = {
  neutral: 'bg-[var(--moble-muted)]',
  accent: 'bg-[var(--moble-accent)]',
  success: 'bg-[var(--moble-success)]',
  warning: 'bg-[var(--moble-warning)]',
  danger: 'bg-[var(--moble-danger)]',
} as const;

export function MetricCard({ label, value, hint, tone = 'neutral' }: MetricCardProps): React.ReactElement {
  return (
    <Card className="group">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--moble-muted)]">{label}</span>
        <span className={`h-2 w-2 rounded-full ${DOT_CLASS[tone]}`} />
      </div>
      <div className="text-3xl font-bold tracking-tight text-[var(--fg)]">{value}</div>
      {hint && <p className="mt-2 text-sm text-[var(--moble-muted)]">{hint}</p>}
    </Card>
  );
}
