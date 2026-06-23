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
      className={`rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 transition hover:border-[var(--hover)] md:p-5 ${className}`}
    >
      {children}
    </div>
  );
}
