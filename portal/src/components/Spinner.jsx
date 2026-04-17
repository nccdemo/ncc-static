export default function Spinner({ className = "" }) {
  return (
    <div
      className={`h-9 w-9 animate-spin rounded-full border-2 border-neutral-200 border-t-blue-600 ${className}`}
      role="status"
      aria-label="Loading"
    />
  );
}
