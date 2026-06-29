import type { AssetStatus } from '@/lib/types'

const CONFIG: Record<AssetStatus, { label: string; className: string }> = {
  active:           { label: 'Active',          className: 'bg-green-100 text-green-700' },
  open:             { label: 'Open',            className: 'bg-blue-100 text-blue-700' },
  maintenance:      { label: 'In Maintenance',  className: 'bg-yellow-100 text-yellow-700' },
  'out-of-service': { label: 'Out of Service',  className: 'bg-red-100 text-red-700' },
  retired:          { label: 'Retired',         className: 'bg-gray-100 text-gray-500' },
}

export default function StatusBadge({ status }: { status: AssetStatus }) {
  const { label, className } = CONFIG[status]
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  )
}
