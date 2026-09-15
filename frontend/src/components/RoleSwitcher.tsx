import { roles, type RoleId } from '../config/navigation'

export default function RoleSwitcher({
  activeRole,
  onRoleChange,
}: {
  activeRole: RoleId
  onRoleChange: (role: RoleId) => void
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
      {(Object.keys(roles) as RoleId[]).map((roleId) => (
        <button
          key={roleId}
          onClick={() => onRoleChange(roleId)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeRole === roleId
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          {roles[roleId].label}
        </button>
      ))}
    </div>
  )
}
