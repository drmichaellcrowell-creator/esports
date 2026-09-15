import PagePlaceholder from './PagePlaceholder'
import { findNavItem, type RoleId } from '../config/navigation'

export default function PlaceholderPage({ role, path }: { role: RoleId; path: string }) {
  return <PagePlaceholder item={findNavItem(role, path)} />
}
