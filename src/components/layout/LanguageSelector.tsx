'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Globe, Check } from 'lucide-react';
import { type Locale, locales, localeConfig, getLocalizedPath } from '@/lib/i18n/config';

export interface LanguageSelectorProps {
  currentLocale: Locale;
}

const LANGUAGE_PREFERENCE_KEY = 'pdfcraft-language-preference';

export function saveLanguagePreference(locale: Locale): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(LANGUAGE_PREFERENCE_KEY, locale);
  }
}

export function getLanguagePreference(): Locale | null {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(LANGUAGE_PREFERENCE_KEY);
    if (stored && locales.includes(stored as Locale)) {
      return stored as Locale;
    }
  }
  return null;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({ currentLocale }) => {
  const t = useTranslations('common.buttons');
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const currentConfig = localeConfig[currentLocale];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setFocusedIndex(-1);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  useEffect(() => {
    if (focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.focus();
    }
  }, [focusedIndex]);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      if (!prev) {
        const currentIndex = locales.indexOf(currentLocale);
        setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
      } else {
        setFocusedIndex(-1);
      }
      return !prev;
    });
  }, [currentLocale]);

  const handleButtonKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
      }
      const currentIndex = locales.indexOf(currentLocale);
      setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
    }
  }, [isOpen, currentLocale]);

  const handleLanguageSelect = useCallback((locale: Locale) => {
    saveLanguagePreference(locale);
    const newPath = getLocalizedPath(pathname, locale);
    router.push(newPath);
    setIsOpen(false);
    setFocusedIndex(-1);
  }, [pathname, router]);

  const handleOptionKeyDown = useCallback((event: React.KeyboardEvent, locale: Locale, index: number) => {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        handleLanguageSelect(locale);
        break;
      case 'ArrowDown':
        event.preventDefault();
        setFocusedIndex((prev) => (prev < locales.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : locales.length - 1));
        break;
      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setFocusedIndex(locales.length - 1);
        break;
      case 'Escape':
        event.preventDefault();
        setIsOpen(false);
        setFocusedIndex(-1);
        break;
      case 'Tab':
        setIsOpen(false);
        setFocusedIndex(-1);
        break;
    }
  }, [handleLanguageSelect]);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        onKeyDown={handleButtonKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={t('selectLanguage')}
        data-testid="language-selector-trigger"
        className={`
          flex items-center gap-1.5 h-9 px-2.5 rounded-lg text-sm font-medium
          text-[hsl(var(--color-muted-foreground))] hover:text-[hsl(var(--color-foreground))]
          hover:bg-[hsl(var(--color-muted))/0.5] transition-all
          ${isOpen ? 'bg-[hsl(var(--color-muted))/0.5] text-[hsl(var(--color-foreground))]' : ''}
        `}
      >
        <Globe className="h-4 w-4 shrink-0" strokeWidth={1.5} aria-hidden="true" />
        <span className="text-xs font-semibold tracking-wide">{currentConfig.shortCode}</span>
      </button>

      {isOpen && (
        <div
          className="absolute top-full right-0 mt-2 min-w-[200px] max-h-[min(24rem,calc(100vh-6rem))] overflow-y-auto py-1.5 bg-[hsl(var(--color-background))] border border-[hsl(var(--color-border))] rounded-xl shadow-lg z-50"
          role="listbox"
          aria-label={t('selectLanguage')}
          aria-activedescendant={focusedIndex >= 0 ? `language-option-${locales[focusedIndex]}` : undefined}
        >
          {locales.map((locale, index) => {
            const config = localeConfig[locale];
            const isSelected = locale === currentLocale;

            return (
              <button
                key={locale}
                id={`language-option-${locale}`}
                ref={(el) => { optionRefs.current[index] = el; }}
                onClick={() => handleLanguageSelect(locale)}
                onKeyDown={(e) => handleOptionKeyDown(e, locale, index)}
                className={`
                  flex items-center justify-between w-full px-3.5 py-2 text-sm text-left gap-3
                  transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--color-ring))]
                  ${isSelected
                    ? 'bg-[hsl(var(--color-primary)/0.08)] text-[hsl(var(--color-foreground))]'
                    : 'text-[hsl(var(--color-foreground))] hover:bg-[hsl(var(--color-muted))]'
                  }
                `}
                role="option"
                aria-selected={isSelected}
                tabIndex={focusedIndex === index ? 0 : -1}
                dir={config.direction}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="w-7 shrink-0 text-xs font-semibold text-[hsl(var(--color-muted-foreground))] tracking-wide">
                    {config.shortCode}
                  </span>
                  <span className="truncate">{config.nativeName}</span>
                </span>
                {isSelected && (
                  <Check className="h-4 w-4 shrink-0 text-[hsl(var(--color-primary))]" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;
