import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

const ROLES = ['estimator', 'admin']
const EXPORT_FORMATS = [
  { value: 'excel_and_pdf', label: 'Excel + PDF Summary' },
  { value: 'excel_only', label: 'Excel Only' },
  { value: 'pdf_only', label: 'PDF Only' },
]

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer border-0 shrink-0 ${value ? 'bg-brand-blue' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

function Toast({ msg, type = 'success' }) {
  if (!msg) return null
  const colors = { success: 'bg-brand-green-light border-brand-green text-brand-green', error: 'bg-brand-red-light border-brand-red text-brand-red' }
  return (
    <div className={`fixed top-4 right-4 z-50 border px-5 py-3 rounded-xl text-sm font-semibold shadow-lg ${colors[type]}`}>
      {msg}
    </div>
  )
}

export default function Settings() {
  const navigate = useNavigate()
  const logoRef = useRef(null)

  // Profile
  const [userId, setUserId] = useState(null)
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')

  // Settings
  const [settingsId, setSettingsId] = useState(null)
  const [reportHeader, setReportHeader] = useState('')
  const [includeRisk, setIncludeRisk] = useState(true)
  const [autoSend, setAutoSend] = useState(false)
  const [exportFormat, setExportFormat] = useState('excel_and_pdf')
  const [logoUrl, setLogoUrl] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)

  // Team
  const [team, setTeam] = useState([])
  const [invitations, setInvitations] = useState([])
  const [showInviteForm, setShowInviteForm] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('estimator')
  const [inviteError, setInviteError] = useState('')
  const [removingId, setRemovingId] = useState(null)

  // UI state
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState({ msg: '', type: 'success' })

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast({ msg: '', type: 'success' }), 3000)
  }

  // Unsaved changes warning
  useEffect(() => {
    const handler = (e) => { if (dirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  // Mark dirty on any field change
  const setField = (setter) => (val) => { setter(val); setDirty(true) }

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const uid = userData?.user?.id
      if (!uid) return
      setUserId(uid)

      // Profile
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', uid).single()
      if (profile) {
        setFullName(profile.full_name || '')
        setCompanyName(profile.company_name || '')
      }

      // Settings
      const { data: settings } = await supabase.from('settings').select('*').eq('user_id', uid).single()
      if (settings) {
        setSettingsId(settings.id)
        setReportHeader(settings.report_header || '')
        setIncludeRisk(settings.include_risk_flags ?? true)
        setAutoSend(settings.auto_send_to_pm ?? false)
        setExportFormat(settings.default_export_format || 'excel_and_pdf')
        setLogoUrl(settings.logo_url || null)
        setLogoPreview(settings.logo_url || null)
      }

      // Team members (same company)
      if (profile?.company_name) {
        const { data: members } = await supabase.from('profiles')
          .select('id, full_name, email, role').eq('company_name', profile.company_name)
        setTeam(members || [])
      }

      // Pending invitations
      const { data: invites } = await supabase.from('invitations')
        .select('*').eq('invited_by', uid).order('created_at', { ascending: false })
      setInvitations(invites || [])
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Update profile
      await supabase.from('profiles').update({ full_name: fullName, company_name: companyName }).eq('id', userId)

      // Upsert settings
      const payload = {
        user_id: userId,
        company_name: companyName,
        report_header: reportHeader,
        include_risk_flags: includeRisk,
        auto_send_to_pm: autoSend,
        default_export_format: exportFormat,
        logo_url: logoUrl,
        updated_at: new Date().toISOString(),
      }
      if (settingsId) {
        await supabase.from('settings').update(payload).eq('id', settingsId)
      } else {
        const { data } = await supabase.from('settings').insert(payload).select().single()
        if (data) setSettingsId(data.id)
      }

      setDirty(false)
      showToast('Settings saved ✓')
    } catch (err) {
      console.error(err)
      showToast('Failed to save settings', 'error')
    }
    setSaving(false)
  }

  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.match(/\.(png|svg)$/i)) { showToast('Only PNG or SVG allowed', 'error'); return }

    const path = `${userId}/logo.png`
    const { error } = await supabase.storage.from('logos').upload(path, file, { upsert: true })
    if (error) { showToast('Logo upload failed', 'error'); return }

    const { data: urlData } = supabase.storage.from('logos').getPublicUrl(path)
    setLogoUrl(urlData.publicUrl)
    setLogoPreview(urlData.publicUrl)
    await supabase.from('settings').upsert({ user_id: userId, logo_url: urlData.publicUrl, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    showToast('Logo updated ✓')
  }

  const handleRoleChange = async (memberId, newRole) => {
    await supabase.from('profiles').update({ role: newRole }).eq('id', memberId)
    setTeam(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    showToast('Role updated ✓')
  }

  const handleRemoveMember = async (member) => {
    if (!window.confirm(`Remove ${member.full_name} from your team? They will lose access immediately.`)) return
    setRemovingId(member.id)
    await supabase.from('profiles').update({ company_name: null }).eq('id', member.id)
    setTeam(prev => prev.filter(m => m.id !== member.id))
    setRemovingId(null)
    showToast('Team member removed')
  }

  const handleSendInvite = async () => {
    setInviteError('')
    if (!inviteEmail.trim()) { setInviteError('Email is required'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inviteEmail)) { setInviteError('Invalid email address'); return }
    if (team.some(m => m.email === inviteEmail) || invitations.some(i => i.email === inviteEmail && i.status === 'pending')) {
      setInviteError('This person is already in your team or has a pending invite')
      return
    }

    try {
      const { data: invite, error } = await supabase.from('invitations').insert({
        invited_by: userId,
        email: inviteEmail,
        role: inviteRole,
        status: 'pending',
      }).select().single()

      if (error) throw error

      // Fire edge function to send invite email (best-effort)
      supabase.functions.invoke('send-report', {
        body: {
          type: 'invite',
          to: inviteEmail,
          inviteId: invite.id,
          role: inviteRole,
        }
      }).catch(err => console.warn('Invite email failed (non-fatal):', err))

      setInvitations(prev => [invite, ...prev])
      setInviteEmail('')
      setInviteRole('estimator')
      setShowInviteForm(false)
      showToast('Invite sent ✓')
    } catch (err) {
      console.error(err)
      showToast('Failed to send invite', 'error')
    }
  }

  const handleCancelInvite = async (inviteId) => {
    await supabase.from('invitations').delete().eq('id', inviteId)
    setInvitations(prev => prev.filter(i => i.id !== inviteId))
    showToast('Invite cancelled')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-page-bg flex flex-col">
        <Navbar active="settings" />
        <div className="flex justify-center py-32">
          <span className="material-symbols-outlined text-brand-blue text-3xl animate-spin">sync</span>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
      <Navbar active="settings" />
      <Toast msg={toast.msg} type={toast.type} />

      <main className="flex-grow w-full max-w-[860px] mx-auto px-8 py-10 space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-[28px] font-bold text-charcoal mb-1">Settings</h1>
            <p className="text-sm text-gray-text">Manage your profile, team, and report preferences</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-5 py-2.5 rounded-lg cursor-pointer transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <span className="material-symbols-outlined text-base animate-spin">sync</span>}
            Save Changes
          </button>
        </div>

        {/* Unsaved banner */}
        {dirty && (
          <div className="bg-brand-amber-light border border-brand-amber-border rounded-xl px-5 py-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-brand-amber text-lg">warning</span>
            <p className="text-sm text-[#92400E] font-medium">You have unsaved changes</p>
          </div>
        )}

        {/* ── Section 1: Company Profile ──────────────────────────────────── */}
        <div className="bg-white border border-gray-border rounded-xl p-7">
          <h2 className="text-base font-bold text-charcoal mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-brand-blue text-xl">business</span>
            Company Profile
          </h2>

          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-2">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setField(setFullName)(e.target.value)}
                className="w-full border border-gray-border rounded-lg px-4 py-2.5 text-sm text-charcoal outline-none focus:border-brand-blue transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-2">Company Name</label>
              <input
                type="text"
                value={companyName}
                onChange={e => setField(setCompanyName)(e.target.value)}
                className="w-full border border-gray-border rounded-lg px-4 py-2.5 text-sm text-charcoal outline-none focus:border-brand-blue transition-colors"
              />
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-2">Default Report Header</label>
            <input
              type="text"
              value={reportHeader}
              onChange={e => setField(setReportHeader)(e.target.value)}
              className="w-full border border-gray-border rounded-lg px-4 py-2.5 text-sm text-charcoal outline-none focus:border-brand-blue transition-colors"
              placeholder="e.g. Prepared by Harbor Construction Group"
            />
            <p className="text-xs text-gray-text mt-1">This text appears at the top of every PDF export.</p>
          </div>

          {/* Logo */}
          <div>
            <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-3">Company Logo</label>
            <div className="flex items-center gap-5">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="w-16 h-16 object-contain border border-gray-border rounded-lg p-1 bg-white" />
              ) : (
                <div className="w-16 h-16 border-2 border-dashed border-gray-border rounded-lg flex items-center justify-center bg-brand-gray">
                  <span className="material-symbols-outlined text-gray-300 text-2xl">image</span>
                </div>
              )}
              <div>
                <button
                  onClick={() => logoRef.current?.click()}
                  className="text-sm font-semibold text-brand-blue bg-transparent border border-brand-blue rounded-lg px-4 py-2 cursor-pointer hover:bg-brand-blue hover:text-white transition-colors"
                >
                  {logoPreview ? 'Change Logo' : 'Upload Logo'}
                </button>
                <p className="text-xs text-gray-text mt-1">PNG or SVG only</p>
                <input ref={logoRef} type="file" accept=".png,.svg" className="hidden" onChange={handleLogoUpload} />
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 2: Report Defaults ──────────────────────────────────── */}
        <div className="bg-white border border-gray-border rounded-xl p-7">
          <h2 className="text-base font-bold text-charcoal mb-6 flex items-center gap-2">
            <span className="material-symbols-outlined text-brand-blue text-xl">tune</span>
            Report Defaults
          </h2>

          <div className="space-y-5">
            <div className="flex items-center justify-between py-3 border-b border-gray-border">
              <div>
                <p className="text-sm font-semibold text-charcoal">Include Risk Flags</p>
                <p className="text-xs text-gray-text mt-0.5">Show risk assessment row in Excel exports</p>
              </div>
              <Toggle value={includeRisk} onChange={setField(setIncludeRisk)} />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-gray-border">
              <div>
                <p className="text-sm font-semibold text-charcoal">Auto Send to PM</p>
                <p className="text-xs text-gray-text mt-0.5">Automatically email PDF after analysis completes</p>
              </div>
              <Toggle value={autoSend} onChange={setField(setAutoSend)} />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-semibold text-charcoal">Default Export Format</p>
                <p className="text-xs text-gray-text mt-0.5">What downloads when you click Export</p>
              </div>
              <select
                value={exportFormat}
                onChange={e => setField(setExportFormat)(e.target.value)}
                className="border border-gray-border rounded-lg px-3 py-2 text-sm text-charcoal outline-none focus:border-brand-blue bg-white cursor-pointer"
              >
                {EXPORT_FORMATS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Section 3: Team Members ─────────────────────────────────────── */}
        <div className="bg-white border border-gray-border rounded-xl p-7">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-base font-bold text-charcoal flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-blue text-xl">group</span>
              Team Members
            </h2>
            <button
              onClick={() => { setShowInviteForm(v => !v); setInviteError('') }}
              className="text-sm font-semibold text-brand-blue bg-transparent border border-brand-blue rounded-lg px-4 py-2 cursor-pointer hover:bg-brand-blue hover:text-white transition-colors flex items-center gap-1.5"
            >
              <span className="text-lg leading-none">+</span> Invite Team Member
            </button>
          </div>

          {/* Inline Invite Form */}
          {showInviteForm && (
            <div className="bg-brand-blue-light border border-brand-blue-border rounded-xl p-5 mb-5">
              <p className="text-xs font-semibold text-brand-blue uppercase mb-3">New Invitation</p>
              <div className="flex gap-3 items-start">
                <div className="flex-grow">
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={e => { setInviteEmail(e.target.value); setInviteError('') }}
                    placeholder="colleague@company.com"
                    className="w-full border border-gray-border rounded-lg px-4 py-2.5 text-sm text-charcoal outline-none focus:border-brand-blue transition-colors"
                  />
                  {inviteError && <p className="text-brand-red text-xs mt-1">{inviteError}</p>}
                </div>
                <select
                  value={inviteRole}
                  onChange={e => setInviteRole(e.target.value)}
                  className="border border-gray-border rounded-lg px-3 py-2.5 text-sm text-charcoal outline-none focus:border-brand-blue bg-white cursor-pointer shrink-0"
                >
                  {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                </select>
                <button
                  onClick={handleSendInvite}
                  className="bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-4 py-2.5 rounded-lg cursor-pointer transition-colors shrink-0"
                >
                  Send Invite
                </button>
              </div>
            </div>
          )}

          {/* Team Table */}
          {team.length === 0 && invitations.length === 0 ? (
            <p className="text-sm text-gray-text text-center py-8">No team members yet. Invite your first colleague.</p>
          ) : (
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-border">
                  {['Name', 'Email', 'Role', 'Status', 'Action'].map(h => (
                    <th key={h} className="py-3 px-4 text-xs font-semibold text-gray-text uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {team.map(m => (
                  <tr key={m.id} className="border-b border-gray-border hover:bg-brand-gray transition-colors">
                    <td className="py-3 px-4 font-semibold text-charcoal">{m.full_name || '—'}</td>
                    <td className="py-3 px-4 text-gray-text">{m.email || '—'}</td>
                    <td className="py-3 px-4">
                      <select
                        value={m.role || 'estimator'}
                        onChange={e => handleRoleChange(m.id, e.target.value)}
                        className="border border-gray-border rounded-lg px-2 py-1 text-xs text-charcoal outline-none focus:border-brand-blue bg-white cursor-pointer"
                      >
                        {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-green-light text-brand-green border border-brand-green-border">Active</span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleRemoveMember(m)}
                        disabled={removingId === m.id || m.id === userId}
                        className="text-xs font-semibold text-brand-red bg-transparent border-0 cursor-pointer hover:underline disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        {removingId === m.id ? 'Removing…' : m.id === userId ? 'You' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}

                {invitations.filter(i => i.status === 'pending').map(inv => (
                  <tr key={inv.id} className="border-b border-gray-border bg-brand-gray">
                    <td className="py-3 px-4 text-gray-text italic">—</td>
                    <td className="py-3 px-4 text-gray-text">{inv.email}</td>
                    <td className="py-3 px-4 text-xs text-gray-text capitalize">{inv.role}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200">Invited</span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleCancelInvite(inv.id)}
                        className="text-xs font-semibold text-gray-text bg-transparent border-0 cursor-pointer hover:text-brand-red hover:underline transition-colors"
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
