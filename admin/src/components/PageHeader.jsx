export default function PageHeader({ title, description }) {
  return (
    <header className="admin-page-header">
      <h1>{title}</h1>
      {description ? <p className="muted">{description}</p> : null}
    </header>
  )
}
