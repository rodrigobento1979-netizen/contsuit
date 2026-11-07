import React from 'react';

interface ContSuiteLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'white' | 'dark' | 'brand';
  showSubtitle?: boolean;
  className?: string;
}

export const ContSuiteLogo: React.FC<ContSuiteLogoProps> = ({
  size = 'md',
  variant = 'brand',
  showSubtitle = true,
  className = '',
}) => {
  // Dimensions
  const emblemSizes = {
    sm: 'w-7 h-7',
    md: 'w-9 h-9',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const titleSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl',
  };

  const subtitleSizes = {
    sm: 'text-[9px] tracking-widest',
    md: 'text-[10px] tracking-widest',
    lg: 'text-xs tracking-widest',
    xl: 'text-xs tracking-[0.2em]',
  };

  const textColor =
    variant === 'white'
      ? 'text-white'
      : variant === 'dark'
      ? 'text-slate-900'
      : 'text-slate-900';

  const subtitleColor =
    variant === 'white'
      ? 'text-emerald-200'
      : 'text-emerald-600 font-bold';

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* SVG Emblem: Infinity loop + arrow cursor + ascending bars */}
      <div className={`relative shrink-0 ${emblemSizes[size]} flex items-center justify-center`}>
        <svg
          viewBox="0 0 100 65"
          className="w-full h-full drop-shadow-xs"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="csTealGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2dd4bf" />
              <stop offset="50%" stopColor="#0d9488" />
              <stop offset="100%" stopColor="#047857" />
            </linearGradient>
            <linearGradient id="csWhiteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f0fdfa" />
            </linearGradient>
          </defs>

          {/* Infinity Loop ribbon */}
          <path
            d="M 32,15 C 20,15 10,24 10,36 C 10,48 20,55 32,55 C 44,55 52,43 56,36 C 60,29 68,15 80,15 C 92,15 98,25 98,36 C 98,47 91,55 80,55 C 69,55 61,43 56,36"
            stroke={variant === 'white' ? '#ffffff' : 'url(#csTealGrad)'}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dynamic Pointer Arrow cutting upward to the top-right */}
          <path
            d="M 30,52 L 48,22 L 40,24 L 54,12 L 56,26 L 49,28 L 38,55 Z"
            fill={variant === 'white' ? '#ffffff' : '#0d9488'}
          />

          {/* Ascending 3-Bar Chart integrated into right loop */}
          <rect
            x="70"
            y="35"
            width="4.5"
            height="14"
            rx="1.5"
            fill={variant === 'white' ? '#ffffff' : '#14b8a6'}
          />
          <rect
            x="77"
            y="29"
            width="4.5"
            height="20"
            rx="1.5"
            fill={variant === 'white' ? '#ffffff' : '#0d9488'}
          />
          <rect
            x="84"
            y="22"
            width="4.5"
            height="27"
            rx="1.5"
            fill={variant === 'white' ? '#ffffff' : '#047857'}
          />
        </svg>
      </div>

      {/* Typography */}
      <div className="leading-tight flex flex-col justify-center">
        <div className={`font-black tracking-tight ${titleSizes[size]} ${textColor} flex items-center`}>
          <span>Cont</span>
          <span className={variant === 'white' ? 'text-teal-200' : 'text-emerald-600'}>Suite</span>
        </div>
        {showSubtitle && (
          <span className={`uppercase font-bold ${subtitleSizes[size]} ${subtitleColor} -mt-0.5`}>
            Contábil
          </span>
        )}
      </div>
    </div>
  );
};
