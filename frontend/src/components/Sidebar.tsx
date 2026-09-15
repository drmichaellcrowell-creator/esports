import { NavLink } from 'react-router-dom'
import { Gamepad2 } from 'lucide-react'
import type { RoleConfig } from '../config/navigation'

export default function Sidebar({ roleConfig }: { roleConfig: RoleConfig }) {
  return (
    <aside className="flex w-64 flex-col bg-slate-900">
      <div className="flex h-16 items-center gap-2 px-6">
        <Gamepad2 className="h-7 w-7 text-indigo-500" />
        <span className="text-lg font-bold text-white">Esports</span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {roleConfig.items.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === `/${roleConfig.id}`}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>
      <div className="border-t border-slate-800 p-4">
        <p className="text-xs text-slate-500">{roleConfig.label} View</p>
      </div>
    </aside>
  )
}
