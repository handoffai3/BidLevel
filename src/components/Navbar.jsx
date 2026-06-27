import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useDemo } from '../lib/DemoContext'

const links = [
  { key: 'dashboard', label: 'Dashboard', path: '/dashboard' },
  { key: 'projects', label: 'Projects', path: '/projects' },
  { key: 'reports', label: 'Reports', path: '/reports' },
  { key: 'settings', label: 'Settings', path: '/settings' },
]

export default function Navbar({ active }) {
  const navigate = useNavigate()
  const { isDemo, exitDemo } = useDemo()

  const handleLogout = async () => {
    if (isDemo) {
      exitDemo()
      navigate('/login')
      return
    }
    await supabase.auth.signOut()
    navigate('/login')
  }

  return (
    <nav className="w-full h-16 bg-white border-b border-gray-border flex items-center px-12 shrink-0">
      {/* Logo */}
      <div
        className="flex items-center gap-2 cursor-pointer mr-10"
        onClick={() => navigate('/dashboard')}
      >
        <div className="w-8 h-8 bg-brand-blue rounded-md flex items-center justify-center">
          <span className="text-white font-bold text-sm">BC</span>
        </div>
        <span className="text-charcoal font-bold text-lg">BidClear</span>
        {isDemo && (
          <span className="bg-brand-amber text-white text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ml-1">
            Demo
          </span>
        )}
      </div>

      {/* Nav Links */}
      <div className="flex items-center gap-8">
        {links.map(link => (
          <button
            key={link.key}
            onClick={() => navigate(link.path)}
            className={`relative pb-1 text-sm font-medium bg-transparent border-0 cursor-pointer transition-colors ${
              active === link.key
                ? 'text-brand-blue'
                : 'text-gray-text hover:text-charcoal'
            }`}
          >
            {link.label}
            {active === link.key && (
              <span className="absolute bottom-[-20px] left-0 right-0 h-[2px] bg-brand-blue" />
            )}
          </button>
        ))}
      </div>

      {/* Right side */}
      <div className="ml-auto flex items-center gap-4">
        <button
          onClick={handleLogout}
          className="text-gray-text text-sm bg-transparent border-0 cursor-pointer hover:text-charcoal transition-colors"
        >
          {isDemo ? 'Exit Demo' : 'Logout'}
        </button>
        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
          <span className="material-symbols-outlined text-gray-text text-xl">person</span>
        </div>
      </div>
    </nav>
  )
}
