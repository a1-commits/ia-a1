import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}): React.ReactElement {
  return (
    <div
      className={`rounded-xl border border-[var(--border)] bg-white p-4 shadow-sm md:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
