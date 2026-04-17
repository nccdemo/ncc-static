import { Link } from "react-router-dom";

export default function PaymentSuccessPage() {
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-16 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Payment successful</h1>
        <p className="text-sm text-neutral-600">
          Thank you. Your card payment was completed. You will receive a confirmation if email
          was collected at checkout.
        </p>
        <Link
          to="/tours"
          className="inline-flex justify-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          Back to tours
        </Link>
      </main>
    </div>
  );
}
