import { ActionForm } from '@/components/action-form'
import { ActionDialog } from '@/components/admin/action-dialog'
import { Field } from '@/components/admin/field'
import { PageHeader } from '@/components/admin/page-header'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatDateTime } from '@/lib/format'
import { requireAdmin } from '@/server/session'
import { listStaff } from '@/server/staff'

import {
  createManagerAction,
  disableStaffAction,
  enableStaffAction,
  resetStaffPasswordAction,
} from '../actions'

export default async function AdminStaffPage() {
  const admin = await requireAdmin('staff.manage')
  const staff = await listStaff(admin.id)

  return (
    <>
      <PageHeader title="Staff">
        <ActionDialog
          triggerLabel="Add manager"
          title="Add a manager"
          description="They sign in with this username and password. Share it with them privately."
          submitLabel="Add manager"
          action={createManagerAction}
        >
          <Field id="username" label="Username">
            <Input id="username" name="username" autoComplete="off" required />
          </Field>
          <Field id="password" label="Temporary password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </Field>
        </ActionDialog>
      </PageHeader>
      <Card className="max-w-3xl">
        <ul className="divide-border divide-y">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium break-all">{s.username}</span>
                <Badge variant="secondary">{s.role === 'SUPERADMIN' ? 'Superadmin' : 'Manager'}</Badge>
                {s.disabled && <Badge variant="destructive">Disabled</Badge>}
              </div>
              <span className="text-muted-foreground text-sm sm:ml-auto">
                {s.lastSeenAt ? `Last seen ${formatDateTime(s.lastSeenAt)}` : 'Never'}
              </span>
              {s.role === 'MANAGER' && (
                <div className="flex flex-wrap items-center gap-2">
                  {s.disabled ? (
                    <ActionForm
                      action={enableStaffAction.bind(null, s.id)}
                      submitLabel="Enable"
                      className="contents"
                    />
                  ) : (
                    <ActionForm
                      action={disableStaffAction.bind(null, s.id)}
                      submitLabel="Disable"
                      destructive
                      className="contents"
                      confirm={{
                        title: `Disable ${s.username}?`,
                        description: 'They are signed out and cannot log in until enabled again.',
                        actionLabel: 'Disable',
                      }}
                    />
                  )}
                  <ActionDialog
                    triggerLabel="Reset password"
                    title={`Reset password for ${s.username}`}
                    submitLabel="Reset password"
                    action={resetStaffPasswordAction.bind(null, s.id)}
                  >
                    <Field id={`newPassword-${s.id}`} label="New password">
                      <Input
                        id={`newPassword-${s.id}`}
                        name="newPassword"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                      />
                    </Field>
                  </ActionDialog>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </>
  )
}
