type EmptyStateProps = {
  title: string;
  description?: string;
};

export function EmptyState({ title, description }: EmptyStateProps): React.ReactElement {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--moble-border)] bg-white/70 p-6 text-center">
      <div className="mx-auto mb-3 h-2 w-12 rounded-full bg-[var(--moble-accent)]/60" />
      <h3 className="text-sm font-semibold text-[var(--moble-black)]">{title}</h3>
      {description && <p className="mt-1 text-sm text-[var(--moble-muted)]">{description}</p>}
    </div>
  );
}
