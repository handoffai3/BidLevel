import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useDemo } from '../lib/DemoContext'

export default function Login() {
  const navigate = useNavigate()
  const { enterDemo } = useDemo()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  const handleTryDemo = () => {
    enterDemo()
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-bg flex items-center justify-center px-4">
      <div className="w-full max-w-[480px] bg-white border border-gray-border rounded-xl p-10">
        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 bg-brand-blue rounded-md flex items-center justify-center">
            <span className="text-white font-bold text-sm">BC</span>
          </div>
          <span className="text-charcoal font-bold text-lg">BidClear</span>
        </div>

        {/* Headline */}
        <h1 className="text-2xl font-bold text-charcoal mb-1">Sign in to your account</h1>
        <p className="text-sm text-gray-text mb-8">Built for construction estimators</p>

        {/* Error */}
        {error && (
          <div className="bg-brand-red-light border border-brand-red-border rounded-lg px-4 py-3 mb-6">
            <p className="text-brand-red text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleLogin}>
          {/* Email */}
          <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-1.5">
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full border border-gray-border rounded-xl px-4 py-3 text-sm text-charcoal mb-5 outline-none focus:border-brand-blue transition-colors"
            placeholder="you@company.com"
            required
          />

          {/* Password */}
          <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-1.5">
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full border border-gray-border rounded-xl px-4 py-3 text-sm text-charcoal mb-3 outline-none focus:border-brand-blue transition-colors"
            placeholder="••••••••"
            required
          />

          {/* Forgot */}
          <div className="flex justify-end mb-6">
            <button type="button" className="text-brand-blue text-sm bg-transparent border-0 cursor-pointer hover:underline">
              Forgot password?
            </button>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-blue hover:bg-brand-blue-dark text-white font-semibold py-3 rounded-xl text-sm transition-colors disabled:opacity-60 cursor-pointer"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-gray-border" />
          <span className="text-xs text-gray-text uppercase">or</span>
          <div className="flex-1 h-px bg-gray-border" />
        </div>

        {/* Try Demo */}
        <button
          onClick={handleTryDemo}
          className="w-full border-2 border-brand-blue text-brand-blue font-semibold py-3 rounded-xl text-sm bg-white hover:bg-brand-blue-light transition-colors cursor-pointer flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-lg">play_circle</span>
          Try Demo — No Account Needed
        </button>

        {/* Signup link */}
        <p className="text-center text-sm text-gray-text mt-6">
          Don't have an account?{' '}
          <button onClick={() => navigate('/signup')} className="text-brand-blue font-semibold bg-transparent border-0 cursor-pointer hover:underline">
            Create workspace
          </button>
        </p>

        {/* License note */}
        <p className="text-center text-xs text-gray-text mt-6">
          One-time license product. Contact admin for access.
        </p>
      </div>
    </div>
  )
}

