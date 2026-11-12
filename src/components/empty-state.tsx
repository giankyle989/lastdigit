export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground bg-card border-border rounded-xl border p-8 text-center">
      {children}
    </p>
  )
}
