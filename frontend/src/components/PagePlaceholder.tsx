import type { NavItem } from '../config/navigation'

export default function PagePlaceholder({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-indigo-50">
        <Icon className="h-10 w-10 text-indigo-500" />
      </div>
      <h2 className="mt-6 text-2xl font-bold text-slate-900">{item.label}</h2>
      <p className="mt-2 max-w-md text-slate-500">{item.description}</p>
      <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <p className="text-sm text-slate-400">
          This area is part of the application shell. Full functionality will be implemented from
          the authoritative implementation contract.
        </p>
      </div>
    </div>
  )
}
