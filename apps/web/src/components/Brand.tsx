export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className="brand-mark" aria-hidden="true">
      <defs>
        <linearGradient id="sc-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#9333EA" />
          <stop offset="1" stopColor="#7925D9" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="#0E0E12" stroke="#2A2238" />
      <path d="M32 12c-4.6 0-8 3.9-8 8.8 0 2.6-.9 5-2.6 6.9l-2.1 2.4h25.4l-2.1-2.4c-1.7-1.9-2.6-4.3-2.6-6.9 0-4.9-3.4-8.8-8-8.8z" fill="url(#sc-grad)" />
      <circle cx="32" cy="13.4" r="3.4" fill="#CBA7FF" />
      <rect x="17" y="33.5" width="30" height="4.6" rx="2.2" fill="#CBA7FF" opacity="0.92" />
      <rect x="14" y="41" width="36" height="5.4" rx="2.4" fill="url(#sc-grad)" />
      <rect x="19" y="49" width="26" height="3" rx="1.5" fill="#5B3C8E" />
    </svg>
  );
}

export function BrandWordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05 }}>
      <span className="brand-name">SPEED CHESS</span>
      {!compact && <span className="brand-tag">Play · Learn · Compete</span>}
    </span>
  );
}
