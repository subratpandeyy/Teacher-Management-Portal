export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="space-y-3">
        <div className="h-8 w-72 rounded-lg bg-gray-200" />
        <div className="h-4 w-56 rounded-lg bg-gray-100" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <div className="h-3 w-20 rounded bg-gray-100" />
                <div className="h-8 w-16 rounded bg-gray-200" />
              </div>
              <div className="h-12 w-12 rounded-xl bg-gray-100" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gray-100" />
              <div className="space-y-1">
                <div className="h-4 w-32 rounded bg-gray-100" />
                <div className="h-3 w-24 rounded bg-gray-50" />
              </div>
            </div>
            <div className="h-64 rounded-xl bg-gray-50" />
          </div>
        ))}
      </div>
    </div>
  );
}
