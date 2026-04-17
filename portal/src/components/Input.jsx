export default function Input({ label, id, className = "", ...props }) {
  const inputId = id || props.name;
  return (
    <div className="w-full">
      {label ? (
        <label
          htmlFor={inputId}
          className="mb-1.5 block text-sm font-medium text-neutral-700"
        >
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className={`w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-neutral-900 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/25 ${className}`}
        {...props}
      />
    </div>
  );
}
