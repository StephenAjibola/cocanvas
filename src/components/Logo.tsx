export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width="40"
        height="40"
        viewBox="0 0 285 280"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle
          cx="142.5"
          cy="136"
          r="130"
          fill="none"
          stroke="currentColor"
          strokeWidth="12"
        />
        <path
          d="M110,45 L110,225 M110,45 L205,25 M80,135 L180,135 M110,225 Q110,247 140,247"
          stroke="currentColor"
          strokeWidth="16"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-xl font-medium">Thinkframe</span>
    </div>
  )
}