export default function OfferUnavailablePage() {
  return (
    <main className="flex-1 flex items-center justify-center p-6 bg-gray-50">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-semibold">This offer is no longer available</h1>
        <p className="text-gray-600 text-sm">
          It may have expired or reached its daily cap. Go back and check your other matches.
        </p>
      </div>
    </main>
  );
}
