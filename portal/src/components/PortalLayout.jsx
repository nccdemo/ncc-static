import { Outlet } from 'react-router-dom'

import PortalNav from './PortalNav.jsx'

export default function PortalLayout() {
  return (
    <>
      <PortalNav />
      <Outlet />
    </>
  )
}
