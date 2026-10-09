import { setThemePreference, useTheme } from '../theme/theme';
import type { ThemePreference } from '../theme/theme';

const OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: JSX.Element }> = [
  {
    value: 'light',
    label: 'Light theme',
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    value: 'dark',
    label: 'Dark theme',
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20.5 14.1A8.5 8.5 0 1 1 9.9 3.5a6.6 6.6 0 0 0 10.6 10.6Z" />
      </svg>
    ),
  },
  {
    value: 'system',
    label: 'Match system theme',
    icon: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="12" rx="1.5" />
        <path d="M8 20h8M12 16v4" />
      </svg>
    ),
  },
];

/**
 * Light / dark / system switch. A small segmented control: the chosen mode
 * sits on a raised chip, and the choice is remembered across visits.
 */
export function ThemeToggle({ className = '' }: { readonly className?: string }): JSX.Element {
  const { preference } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={`inline-flex items-center gap-px p-[2px] rounded-[4px] border border-rule-2 bg-sunken ${className}`}
      data-testid="theme-toggle"
    >
      {OPTIONS.map((option) => {
        const checked = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={option.label}
            title={option.label}
            onClick={() => setThemePreference(option.value)}
            className={`w-6 h-6 inline-flex items-center justify-center rounded-[2px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-topic ${
              checked
                ? 'bg-panel text-ink-strong shadow-[0_1px_2px_rgb(var(--shadow)/0.12)]'
                : 'text-muted hover:text-ink-strong'
            }`}
            data-testid={`theme-${option.value}`}
          >
            {option.icon}
          </button>
        );
      })}
    </div>
  );
}
