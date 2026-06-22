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
      className={`rounded-2xl border border-[var(--moble-border)] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.04)] backdrop-blur transition hover:-translate-y-[1px] hover:shadow-[0_10px_28px_rgba(14,14,14,0.07)] md:p-6 ${className}`}
    >
      {children}
    </div>
  );
}
