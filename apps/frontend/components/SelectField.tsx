import type { SelectHTMLAttributes } from 'react';

export function SelectField(
  props: SelectHTMLAttributes<HTMLSelectElement> & { label: string },
): React.ReactElement {
  const { label, id, className = '', children, ...rest } = props;
  const sid = id ?? rest.name;
  return (
    <label className="block space-y-1.5 text-sm">
      <span className="text-[var(--moble-muted)]">{label}</span>
      <select
        id={sid}
        className={`premium-input text-[var(--moble-black)] ${className}`}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}
