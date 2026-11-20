import { AdminMobileNav, AdminSidebar } from '@/components/admin/admin-nav'
import { LogoutButton } from '@/components/logout-button'
import { getAdminBadges } from '@/server/admin/overview'
import { requireAdmin } from '@/server/session'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  const badges = await getAdminBadges()
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <AdminSidebar badges={badges} role={admin.role} />
      <div className="min-w-0">
        <header className="border-border bg-background/95 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur">
          <AdminMobileNav badges={badges} role={admin.role} />
          <span className="text-sm font-medium">{admin.username}</span>
          <div className="ml-auto">
            <LogoutButton />
          </div>
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
