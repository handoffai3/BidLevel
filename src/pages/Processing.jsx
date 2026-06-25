import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ─── Constants ────────────────────────────────────────────────────────────────
const STEPS = [
  'Extracting line items',
  'Mapping trade categories',
  'Normalizing scope across bids',
  'Flagging exclusions',
  'Building comparison table',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function fileUrlToBase64(fileUrl) {
  const storagePath = fileUrl.includes('bid-files/')
    ? decodeURIComponent(fileUrl.split('bid-files/')[1])
    : fileUrl.includes('http')
      ? decodeURIComponent(new URL(fileUrl).pathname.split('/object/public/bid-files/')[1] || fileUrl)
      : decodeURIComponent(fileUrl);

  const { data, error } = await supabase.storage
    .from('bid-files')
    .download(storagePath)

  if (error) throw new Error(`Failed to download file from private storage: ${error.message}`)

  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      // strip data:...;base64, prefix
      const base64 = reader.result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(data)
  })
}

function calcRisk(flagCount) {
  if (flagCount >= 2) return 'high'
  if (flagCount === 1) return 'medium'
  return 'low'
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Processing() {
  const navigate = useNavigate()
  const { id: projectId } = useParams()

  // ── State ──────────────────────────────────────────────────────────────────
  const [bids, setBids] = useState([])
  const [jobs, setJobs] = useState([])
  const [gapsFound, setGapsFound] = useState(0)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(0)
  const [stepStatus, setStepStatus] = useState(STEPS.map(() => 'pending')) // 'pending'|'active'|'done'|'error'
  const [bidStatus, setBidStatus] = useState({}) // bidId -> { status, error }
  const [done, setDone] = useState(false)
  const [retryBidId, setRetryBidId] = useState(null)

  const processingRef = useRef(false) // prevent double-run in StrictMode
  const completedRef = useRef(false)

  // ── Unload warning ─────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (!completedRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [])

  // ── Load initial data and kick off processing ──────────────────────────────
  useEffect(() => {
    if (!projectId) return
    initAndProcess()
  }, [projectId])

  // ── Polling: job progress every 2s, gap counter every 3s ──────────────────
  useEffect(() => {
    if (done) return
    const jobPoll = setInterval(pollJobs, 2000)
    const gapPoll = setInterval(pollGaps, 3000)
    return () => {
      clearInterval(jobPoll)
      clearInterval(gapPoll)
    }
  }, [done, jobs])

  // ── Main orchestrator ──────────────────────────────────────────────────────
  const initAndProcess = async () => {
    if (processingRef.current) return
    processingRef.current = true

    try {
      // Load bids and existing jobs
      const [{ data: bidsData }, { data: jobsData }] = await Promise.all([
        supabase.from('bids').select('*').eq('project_id', projectId).order('created_at'),
        supabase.from('analysis_jobs').select('*').eq('project_id', projectId),
      ])

      if (!bidsData?.length) return

      setBids(bidsData)
      setJobs(jobsData || [])

      // Figure out which bids still need processing
      const doneJobBidIds = new Set(
        (jobsData || []).filter((j) => j.status === 'done').map((j) => j.bid_id)
      )
      const pendingBids = bidsData.filter((b) => !doneJobBidIds.has(b.id))

      // Create analysis_jobs for bids that don't have one yet
      for (const bid of pendingBids) {
        const existing = (jobsData || []).find((j) => j.bid_id === bid.id)
        if (!existing) {
          await supabase.from('analysis_jobs').insert({
            bid_id: bid.id,
            project_id: projectId,
            status: 'pending',
          })
        }
      }

      // Refresh jobs list
      const { data: freshJobs } = await supabase
        .from('analysis_jobs')
        .select('*')
        .eq('project_id', projectId)
      setJobs(freshJobs || [])

      // Process each pending bid sequentially
      updateStepStatus(0, 'active')
      let anyErrors = false;
      for (const bid of pendingBids) {
        const success = await processBid(bid, bidsData.length, freshJobs || [])
        if (!success) anyErrors = true;
      }

      // Finalize ONLY if there were no errors
      if (!anyErrors) {
        await finalize(bidsData)
      }
    } catch (err) {
      console.error('Processing init error:', err)
    }
  }

  // ── Process a single bid ───────────────────────────────────────────────────
  const processBid = async (bid, totalBids, allJobs) => {
    setBidStatus((prev) => ({ ...prev, [bid.id]: { status: 'running' } }))
    updateStepStatus(0, 'active')

    try {
      // Get the job record for this bid
      const job = allJobs.find((j) => j.bid_id === bid.id)

      // Convert file to base64
      const base64 = await fileUrlToBase64(bid.file_url)

      // Call edge function (Gemini)
      const { data: aiResult, error: fnError } = await supabase.functions.invoke('analyze-bid', {
        body: {
          fileBase64: base64,
          fileName: bid.file_name,
        },
      })

      if (fnError || aiResult?.error) {
        throw new Error(fnError?.message || aiResult?.error || 'Edge function error')
      }

      // Step 1 done — extracted line items
      updateStepStatus(0, 'done')
      updateStepStatus(1, 'active')

      // Save scope_items to DB
      if (aiResult.scope_items?.length) {
        const scopeRows = aiResult.scope_items.map((si) => ({
          bid_id: bid.id,
          project_id: projectId,
          item_name: si.item_name,
          amount: si.amount ?? null,
          status: si.status || 'included',
        }))
        await supabase.from('scope_items').insert(scopeRows)
      }

      // Step 2 done — mapped trade categories
      updateStepStatus(1, 'done')
      updateStepStatus(2, 'active')

      // Save flags to DB
      if (aiResult.flags?.length) {
        const flagRows = aiResult.flags.map((f) => ({
          bid_id: bid.id,
          project_id: projectId,
          item_name: f.item_name,
          flag_type: f.flag_type,
          extracted_text: f.extracted_text,
          gap_low: f.gap_low ?? 0,
          gap_high: f.gap_high ?? 0,
          recommendation: f.recommendation,
          is_reviewed: false,
        }))
        await supabase.from('flags').insert(flagRows)
      }

      // Step 4 done — flagging exclusions
      updateStepStatus(3, 'done')

      // Calculate risk level
      const flagCount = aiResult.flags?.length || 0
      const riskLevel = calcRisk(flagCount)

      // Calculate adjusted total from flags
      const baseTotal = aiResult.base_total || 0
      const gapSum = (aiResult.flags || []).reduce((sum, f) => {
        const avg = Math.round(((f.gap_low || 0) + (f.gap_high || 0)) / 2)
        return sum + avg
      }, 0)
      const adjustedTotal = baseTotal + gapSum

      // Update bid record
      await supabase.from('bids').update({
        company_name: aiResult.company_name || bid.company_name,
        base_total: baseTotal,
        adjusted_total: adjustedTotal,
        risk_level: riskLevel,
      }).eq('id', bid.id)

      // Update analysis job to done
      if (job) {
        await supabase.from('analysis_jobs').update({
          status: 'done',
          completed_at: new Date().toISOString(),
        }).eq('id', job.id)
      }

      setBidStatus((prev) => ({ ...prev, [bid.id]: { status: 'done' } }))

      // Refresh jobs to update progress circle
      const { data: freshJobs } = await supabase
        .from('analysis_jobs')
        .select('*')
        .eq('project_id', projectId)
      setJobs(freshJobs || [])
      updateStepStatus(2, 'done')
      return true
    } catch (err) {
      console.error(`Error processing bid ${bid.file_name}:`, err)
      setBidStatus((prev) => ({
        ...prev,
        [bid.id]: { status: 'error', message: err.message },
      }))

      // Mark job as error
      const { data: jobRow } = await supabase
        .from('analysis_jobs')
        .select('id')
        .eq('bid_id', bid.id)
        .single()

      if (jobRow) {
        await supabase.from('analysis_jobs').update({
          status: 'error',
          error_message: err.message,
        }).eq('id', jobRow.id)
      }
      return false;
    }
  }

  // ── Finalize after all bids processed ─────────────────────────────────────
  const finalize = async (allBids) => {
    updateStepStatus(4, 'active')

    // Update project status to "ready"
    await supabase.from('projects').update({ status: 'ready' }).eq('id', projectId)

    updateStepStatus(4, 'done')
    setProgress(100)
    setDone(true)
    completedRef.current = true

    // Navigate after 1.5s
    setTimeout(() => navigate(`/projects/${projectId}/table`), 1500)
  }

  // ── Polling helpers ────────────────────────────────────────────────────────
  const pollJobs = async () => {
    const { data } = await supabase
      .from('analysis_jobs')
      .select('*')
      .eq('project_id', projectId)
    if (!data) return
    setJobs(data)

    const total = data.length
    const doneCount = data.filter((j) => j.status === 'done').length
    if (total > 0) setProgress(Math.round((doneCount / total) * 100))
  }

  const pollGaps = async () => {
    const { count } = await supabase
      .from('flags')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId)
    setGapsFound(count || 0)
  }

  // ── Retry a failed bid ─────────────────────────────────────────────────────
  const handleRetry = async (bid) => {
    setRetryBidId(bid.id)
    setBidStatus((prev) => ({ ...prev, [bid.id]: { status: 'running' } }))

    const { data: freshJobs } = await supabase
      .from('analysis_jobs')
      .select('*')
      .eq('project_id', projectId)

    await processBid(bid, bids.length, freshJobs || [])
    setRetryBidId(null)

    // Check if all done now
    const { data: latestJobs } = await supabase
      .from('analysis_jobs')
      .select('*')
      .eq('project_id', projectId)

    if (latestJobs?.every((j) => j.status === 'done')) {
      await finalize(bids)
    }
  }

  // ── Step status updater ────────────────────────────────────────────────────
  const updateStepStatus = (index, status) => {
    setStepStatus((prev) => {
      const next = [...prev]
      next[index] = status
      // Cascade: mark all before as done if marking later step active/done
      if (status === 'active' || status === 'done') {
        for (let i = 0; i < index; i++) {
          if (next[i] === 'pending' || next[i] === 'active') next[i] = 'done'
        }
      }
      return next
    })
    setCurrentStep(index)
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (progress / 100) * circumference

  const errorBids = bids.filter((b) => bidStatus[b.id]?.status === 'error')
  const hasErrors = errorBids.length > 0

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center w-full max-w-md">

        {/* Circle Progress */}
        <div className="relative w-[140px] h-[140px] mb-10">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={radius} fill="none" stroke="#E5E7EB" strokeWidth="8" />
            <circle
              cx="60" cy="60" r={radius} fill="none"
              stroke={done ? '#16A34A' : hasErrors ? '#DC2626' : '#2563EB'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {done ? (
              <span className="text-brand-green font-bold text-[28px]">✓</span>
            ) : (
              <>
                <span className="font-bold text-[28px]" style={{ color: hasErrors ? '#DC2626' : '#2563EB' }}>
                  {progress}%
                </span>
                <span className="text-gray-text text-xs">
                  {jobs.filter((j) => j.status === 'done').length}/{jobs.length} bids
                </span>
              </>
            )}
          </div>
        </div>

        {/* Step Timeline */}
        <div className="w-full space-y-4 mb-10">
          {STEPS.map((label, i) => {
            const status = stepStatus[i]
            return (
              <div key={i} className="flex items-center gap-3">
                {/* Dot */}
                {status === 'done' ? (
                  <div className="w-5 h-5 rounded-full bg-brand-green flex items-center justify-center shrink-0">
                    <span className="text-white text-xs">✓</span>
                  </div>
                ) : status === 'error' ? (
                  <div className="w-5 h-5 rounded-full bg-brand-red flex items-center justify-center shrink-0">
                    <span className="text-white text-xs">✗</span>
                  </div>
                ) : status === 'active' ? (
                  <div
                    className="w-5 h-5 rounded-full bg-brand-blue shrink-0"
                    style={{ animation: 'pulse-dot 1.5s ease-in-out infinite' }}
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />
                )}

                {/* Label */}
                <span className={`text-sm ${
                  status === 'done' ? 'text-gray-text line-through' :
                  status === 'active' ? 'text-brand-blue font-bold' :
                  status === 'error' ? 'text-brand-red font-bold' :
                  'text-gray-text'
                }`}>
                  {label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Gaps Found Counter */}
        {gapsFound > 0 && (
          <div className="w-full bg-brand-orange-light border border-brand-orange-border rounded-xl p-4 flex items-start gap-3 mb-8">
            <span className="material-symbols-outlined text-brand-amber text-xl mt-0.5">warning</span>
            <div>
              <p className="text-sm">
                <span className="text-brand-red font-bold">
                  Found {gapsFound} scope gap{gapsFound > 1 ? 's' : ''} so far.
                </span>
              </p>
              <p className="text-sm text-gray-text mt-0.5">
                Review will be required after extraction is complete.
              </p>
            </div>
          </div>
        )}

        {/* Per-bid error messages */}
        {errorBids.map((bid) => (
          <div
            key={bid.id}
            className="w-full bg-brand-red-light border border-brand-red-border rounded-xl p-4 mb-4 flex items-start gap-3"
          >
            <span className="material-symbols-outlined text-brand-red text-xl mt-0.5">error</span>
            <div className="flex-grow">
              <p className="text-sm font-semibold text-brand-red">
                Could not read {bid.file_name}.
              </p>
              <p className="text-xs text-gray-text mt-0.5">
                {bidStatus[bid.id]?.message || 'Please check the file and try again.'}
              </p>
            </div>
            <button
              onClick={() => handleRetry(bid)}
              disabled={retryBidId === bid.id}
              className="text-xs font-semibold uppercase border border-brand-red text-brand-red px-3 py-1.5 rounded-lg bg-transparent cursor-pointer hover:bg-brand-red hover:text-white transition-colors disabled:opacity-50 shrink-0"
            >
              {retryBidId === bid.id ? 'Retrying...' : 'Retry'}
            </button>
          </div>
        ))}

        {/* Bid file list */}
        {bids.length > 0 && (
          <div className="w-full mb-8">
            <div className="space-y-2">
              {bids.map((bid) => {
                const st = bidStatus[bid.id]?.status || 'pending'
                return (
                  <div key={bid.id} className="flex items-center gap-3 bg-brand-gray rounded-lg px-4 py-2.5">
                    <span className="material-symbols-outlined text-gray-text text-lg">description</span>
                    <span className="text-sm text-charcoal flex-grow truncate">{bid.file_name}</span>
                    {st === 'done' && <span className="text-brand-green text-base">✓</span>}
                    {st === 'running' && (
                      <span className="material-symbols-outlined text-brand-blue text-base animate-spin">sync</span>
                    )}
                    {st === 'error' && <span className="text-brand-red text-base">✗</span>}
                    {st === 'pending' && (
                      <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Footer note */}
        {!done && !hasErrors && (
          <p className="text-xs font-semibold text-gray-text uppercase tracking-wider text-center">
            Usually takes 15–30 seconds.<br />Do not close this tab.
          </p>
        )}

        {done && (
          <p className="text-sm font-semibold text-brand-green text-center animate-pulse">
            Analysis complete! Redirecting…
          </p>
        )}
      </div>
    </div>
  )
}
