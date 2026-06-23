import type { ReactNode } from 'react';

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}): React.ReactElement {
  return (
    <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div>
        {eyebrow && (
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--primary)]">
            {eyebrow}
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--fg)] md:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
