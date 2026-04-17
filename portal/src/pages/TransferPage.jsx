import { useState } from "react";
import { Link } from "react-router-dom";
import Button from "../components/Button.jsx";
import Input from "../components/Input.jsx";

export default function TransferPage() {
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [passengers, setPassengers] = useState("1");

  function handleSubmit(e) {
    e.preventDefault();
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white">
        <div className="mx-auto flex max-w-md items-center gap-4 px-4 py-3">
          <Link
            to="/explore"
            className="text-sm font-semibold text-blue-600 transition hover:text-blue-800"
          >
            Back
          </Link>
          <span className="text-sm font-medium text-neutral-500">Transfer</span>
        </div>
      </header>

      <main className="mx-auto max-w-md px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
          Book a Transfer
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Enter your trip details to find available drivers.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
          <Input
            label="Pickup"
            name="pickup"
            value={pickup}
            onChange={(e) => setPickup(e.target.value)}
            placeholder="Address or place"
            autoComplete="street-address"
          />
          <Input
            label="Destination"
            name="destination"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="Where to?"
            autoComplete="off"
          />
          <Input
            label="Date"
            name="date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <Input
            label="Passengers"
            name="passengers"
            type="number"
            min={1}
            max={16}
            value={passengers}
            onChange={(e) => setPassengers(e.target.value)}
          />
          <div className="pt-2">
            <Button type="submit" variant="primary">
              Search drivers
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
