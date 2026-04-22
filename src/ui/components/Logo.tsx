type Props = {
  height?: number
  className?: string
}

export function Logo({ height = 28, className }: Props) {
  const width = height * (180 / 40)
  return (
    <svg
      viewBox="0 0 180 40"
      width={width}
      height={height}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="SomeHUE"
    >
      <defs>
        <linearGradient id="logoHue" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff5fa8" />
          <stop offset="50%" stopColor="#9966ff" />
          <stop offset="100%" stopColor="#4d9aff" />
        </linearGradient>
      </defs>

      <g transform="translate(4 4)">
        <circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" strokeWidth="2.5" />
        <circle cx="22.5" cy="10.5" r="3.5" fill="url(#logoHue)" />
      </g>

      <g fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif" fontSize="22" dominantBaseline="middle">
        <text x="42" y="21" fill="currentColor" fontWeight="400" letterSpacing="-0.3">Some</text>
        <text x="100" y="21" fill="url(#logoHue)" fontWeight="700" letterSpacing="-0.3">HUE</text>
      </g>
    </svg>
  )
}
