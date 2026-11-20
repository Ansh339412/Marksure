import React from 'react';

export type LogoVariant = 'full' | 'compact' | 'icon';
export type LogoTheme = 'light' | 'dark' | 'mono';
export type LogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | number;

const SIZE_MAP: Record<'xs' | 'sm' | 'md' | 'lg' | 'xl', number> = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 52,
  xl: 68,
};

export interface MarkSureLogoProps {
  variant?: LogoVariant;
  theme?: LogoTheme;
  size?: LogoSize;
  className?: string;
}

/**
 * MarkSure Custom Geometric Brand Identity ("The Merkle Leaf Folio")
 *
 * Combines:
 * 1. An architectural academic document folio with folded corner.
 * 2. Interconnected cryptographic record lines & Merkle tree leaf/root nodes.
 * 3. A precision verification checkmark locking into the root node.
 */
export function MarkSureLogo({
  variant = 'full',
  theme = 'light',
  size = 'md',
  className = '',
}: MarkSureLogoProps) {
  const px = typeof size === 'number' ? size : SIZE_MAP[size];

  const isMono = theme === 'mono';
  const isDark = theme === 'dark';

  const containerFill = isMono ? 'none' : isDark ? '#991B1B' : '#7F1D1D';
  const containerStroke = isMono ? '#18181B' : isDark ? '#B91C1C' : 'none';
  const folioStroke = isMono ? '#18181B' : '#FAF9F6';
  const nodeColor = isMono ? '#18181B' : '#FCA5A5';
  const checkStroke = isMono ? '#18181B' : '#FFFFFF';
  const rootDotColor = isMono ? '#18181B' : '#34D399';

  const wordPrimary = isDark ? 'text-white' : 'text-zinc-900';
  const wordAccent = isMono
    ? 'text-zinc-900'
    : isDark
    ? 'text-[#FCA5A5]'
    : 'text-[#7F1D1D]';
  const subText = isDark ? 'text-stone-400' : 'text-stone-500';

  const symbolSvg = (
    <svg
      width={px}
      height={px}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="shrink-0"
    >
      <rect
        x="2"
        y="2"
        width="44"
        height="44"
        rx="10"
        fill={containerFill}
        stroke={containerStroke}
        strokeWidth={isMono ? '2.5' : isDark ? '1' : '0'}
      />
      {/* Academic Folio Outline */}
      <path
        d="M13 9H28L35 16V36C35 37.6569 33.6569 39 32 39H13C11.3431 39 10 37.6569 10 36V12C10 10.3431 11.3431 9 13 9Z"
        stroke={folioStroke}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M28 9V16H35"
        stroke={folioStroke}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Cryptographic Record Lines & Merkle Leaf Node */}
      <line
        x1="15"
        y1="16"
        x2="23"
        y2="16"
        stroke={nodeColor}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <line
        x1="15"
        y1="22"
        x2="21"
        y2="22"
        stroke={nodeColor}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="15.5" cy="29.5" r="2" fill={nodeColor} />
      {/* Precision Verification Checkmark & Root Node */}
      <path
        d="M17.5 29.5L22 34L32 22"
        stroke={checkStroke}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="32" cy="22" r="2.1" fill={rootDotColor} />
    </svg>
  );

  if (variant === 'icon') {
    return (
      <span className={`inline-flex items-center ${className}`} title="MarkSure">
        {symbolSvg}
      </span>
    );
  }

  const titleScale =
    px >= 52
      ? 'text-2xl'
      : px >= 40
      ? 'text-xl'
      : px >= 32
      ? 'text-lg'
      : 'text-base';

  return (
    <span className={`inline-flex items-center gap-3 select-none ${className}`}>
      {symbolSvg}
      <span className="flex flex-col leading-none">
        <span className={`font-extrabold tracking-tight ${titleScale} ${wordPrimary}`}>
          Mark<span className={wordAccent}>Sure</span>
        </span>
        {variant === 'full' && (
          <span
            className={`font-mono text-[10px] font-semibold uppercase tracking-[0.15em] mt-1 ${subText}`}
          >
            Academic Ledger
          </span>
        )}
      </span>
    </span>
  );
}
