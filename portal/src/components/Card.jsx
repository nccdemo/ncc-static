export default function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-xl bg-white p-4 shadow-md ring-1 ring-black/5 ${className}`}
    >
      {children}
    </div>
  );
}
