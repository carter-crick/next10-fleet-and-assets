'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { Company } from '@/lib/types'
import { signOutAction } from '@/app/actions'

const COMPANY_CONFIG = {
  'balanced-comfort': { name: 'Balanced Comfort', bgColor: 'bg-[#002D5B]', activeTab: 'bg-white text-[#002D5B]' },
  'sailors-air': { name: "Sailor's Air & Plumbing", bgColor: 'bg-[#0A344C]', activeTab: 'bg-[#F7941D] text-white' },
} as const

export default function CompanyNav({ company }: { company: Company }) {
  const pathname = usePathname()
  const { name, bgColor, activeTab } = COMPANY_CONFIG[company]
  const base = `/${company}`

  const tabs = [
    { label: 'Dashboard', href: base },
    { label: 'Vehicles', href: `${base}/vehicles` },
    { label: 'Equipment', href: `${base}/equipment` },
    { label: 'Trailers', href: `${base}/trailers` },
    { label: 'Drivers', href: `${base}/drivers` },
    { label: 'Map',     href: `${base}/map`     },
    { label: 'Fuel',    href: `${base}/fuel`    },
  ]

  function isActive(href: string) {
    if (href === base) return pathname === base
    return pathname.startsWith(href) && !pathname.startsWith(`${base}/add`) && !isUUID(pathname.split('/').pop() ?? '')
  }

  return (
    <header className={`${bgColor} text-white px-6 py-4`}>
      <div className="max-w-6xl mx-auto flex items-center gap-4 flex-wrap">
        <Link href="/" className="text-white/60 hover:text-white text-sm shrink-0">
          ← All companies
        </Link>
        <span className="text-white font-semibold text-sm shrink-0 hidden sm:inline">{name}</span>
        <nav className="flex gap-2 flex-wrap flex-1">
          {tabs.map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                isActive(tab.href)
                  ? activeTab
                  : 'text-white/80 hover:text-white hover:bg-white/20'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        <Link
          href={`${base}/add`}
          className="shrink-0 px-4 py-1.5 rounded-full text-sm font-medium bg-white/20 hover:bg-white/30 transition-colors whitespace-nowrap"
        >
          + Add Asset
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="shrink-0 px-3 py-1 rounded-full text-sm font-medium text-white/80 hover:text-white hover:bg-white/20 transition-colors whitespace-nowrap"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  )
}

function isUUID(str: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(str)
}
