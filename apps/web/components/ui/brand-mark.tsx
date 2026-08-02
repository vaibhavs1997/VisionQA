/** The product mark: a viewfinder locking onto a flagged point — literally
 * what the scanner does to a broken element. Doubles as favicon-in-spirit. */
export function BrandMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    </svg>
  );
}
