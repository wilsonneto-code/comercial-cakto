import { createContext, useContext, useState, useEffect } from 'react'

interface SidebarCtx { open: boolean; toggle: () => void }
const Ctx = createContext<SidebarCtx>({ open: false, toggle: () => {} })

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(() => localStorage.getItem('sidebar_open') === '1')

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', open ? '220px' : '56px')
    localStorage.setItem('sidebar_open', open ? '1' : '0')
  }, [open])

  // init on mount
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', open ? '220px' : '56px')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <Ctx.Provider value={{ open, toggle: () => setOpen(p => !p) }}>{children}</Ctx.Provider>
}

export const useSidebar = () => useContext(Ctx)
