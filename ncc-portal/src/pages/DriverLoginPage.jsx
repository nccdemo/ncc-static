import LoginForm from '../components/Login.jsx'

/** Driver + B&amp;B unified portal login via API (drivers use ``drivers`` table). */
export default function DriverLoginPage() {
  return (
    <LoginForm
      title="NCC Portal"
      subtitle="Sign in with your driver or B&amp;B email and password."
      loginPath="/login"
      redirectTo="/"
      roleRedirects={{ bnb: '/dashboard/bnb', driver: '/' }}
      submitLabel="Sign in"
    />
  )
}
