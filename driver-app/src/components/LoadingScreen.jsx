export default function LoadingScreen({ className = '' }) {
  return (
    <div className={`loading-screen ${className}`.trim()}>
      <div className="loading-content">
        <h1>NCC Driver</h1>
        <div className="dots" aria-label="Loading" role="status">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  )
}

