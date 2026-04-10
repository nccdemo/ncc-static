export default function BnbPage() {
  return (
    <div
      style={{
        padding: '60px',
        color: 'white',
        textAlign: 'center',
      }}
    >
      <h1>Guadagna con San Culino</h1>
      <p>Porta clienti e guadagna su ogni prenotazione.</p>

      <button
        style={{
          marginTop: '20px',
          padding: '12px 20px',
          fontSize: '16px',
          cursor: 'pointer',
        }}
        onClick={() => (window.location.href = '/register-bnb')}
      >
        Registrati ora
      </button>
    </div>
  )
}

