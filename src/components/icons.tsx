type IconProps = {
  className?: string
}

export function SparkIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M8 1.5 9.4 6l4.6 2-4.6 2L8 14.5 6.6 10 2 8l4.6-2L8 1.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function ChevronDownIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="m4 6 4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CheckIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="m3.5 8.5 3 3 6-7"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="m4.5 4.5 7 7m0-7-7 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BoltIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" className={className}>
      <path
        d="M9 1.5 3.5 9H7l-.5 5.5L13 7H9.5L9 1.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
