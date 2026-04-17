/**
 * Shared shell for admin sections until APIs are wired.
 */
export default function AdminPlaceholderPage({ title, description }) {
  return (
    <main style={{ padding: '24px 20px 48px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ margin: '0 0 12px', fontSize: '1.35rem' }}>{title}</h1>
      <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem', maxWidth: 560 }}>
        {description}
      </p>
    </main>
  )
}
