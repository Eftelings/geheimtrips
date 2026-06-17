import type { ButtonHTMLAttributes } from 'react';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

export function PillBtn({ variant = 'primary', size = 'md', fullWidth, className = '', children, ...rest }: Props) {
  const base = 'inline-flex items-center justify-center gap-2 font-ui font-semibold rounded-full transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none select-none';

  const variants: Record<string, string> = {
    primary:   'bg-[var(--color-amber)] text-white shadow-[var(--shadow-amber)] active:scale-95',
    secondary: 'bg-[var(--color-aubergine)] text-white active:scale-95',
    ghost:     'bg-[var(--color-bg-soft)] text-[var(--color-aubergine)] active:scale-95',
    danger:    'bg-[var(--color-danger)] text-white active:scale-95',
  };
  const sizes: Record<string, string> = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-5 py-2.5',
    lg: 'text-base px-6 py-3.5',
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
