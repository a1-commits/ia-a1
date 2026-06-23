import type { ReactNode } from 'react';

export function PlatformCard({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm transition hover:border-[var(--primary)]/40 md:p-5 ${className}`}
    >
      {children}
    </div>
  );
}
