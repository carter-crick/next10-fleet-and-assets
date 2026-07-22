import Link from "next/link"
import { signOutAction } from "./actions"

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col">

      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
          </div>
          <span className="text-sm font-semibold text-gray-900">Fleet & Assets</span>
          <span className="text-xs text-gray-400 hidden sm:inline">by Next10</span>
        </div>
        <form action={signOutAction}>
          <button type="submit" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
            Sign out
          </button>
        </form>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl space-y-6">

          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">Select a Company</h1>
            <p className="mt-1 text-sm text-gray-500">Manage vehicles, equipment, and trailers</p>
          </div>

          {/* Balanced Comfort */}
          <Link href="/balanced-comfort" className="group block rounded-2xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="bg-[#002D5B] px-8 py-6 flex items-center justify-between">
              <div>
                <p className="text-white text-xl font-bold tracking-tight">Balanced Comfort</p>
                <p className="text-white/60 text-sm mt-0.5">Fresno, CA · HVAC & Plumbing</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-[#82C342] text-white text-xs font-semibold px-3 py-1 rounded-full">CA</span>
                <svg className="w-5 h-5 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="bg-white px-8 py-4 flex gap-6">
              <Stat icon="🚛" label="Vehicles" />
              <Stat icon="🔧" label="Equipment" />
              <Stat icon="🚚" label="Trailers" />
              <Stat icon="👤" label="Drivers" />
            </div>
          </Link>

          {/* Sailor's Air */}
          <Link href="/sailors-air" className="group block rounded-2xl overflow-hidden shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
            <div className="bg-[#0A344C] px-8 py-6 flex items-center justify-between">
              <div>
                <p className="text-white text-xl font-bold tracking-tight">Sailor&apos;s Air &amp; Plumbing</p>
                <p className="text-white/60 text-sm mt-0.5">Texas · HVAC & Plumbing</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="bg-[#F7941D] text-white text-xs font-semibold px-3 py-1 rounded-full">TX</span>
                <svg className="w-5 h-5 text-white/60 group-hover:text-white group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
            <div className="bg-white px-8 py-4 flex gap-6">
              <Stat icon="🚛" label="Vehicles" />
              <Stat icon="🔧" label="Equipment" />
              <Stat icon="🚚" label="Trailers" />
              <Stat icon="👤" label="Drivers" />
            </div>
          </Link>

        </div>
      </div>
    </main>
  )
}

function Stat({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-sm text-gray-500">
      <span>{icon}</span>
      <span>{label}</span>
    </div>
  )
}
