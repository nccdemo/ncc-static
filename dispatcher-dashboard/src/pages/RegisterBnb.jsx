import { useState } from 'react'

export default function RegisterBnb() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/auth/register-bnb', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      })

      const data = await res.json()

      localStorage.setItem('token', data.access_token)

      window.location.href = 'http://localhost:5178'
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div
      style={{
        padding: '60px',
        color: 'white',
        textAlign: 'center',
      }}
    >
      <h1>Affiliazione B&amp;B</h1>
      <p>Registrati e inizia a guadagnare con le prenotazioni.</p>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ display: 'block', margin: '10px auto', padding: '10px' }}
      />

      <input
        placeholder="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ display: 'block', margin: '10px auto', padding: '10px' }}
      />

      <button
        type="button"
        onClick={handleSubmit}
        style={{
          marginTop: '20px',
          padding: '12px 20px',
          cursor: 'pointer',
        }}
      >
        Registrati
      </button>
    </div>
  )
}
