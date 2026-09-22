export default function OfferUnavailablePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="max-w-sm space-y-2 text-center">
        <h1 className="text-lg font-semibold text-ink">This offer is no longer available</h1>
        <p className="text-sm text-muted">
          It may have expired or reached its daily cap. Go back to see your other options.
        </p>
      </div>
    </main>
  );
}
