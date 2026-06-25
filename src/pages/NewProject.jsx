import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

const TRADES = ['Electrical', 'Mechanical', 'Concrete', 'Plumbing', 'Steel', 'Other']
const ALLOWED_TYPES = ['.pdf', '.xlsx', '.xls', '.doc', '.docx']
const MAX_FILES = 10

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }) {
  const steps = ['PROJECT INFO', 'UPLOAD BIDS', 'REVIEW']
  return (
    <div className="flex items-center gap-3 mb-10">
      {steps.map((label, i) => {
        const num = i + 1
        const isDone = step > num
        const isActive = step === num
        return (
          <div key={num} className="flex items-center gap-2">
            {i > 0 && (
              <div className={`w-12 h-px ${isDone || isActive ? 'bg-brand-blue' : 'bg-gray-border'}`} />
            )}
            <div
              className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${
                isDone
                  ? 'bg-brand-green text-white'
                  : isActive
                  ? 'bg-brand-blue text-white'
                  : 'border-2 border-gray-border text-gray-text'
              }`}
            >
              {isDone ? '✓' : num}
            </div>
            <span
              className={`text-sm font-semibold ${
                isActive ? 'text-brand-blue' : 'text-gray-text'
              }`}
            >
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function NewProject() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)

  // Step 1
  const [projectName, setProjectName] = useState('')
  const [trade, setTrade] = useState('')
  const [clientName, setClientName] = useState('')
  const [projectNumber, setProjectNumber] = useState('')
  const [errors, setErrors] = useState({})
  const [step1Loading, setStep1Loading] = useState(false)

  // Step 2
  const [projectId, setProjectId] = useState(null)
  const [files, setFiles] = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const fileInputRef = useRef(null)

  // Step 3
  const [analyzing, setAnalyzing] = useState(false)

  // ── Step 1: Save project ────────────────────────────────────────────────────
  const handleStep1Next = async () => {
    const newErrors = {}
    if (!projectName.trim()) newErrors.projectName = 'Project name is required'
    if (!trade) newErrors.trade = 'Please select a trade package'
    if (Object.keys(newErrors).length) {
      setErrors(newErrors)
      return
    }
    setErrors({})
    setStep1Loading(true)

    try {
      const { data: userData } = await supabase.auth.getUser()
      const { data, error } = await supabase
        .from('projects')
        .insert({
          user_id: userData.user.id,
          project_name: projectName.trim(),
          trade_package: trade,
          client_name: clientName.trim() || null,
          project_number: projectNumber.trim() || null,
          status: 'processing',
        })
        .select()
        .single()

      if (error) throw error

      setProjectId(data.id)
      setStep(2)
    } catch (err) {
      console.error(err)
      alert('Failed to create project. Please try again.')
    } finally {
      setStep1Loading(false)
    }
  }

  // ── Step 2: Upload files ────────────────────────────────────────────────────
  const getFileType = (name) => {
    if (name.endsWith('.pdf')) return 'pdf'
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'excel'
    return 'doc'
  }

  const addFiles = async (incoming) => {
    setUploadError('')
    const newFileList = Array.from(incoming)

    // Type validation
    const invalid = newFileList.filter(
      (f) => !ALLOWED_TYPES.some((ext) => f.name.toLowerCase().endsWith(ext))
    )
    if (invalid.length) {
      setUploadError('Only PDF, Excel, Word allowed')
      return
    }

    // Count validation
    if (files.length + newFileList.length > MAX_FILES) {
      setUploadError(`Maximum ${MAX_FILES} files`)
      return
    }

    const entries = newFileList.map((file) => ({
      file,
      name: file.name,
      size: (file.size / (1024 * 1024)).toFixed(1) + ' MB',
      status: 'uploading',
      type: getFileType(file.name),
      bidId: null,
    }))

    setFiles((prev) => [...prev, ...entries])

    // Upload each file
    for (const entry of entries) {
      try {
        const { data: userData } = await supabase.auth.getUser()
        const filePath = `${userData.user.id}/${projectId}/${entry.name}`

        const { error: uploadError } = await supabase.storage
          .from('bid-files')
          .upload(filePath, entry.file, { upsert: true })

        if (uploadError) throw uploadError

        const { data: urlData } = supabase.storage
          .from('bid-files')
          .getPublicUrl(filePath)

        const { data: bidRow, error: bidError } = await supabase
          .from('bids')
          .insert({
            project_id: projectId,
            file_name: entry.name,
            file_url: urlData.publicUrl,
            company_name: entry.name
              .replace(/\.(pdf|xlsx?|docx?)$/i, '')
              .replace(/[_-]/g, ' '),
          })
          .select()
          .single()

        if (bidError) throw bidError

        setFiles((prev) =>
          prev.map((f) =>
            f.name === entry.name
              ? { ...f, status: 'done', bidId: bidRow.id }
              : f
          )
        )
      } catch (err) {
        console.error('Upload Error:', err)
        setUploadError(`Upload failed for ${entry.name}: ${err.message || 'Check Supabase RLS policies and storage bucket'}`)
        setFiles((prev) =>
          prev.map((f) =>
            f.name === entry.name ? { ...f, status: 'error' } : f
          )
        )
      }
    }
  }

  const removeFile = (name) =>
    setFiles((prev) => prev.filter((f) => f.name !== name))

  const handleStep2Next = () => {
    setUploadError('')
    const doneFiles = files.filter((f) => f.status === 'done')
    const uploadingFiles = files.filter((f) => f.status === 'uploading')

    if (uploadingFiles.length > 0) {
      setUploadError('Please wait for all files to finish uploading')
      return
    }
    if (doneFiles.length < 2) {
      setUploadError('Upload at least 2 bids to compare')
      return
    }
    setStep(3)
  }

  // ── Step 3: Confirm & start analysis ───────────────────────────────────────
  const handleConfirmAnalyze = async () => {
    setAnalyzing(true)
    try {
      const doneBids = files.filter((f) => f.status === 'done')

      // Create one analysis_job per bid
      for (const bid of doneBids) {
        if (!bid.bidId) continue

        const { data: job, error: jobError } = await supabase
          .from('analysis_jobs')
          .insert({
            bid_id: bid.bidId,
            project_id: projectId,
            status: 'pending',
          })
          .select()
          .single()

        if (jobError) {
          console.error('analysis_job insert error:', jobError)
          continue
        }
      }

      navigate(`/projects/${projectId}/processing`)
    } catch (err) {
      console.error(err)
      alert('Failed to start analysis. Please try again.')
      setAnalyzing(false)
    }
  }

  // ── File icon helper ────────────────────────────────────────────────────────
  const getFileIcon = (type) => {
    switch (type) {
      case 'pdf': return { icon: 'picture_as_pdf', color: 'text-brand-red' }
      case 'excel': return { icon: 'table_view', color: 'text-brand-green' }
      default: return { icon: 'description', color: 'text-brand-blue' }
    }
  }

  const uploadedCount = files.filter((f) => f.status === 'done').length
  const totalCount = files.length

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
      <Navbar active="projects" />

      <main className="flex-grow w-full max-w-[1200px] mx-auto px-12 py-12">
        <StepIndicator step={step} />

        {/* ═══ STEP 1 ═══════════════════════════════════════════════════════ */}
        {step === 1 && (
          <div className="flex gap-8">
            <div className="w-3/5">
              <div className="bg-white border border-gray-border rounded-xl p-8">
                {/* Project Name */}
                <div className="mb-8">
                  <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-2">
                    Project Name <span className="text-brand-red">*</span>
                  </label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => {
                      setProjectName(e.target.value)
                      if (errors.projectName) setErrors((p) => ({ ...p, projectName: '' }))
                    }}
                    className={`w-full border-0 border-b bg-transparent py-2 text-lg text-charcoal outline-none transition-colors placeholder:text-gray-300 ${
                      errors.projectName ? 'border-brand-red' : 'border-gray-border focus:border-brand-blue'
                    }`}
                    placeholder="e.g. Riverfront Tower B"
                  />
                  {errors.projectName && (
                    <p className="text-brand-red text-xs mt-1">{errors.projectName}</p>
                  )}
                </div>

                {/* Trade Package */}
                <div className="mb-8">
                  <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-3">
                    Trade Package <span className="text-brand-red">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {TRADES.map((t) => (
                      <button
                        key={t}
                        onClick={() => {
                          setTrade(t)
                          if (errors.trade) setErrors((p) => ({ ...p, trade: '' }))
                        }}
                        className={`px-4 py-2 text-sm font-medium border rounded-lg cursor-pointer transition-all ${
                          trade === t
                            ? 'bg-brand-blue text-white border-brand-blue'
                            : 'bg-white text-gray-text border-gray-border hover:border-gray-400'
                        }`}
                      >
                        {t.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {errors.trade && (
                    <p className="text-brand-red text-xs mt-2">{errors.trade}</p>
                  )}
                </div>

                {/* Client Name */}
                <div className="mb-8">
                  <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-2">
                    Client Name <span className="text-gray-300 normal-case font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full border-0 border-b border-gray-border bg-transparent py-2 text-charcoal outline-none focus:border-brand-blue transition-colors placeholder:text-gray-300"
                    placeholder="e.g. ABC Corp"
                  />
                </div>

                {/* Project Number */}
                <div className="mb-10">
                  <label className="block text-xs font-semibold text-gray-text uppercase tracking-wide mb-2">
                    Project Number <span className="text-gray-300 normal-case font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={projectNumber}
                    onChange={(e) => setProjectNumber(e.target.value)}
                    className="w-full border-0 border-b border-gray-border bg-transparent py-2 text-charcoal outline-none focus:border-brand-blue transition-colors placeholder:text-gray-300"
                    placeholder="e.g. PRJ-2024-042"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    onClick={handleStep1Next}
                    disabled={step1Loading}
                    className="bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-6 py-3 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {step1Loading ? 'Creating...' : 'NEXT: UPLOAD BIDS →'}
                  </button>
                </div>
              </div>
            </div>

            {/* Right helper */}
            <div className="w-2/5 space-y-6">
              <div className="bg-brand-blue-light border border-brand-blue-border rounded-xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-brand-blue text-xl">info</span>
                  <h3 className="font-bold text-charcoal text-sm">What you'll need:</h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2"><span className="text-brand-blue mt-0.5">·</span> 2 to 10 subcontractor quotes</li>
                  <li className="flex items-start gap-2"><span className="text-brand-blue mt-0.5">·</span> PDF, Excel, or Word format</li>
                  <li className="flex items-start gap-2"><span className="text-brand-blue mt-0.5">·</span> Takes ~30 seconds after upload</li>
                </ul>
              </div>
              <div className="bg-white border border-gray-border rounded-xl p-6">
                <div className="flex gap-1 mb-3">
                  {[1,2,3,4,5].map((i) => <span key={i} className="text-brand-amber text-lg">★</span>)}
                </div>
                <p className="text-sm text-gray-text italic mb-3">
                  "BidClear caught a $42K exclusion we completely missed. Saved the entire project budget review."
                </p>
                <p className="text-xs font-semibold text-gray-text uppercase">— John M., Senior Estimator</p>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 2 ═══════════════════════════════════════════════════════ */}
        {step === 2 && (
          <div className="flex gap-8">
            <div className="w-3/5">
              {/* Drop Zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files) }}
                onClick={() => fileInputRef.current?.click()}
                className={`rounded-xl p-10 flex flex-col items-center justify-center h-[200px] cursor-pointer transition-all ${
                  dragOver
                    ? 'bg-brand-blue-light border-2 border-solid border-brand-blue'
                    : 'bg-[#F0F9FF] border-2 border-dashed border-[#CBD5E1]'
                }`}
              >
                <span className="material-symbols-outlined text-brand-blue text-4xl mb-3">upload_file</span>
                <p className="text-lg font-bold text-charcoal mb-1">Drop your bid files here</p>
                <p className="text-sm text-gray-text mb-4">PDF · Excel · Word · up to {MAX_FILES} files</p>
                <span className="border border-gray-border text-gray-text text-sm font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors">
                  BROWSE FILES
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.xlsx,.xls,.doc,.docx"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
              </div>

              {/* Error */}
              {uploadError && (
                <div className="mt-4 bg-brand-red-light border border-brand-red-border rounded-lg px-4 py-3">
                  <p className="text-brand-red text-sm">{uploadError}</p>
                </div>
              )}

              {/* File List */}
              {files.length > 0 && (
                <div className="mt-6">
                  <p className="text-xs font-semibold text-gray-text uppercase mb-3">Uploaded Files</p>
                  <div className="space-y-2">
                    {files.map((f) => {
                      const fi = getFileIcon(f.type)
                      return (
                        <div key={f.name} className="flex items-center bg-white border border-gray-border rounded-xl px-4 py-3">
                          <span className={`material-symbols-outlined ${fi.color} text-xl mr-3`}>{fi.icon}</span>
                          <div className="flex-grow min-w-0">
                            <p className="text-sm font-semibold text-charcoal truncate">{f.name}</p>
                            <p className="text-xs text-gray-text">{f.size}</p>
                          </div>
                          {f.status === 'done' && <span className="text-brand-green text-lg mr-2">✓</span>}
                          {f.status === 'uploading' && <span className="material-symbols-outlined text-brand-blue text-lg animate-spin mr-2">sync</span>}
                          {f.status === 'error' && <span className="text-brand-red text-lg mr-2">✗</span>}
                          <button
                            onClick={() => removeFile(f.name)}
                            className="text-gray-text hover:text-brand-red text-lg bg-transparent border-0 cursor-pointer ml-1"
                          >
                            <span className="material-symbols-outlined text-lg">delete</span>
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-3 text-sm font-semibold text-gray-text border border-gray-border px-4 py-2 rounded-lg bg-white hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    + ADD MORE FILES
                  </button>
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-between items-center mt-8">
                <button
                  onClick={() => setStep(1)}
                  className="text-gray-text text-sm font-medium bg-transparent border-0 cursor-pointer hover:text-charcoal transition-colors"
                >
                  ← BACK
                </button>
                <button
                  onClick={handleStep2Next}
                  className="bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-6 py-3 rounded-lg cursor-pointer transition-colors"
                >
                  ANALYZE BIDS →
                </button>
              </div>
            </div>

            {/* Right: Upload Status */}
            <div className="w-2/5">
              <div className="bg-white border border-gray-border rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="material-symbols-outlined text-brand-blue text-xl">info</span>
                  <h3 className="font-bold text-charcoal text-sm">Upload Status</h3>
                </div>

                <div className="mb-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-text">Bids Uploaded</span>
                    <span className="font-semibold text-charcoal">{uploadedCount} of {totalCount || '—'}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-blue rounded-full transition-all"
                      style={{ width: totalCount ? `${(uploadedCount / totalCount) * 100}%` : '0%' }}
                    />
                  </div>
                </div>

                <div className="bg-brand-gray rounded-lg p-4 mt-4">
                  <p className="text-xs text-gray-text">
                    <span className="font-semibold">Uploading to:</span>{' '}
                    <span className="font-mono break-all">bid-files/{'{user_id}'}/{projectId}/</span>
                  </p>
                </div>

                <div className="mt-4 text-xs text-gray-text space-y-1">
                  <p>· Minimum 2 bids required</p>
                  <p>· Maximum 10 bids</p>
                  <p>· PDF, Excel, Word only</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 3 ═══════════════════════════════════════════════════════ */}
        {step === 3 && (
          <div className="flex gap-8">
            <div className="w-3/5">
              <div className="bg-white border border-gray-border rounded-xl p-8">
                <h2 className="text-xl font-bold text-charcoal mb-6">Review your project</h2>

                {/* Summary Fields */}
                <div className="space-y-4 mb-8">
                  {[
                    { label: 'Project Name', value: projectName },
                    { label: 'Trade Package', value: trade },
                    ...(clientName ? [{ label: 'Client Name', value: clientName }] : []),
                    ...(projectNumber ? [{ label: 'Project Number', value: projectNumber }] : []),
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-start gap-4 py-3 border-b border-gray-border">
                      <span className="text-xs font-semibold text-gray-text uppercase tracking-wide w-36 shrink-0 mt-0.5">{label}</span>
                      <span className="text-sm font-semibold text-charcoal">{value}</span>
                    </div>
                  ))}
                  <div className="flex items-start gap-4 py-3 border-b border-gray-border">
                    <span className="text-xs font-semibold text-gray-text uppercase tracking-wide w-36 shrink-0 mt-0.5">Files Uploaded</span>
                    <span className="text-sm font-semibold text-brand-green">
                      {files.filter((f) => f.status === 'done').length} bids ready
                    </span>
                  </div>
                </div>

                {/* File list */}
                <div className="mb-8">
                  <p className="text-xs font-semibold text-gray-text uppercase mb-3">Files</p>
                  <div className="space-y-2">
                    {files
                      .filter((f) => f.status === 'done')
                      .map((f) => {
                        const fi = getFileIcon(f.type)
                        return (
                          <div key={f.name} className="flex items-center gap-3 bg-brand-gray rounded-lg px-4 py-2.5">
                            <span className={`material-symbols-outlined ${fi.color} text-lg`}>{fi.icon}</span>
                            <span className="text-sm text-charcoal flex-grow truncate">{f.name}</span>
                            <span className="text-brand-green text-base">✓</span>
                          </div>
                        )
                      })}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex justify-between items-center">
                  <button
                    onClick={() => setStep(2)}
                    className="text-gray-text text-sm font-medium bg-transparent border-0 cursor-pointer hover:text-charcoal transition-colors"
                  >
                    ← BACK
                  </button>
                  <button
                    onClick={handleConfirmAnalyze}
                    disabled={analyzing}
                    className="bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-6 py-3 rounded-lg cursor-pointer transition-colors disabled:opacity-60 flex items-center gap-2"
                  >
                    {analyzing ? (
                      <>
                        <span className="material-symbols-outlined text-base animate-spin">sync</span>
                        Starting...
                      </>
                    ) : (
                      'CONFIRM & START ANALYSIS →'
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Right: Info */}
            <div className="w-2/5 space-y-6">
              <div className="bg-brand-amber-light border border-brand-amber-border rounded-xl p-6">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-brand-amber text-xl">schedule</span>
                  <h3 className="font-bold text-charcoal text-sm">What happens next</h3>
                </div>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-2"><span className="text-brand-amber">1.</span> BidClear reads all {files.filter((f) => f.status === 'done').length} bid files</li>
                  <li className="flex items-start gap-2"><span className="text-brand-amber">2.</span> Extracts every line item and price</li>
                  <li className="flex items-start gap-2"><span className="text-brand-amber">3.</span> Detects scope exclusions and gaps</li>
                  <li className="flex items-start gap-2"><span className="text-brand-amber">4.</span> Builds your comparison table</li>
                </ul>
                <p className="text-xs text-gray-text mt-3">Usually takes 15–30 seconds.</p>
              </div>

              <div className="bg-brand-green-light border border-brand-green-border rounded-xl p-6">
                <div className="flex items-center gap-2 mb-2">
                  <span className="material-symbols-outlined text-brand-green text-xl">lock</span>
                  <h3 className="font-bold text-charcoal text-sm">Your files are secure</h3>
                </div>
                <p className="text-sm text-gray-text">All bid documents are stored in encrypted private storage and never shared.</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
