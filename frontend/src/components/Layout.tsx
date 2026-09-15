import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './Sidebar'
import RoleSwitcher from './RoleSwitcher'
import { roles, type RoleId } from '../config/navigation'

export default function Layout() {
  const [activeRole, setActiveRole] = useState<RoleId>('coach')
  const location = useLocation()
  const navigate = useNavigate()
  const roleConfig = roles[activeRole]

  const currentItem =
    roleConfig.items.find((item) => item.path === location.pathname) ?? roleConfig.items[0]

  const handleRoleChange = (role: RoleId) => {
    setActiveRole(role)
    navigate(roles[role].items[0].path)
  }

  return (
    <div className="flex h-screen bg-slate-50">
      <Sidebar roleConfig={roleConfig} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
          <h1 className="text-lg font-semibold text-slate-900">{currentItem.label}</h1>
          <RoleSwitcher activeRole={activeRole} onRoleChange={handleRoleChange} />
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
