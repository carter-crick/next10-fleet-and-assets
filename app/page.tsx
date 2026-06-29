import Link from "next/link"

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-xl w-full space-y-8 text-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Fleet & Assets</h1>
          <p className="mt-2 text-gray-500">Select a company to manage fleet</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <CompanyCard
            href="/balanced-comfort"
            name="Balanced Comfort"
            description="Vehicles · Equipment · Trailers"
            colorClass="bg-[#002D5B] hover:bg-[#003875]"
          />
          <CompanyCard
            href="/sailors-air"
            name="Sailor's Air & Plumbing"
            description="Vehicles · Equipment · Trailers"
            colorClass="bg-teal-700 hover:bg-teal-800"
          />
        </div>
      </div>
    </main>
  )
}

function CompanyCard({
  href,
  name,
  description,
  colorClass,
}: {
  href: string
  name: string
  description: string
  colorClass: string
}) {
  return (
    <Link
      href={href}
      className={`${colorClass} text-white rounded-xl p-6 text-left block transition-colors shadow-sm`}
    >
      <p className="text-lg font-semibold">{name}</p>
      <p className="mt-1 text-sm opacity-80">{description}</p>
      <p className="mt-4 text-sm font-medium opacity-90">Manage fleet →</p>
    </Link>
  )
}
