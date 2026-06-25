import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Signup() {
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [company, setCompany] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSignup = async (e) => {
    e.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Save profile
    if (authData.user) {
      await supabase.from('profiles').upsert({
        id: authData.user.id,
        full_name: fullName,
        company_name: company,
      })
    }

    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[560px] bg-white border border-gray-border rounded-xl p-10">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-6">
          <div className="w-8 h-8 bg-brand-blue rounded-md flex items-center justify-center">
            <span className="text-white font-bold text-sm">BL</span>
          </div>
          <span className="text-charcoal font-bold text-lg">BidLevel</span>
        </div>

        {/* Activated badge */}
        <div className="inline-flex items-center gap-1.5 bg-brand-green-light border border-brand-green-border text-brand-green text-xs font-semibold px-3 py-1 rounded-full mb-5">
          <span>✓</span> License Activated
        </div>

        {/* Headline */}
        <h1 className="text-[28px] font-bold text-charcoal mb-1">Set up your BidLevel workspace</h1>
        <p className="text-sm text-gray-text mb-8">Takes 2 minutes. Done once.</p>

        {/* Error */}
        {error && (
          <div className="bg-brand-red-light border border-brand-red-border rounded-lg px-4 py-3 mb-6">
            <p className="text-brand-red text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleSignup} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-1.5">Full Name</label>
            <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} className="w-full border border-gray-border rounded-xl px-4 py-3 text-sm text-charcoal outline-none focus:border-brand-blue transition-colors" placeholder="John Miller" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-1.5">Company Name</label>
            <input type="text" value={company} onChange={e => setCompany(e.target.value)} className="w-full border border-gray-border rounded-xl px-4 py-3 text-sm text-charcoal outline-none focus:border-brand-blue transition-colors" placeholder="Harbor Construction Group" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-1.5">Your Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border border-gray-border rounded-xl px-4 py-3 text-sm text-charcoal outline-none focus:border-brand-blue transition-colors" placeholder="you@company.com" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-1.5">Create Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-gray-border rounded-xl px-4 py-3 text-sm text-charcoal outline-none focus:border-brand-blue transition-colors" placeholder="••••••••" required />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-1.5">Confirm Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full border border-gray-border rounded-xl px-4 py-3 text-sm text-charcoal outline-none focus:border-brand-blue transition-colors" placeholder="••••••••" required />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-blue hover:bg-brand-blue-dark text-white font-semibold py-3 rounded-xl text-sm transition-colors disabled:opacity-60 cursor-pointer mt-2"
          >
            {loading ? 'Creating...' : 'Create Workspace →'}
          </button>
        </form>

        {/* Admin note */}
        <p className="text-center text-xs text-gray-text mt-6">
          You are the Admin. Invite team from Settings.
        </p>
      </div>
    </div>
  )
}
