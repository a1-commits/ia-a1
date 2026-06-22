import type { ReactNode } from 'react';

type BadgeProps = {
  children: ReactNode;
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
};

const TONE_CLASS = {
  neutral: 'border-[var(--moble-border)] bg-white text-[var(--moble-muted)]',
  accent: 'border-[var(--moble-accent)]/30 bg-[var(--moble-accent-soft)] text-[var(--moble-black)]',
  success: 'border-[var(--moble-success)]/20 bg-[var(--moble-success)]/10 text-[var(--moble-success)]',
  warning: 'border-[var(--moble-warning)]/20 bg-[var(--moble-warning)]/10 text-[var(--moble-warning)]',
  danger: 'border-[var(--moble-danger)]/20 bg-[var(--moble-danger)]/10 text-[var(--moble-danger)]',
} as const;

export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps): React.ReactElement {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold ${TONE_CLASS[tone]} ${className}`}>
      {children}
    </span>
  );
}
