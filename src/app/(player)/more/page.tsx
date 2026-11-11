import { LogoutButton } from '@/components/logout-button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { requireUser } from '@/server/session'

export default async function MorePage() {
  const user = await requireUser()
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">More</h1>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <div className="text-muted-foreground text-xs">Signed in as</div>
            <div className="font-semibold">{user.username}</div>
          </div>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  )
}
