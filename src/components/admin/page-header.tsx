export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <h1 className="text-xl font-semibold">{title}</h1>
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  )
}
