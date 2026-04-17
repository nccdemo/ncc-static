export default function Button({
  children,
  type = "button",
  variant = "primary",
  className = "",
  disabled,
  ...props
}) {
  const variants = {
    primary:
      "bg-blue-600 text-white shadow-sm hover:bg-blue-700 hover:shadow-md",
    secondary:
      "border border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50",
  };
  const v = variants[variant] || variants.primary;
  return (
    <button
      type={type}
      disabled={disabled}
      className={`w-full rounded-xl px-4 py-3 text-center text-sm font-semibold transition hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 ${v} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
