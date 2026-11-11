import { logoutAction } from '@/app/(auth)/actions'
import { Button } from '@/components/ui/button'

export function LogoutButton({ className }: { className?: string }) {
  return (
    <form action={logoutAction} className={className}>
      <Button type="submit" variant="outline">
        Log out
      </Button>
    </form>
  )
}
