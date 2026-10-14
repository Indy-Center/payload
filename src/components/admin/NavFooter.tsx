import React from 'react'

/** The foot of the sidebar: the disclaimer and copyright every Indy Center app carries. */
export const NavFooter = () => (
  <footer className="nav-footer">
    <p className="nav-footer__disclaimer">
      This site is not affiliated with the Federal Aviation Administration or any governing aviation
      body. All content contained herein is approved only for use on the VATSIM network.
    </p>
    <p className="nav-footer__copyright">Copyright {new Date().getFullYear()} Indy Center</p>
  </footer>
)
