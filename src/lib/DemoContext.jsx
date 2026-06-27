import { createContext, useContext, useState } from 'react'

const DemoContext = createContext({ isDemo: false, enterDemo: () => {}, exitDemo: () => {} })

export function DemoProvider({ children }) {
  const [isDemo, setIsDemo] = useState(() => sessionStorage.getItem('bidclear_demo') === '1')

  const enterDemo = () => {
    sessionStorage.setItem('bidclear_demo', '1')
    setIsDemo(true)
  }

  const exitDemo = () => {
    sessionStorage.removeItem('bidclear_demo')
    setIsDemo(false)
  }

  return (
    <DemoContext.Provider value={{ isDemo, enterDemo, exitDemo }}>
      {children}
    </DemoContext.Provider>
  )
}

export const useDemo = () => useContext(DemoContext)
