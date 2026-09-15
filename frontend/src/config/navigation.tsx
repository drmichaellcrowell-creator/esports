import {
  LayoutDashboard,
  Users,
  Calendar,
  Trophy,
  User,
  Package,
  Home,
  TrendingUp,
  Building2,
  Settings,
  type LucideIcon,
} from 'lucide-react'

export type RoleId = 'coach' | 'player' | 'admin'

export interface NavItem {
  label: string
  path: string
  icon: LucideIcon
  description: string
}

export interface RoleConfig {
  id: RoleId
  label: string
  items: NavItem[]
}

export const roles: Record<RoleId, RoleConfig> = {
  coach: {
    id: 'coach',
    label: 'Coach',
    items: [
      {
        label: 'Command Center',
        path: '/coach',
        icon: LayoutDashboard,
        description: 'Overview of your teams, upcoming events, and key metrics at a glance.',
      },
      {
        label: 'Teams',
        path: '/coach/teams',
        icon: Users,
        description: 'Manage your team rosters and team information.',
      },
      {
        label: 'Schedule',
        path: '/coach/schedule',
        icon: Calendar,
        description: 'View and manage practices, events, and competitions.',
      },
      {
        label: 'Competition',
        path: '/coach/competition',
        icon: Trophy,
        description: 'Track competitions, matches, and results.',
      },
      {
        label: 'Players',
        path: '/coach/players',
        icon: User,
        description: 'Manage player profiles and development.',
      },
      {
        label: 'Equipment',
        path: '/coach/equipment',
        icon: Package,
        description: 'Track and manage team equipment inventory.',
      },
    ],
  },
  player: {
    id: 'player',
    label: 'Player',
    items: [
      {
        label: 'Player HQ',
        path: '/player',
        icon: Home,
        description: 'Your personal dashboard and overview.',
      },
      {
        label: 'My Team',
        path: '/player/my-team',
        icon: Users,
        description: 'View your team roster and teammates.',
      },
      {
        label: 'Schedule',
        path: '/player/schedule',
        icon: Calendar,
        description: 'View upcoming practices and events.',
      },
      {
        label: 'Development',
        path: '/player/development',
        icon: TrendingUp,
        description: 'Track your goals and player development progress.',
      },
    ],
  },
  admin: {
    id: 'admin',
    label: 'Administration',
    items: [
      {
        label: 'Organization',
        path: '/admin',
        icon: Building2,
        description: 'Manage organization settings and structure.',
      },
      {
        label: 'People',
        path: '/admin/people',
        icon: Users,
        description: 'Manage members, roles, and permissions.',
      },
      {
        label: 'Settings',
        path: '/admin/settings',
        icon: Settings,
        description: 'Configure platform settings and preferences.',
      },
    ],
  },
}

export function findNavItem(role: RoleId, path: string): NavItem {
  return roles[role].items.find((item) => item.path === path) ?? roles[role].items[0]
}
