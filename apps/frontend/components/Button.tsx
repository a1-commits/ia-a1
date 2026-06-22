import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: 'primary' | 'accent' | 'ghost';
};

const VARIANT_CLASS = {
  primary: 'premium-button',
  accent: 'premium-button premium-button-accent',
  ghost: 'premium-button premium-button-ghost',
} as const;

export function Button({
  children,
  className = '',
  variant = 'primary',
  type = 'button',
  ...props
}: ButtonProps): React.ReactElement {
  return (
    <button type={type} className={`${VARIANT_CLASS[variant]} disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props}>
      {children}
    </button>
  );
}
