'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col items-center justify-center bg-white px-4">
          <div className="text-center max-w-md">
            <div className="text-8xl font-extrabold text-red-500">500</div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">Application Error</h1>
            <p className="mt-2 text-gray-500">
              A critical error occurred. Our team has been notified.
            </p>
            <div className="mt-8 flex items-center justify-center gap-4">
              <button
                onClick={reset}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}