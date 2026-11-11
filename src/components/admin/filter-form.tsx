import { Button } from '@/components/ui/button'

/**
 * GET form for table filters: submitting loads `action` with the fields as search params
 * (page resets because it is not a field). `keep` carries params such as the current sort.
 */
export function FilterForm({
  action,
  keep,
  children,
}: {
  action: string
  keep?: Record<string, string | undefined>
  children: React.ReactNode
}) {
  return (
    <form
      method="get"
      action={action}
      className="bg-card border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-3"
    >
      {Object.entries(keep ?? {}).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      {children}
      <Button type="submit" variant="outline">
        Apply
      </Button>
    </form>
  )
}
