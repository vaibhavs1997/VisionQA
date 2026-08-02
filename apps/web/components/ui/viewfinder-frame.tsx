/**
 * Wraps children in four corner brackets, echoing the scanner's own
 * bounding-box annotations around flagged UI elements. Color is set via
 * `text-*` on the wrapper (brackets use currentColor) so callers can tint
 * per context — e.g. text-signal for a healthy score, text-critical for a
 * failed scan.
 */
export function ViewfinderFrame({
  children,
  className = "",
  colorClassName = "text-line-strong",
}: {
  children: React.ReactNode;
  className?: string;
  colorClassName?: string;
}) {
  return (
    <div className={`viewfinder ${colorClassName} ${className}`}>
      <span className="vf-br" />
      <span className="vf-bl" />
      {children}
    </div>
  );
}
