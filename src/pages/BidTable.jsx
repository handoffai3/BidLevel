import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const fmt = (n) => n == null ? '—' : '$' + Number(n).toLocaleString('en-US')

export default function BidTable() {
  const navigate = useNavigate()
  const { id: projectId } = useParams()
  const [loading, setLoading] = useState(true)
  const [project, setProject] = useState({})
  const [bids, setBids] = useState([])
  const [matrix, setMatrix] = useState([])
  const [flags, setFlags] = useState([])
  const [drawer, setDrawer] = useState(null)
  const [note, setNote] = useState('')
  const [noteSaved, setNoteSaved] = useState(false)
  const [showNoteInput, setShowNoteInput] = useState(false)

  useEffect(() => { load() }, [projectId])

  const load = async () => {
    setLoading(true)
    try {
      // Check if project is still processing
      const { data: proj } = await supabase.from('projects')
        .select('project_name, trade_package, status').eq('id', projectId).single()
      if (proj?.status === 'processing') { navigate(`/projects/${projectId}/processing`); return }
      setProject(proj || {})

      const [{ data: bidsData }, { data: scopeData }, { data: flagsData }] = await Promise.all([
        supabase.from('bids').select('*').eq('project_id', projectId).order('created_at'),
        supabase.from('scope_items').select('*').eq('project_id', projectId),
        supabase.from('flags').select('*').eq('project_id', projectId),
      ])

      if (!bidsData?.length) { setLoading(false); return }

      setBids(bidsData)
      setFlags(flagsData || [])

      // Build unique item list
      const itemSet = new Set((scopeData || []).map(s => s.item_name))
      const items = [...itemSet].sort()

      // Build matrix
      const mat = items.map(item => {
        const row = { item }
        bidsData.forEach(bid => {
          const si = (scopeData || []).find(s => s.bid_id === bid.id && s.item_name === item)
          const flag = (flagsData || []).find(f => f.bid_id === bid.id && f.item_name === item)
          row[bid.id] = { amount: si?.amount ?? null, status: si?.status || (si ? 'included' : 'missing'), flag: flag || null }
        })
        return row
      })
      setMatrix(mat)
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  const lowestBid = bids.length
    ? bids.reduce((min, b) => (b.adjusted_total || 0) < (min.adjusted_total || 0) ? b : min, bids[0])
    : null

  const openDrawer = (bid, cell) => {
    if (!cell?.flag) return
    setNote('')
    setNoteSaved(false)
    setShowNoteInput(false)
    setDrawer({ bid, flag: cell.flag })
  }

  const markReviewed = async () => {
    if (!drawer?.flag) return
    try {
      const { error } = await supabase.from('flags').update({ is_reviewed: true }).eq('id', drawer.flag.id)
      if (error) {
        console.error('Failed to mark reviewed:', error)
        alert(`Failed to save: ${error.message}`)
        return
      }
      setFlags(prev => prev.map(f => f.id === drawer.flag.id ? { ...f, is_reviewed: true } : f))
      setDrawer(prev => ({ ...prev, flag: { ...prev.flag, is_reviewed: true } }))
    } catch (err) {
      console.error('markReviewed error:', err)
      alert(`Error: ${err.message}`)
    }
  }

  const saveNote = async () => {
    if (!drawer?.flag || !note.trim()) return
    try {
      const { error } = await supabase.from('flags').update({ note: note.trim() }).eq('id', drawer.flag.id)
      if (error) {
        console.error('Failed to save note:', error)
        alert(`Failed to save note: ${error.message}. You may need to add a "note" column (type: text) to your flags table in Supabase.`)
        return
      }
      setFlags(prev => prev.map(f => f.id === drawer.flag.id ? { ...f, note: note.trim() } : f))
      setDrawer(prev => ({ ...prev, flag: { ...prev.flag, note: note.trim() } }))
      setShowNoteInput(false)
      setNoteSaved(true)
    } catch (err) {
      console.error('saveNote error:', err)
      alert(`Error: ${err.message}`)
    }
  const deleteBid = async (bidId, companyName) => {
    if (!window.confirm(`Are you sure you want to remove the bid from ${companyName}? This cannot be undone.`)) return
    try {
      const { error } = await supabase.from('bids').delete().eq('id', bidId)
      if (error) {
        console.error('Failed to delete bid:', error)
        alert(`Failed to delete bid: ${error.message}`)
        return
      }
      setBids(prev => prev.filter(b => b.id !== bidId))
    } catch (err) {
      console.error('deleteBid error:', err)
      alert(`Error: ${err.message}`)
    }
  }

  const handleExcelExport = () => {
    const head = ['Scope Item', ...bids.map(b => b.company_name)]
    const rows = matrix.map(row => {
      const r = [row.item]
      bids.forEach(bid => {
        const cell = row[bid.id]
        if (!cell) r.push('—')
        else if (cell.status === 'excluded' || cell.status === 'missing') r.push('EXCLUDED')
        else r.push(fmt(cell.amount))
      })
      return r
    })
    rows.push([])
    rows.push(['BASE TOTAL', ...bids.map(b => fmt(b.base_total))])
    rows.push(['ADJUSTED TOTAL', ...bids.map(b => fmt(b.adjusted_total))])
    rows.push(['RISK', ...bids.map(b => (b.risk_level || 'low').toUpperCase())])

    const gapRows = flags.filter(f => f.flag_type === 'scope_gap').map(f => {
      const bid = bids.find(b => b.id === f.bid_id)
      return [bid?.company_name || '?', f.item_name, fmt(f.gap_low), fmt(f.gap_high), f.recommendation || '']
    })

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...rows]), 'Bid Comparison')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Sub', 'Item', 'Gap Low', 'Gap High', 'Recommendation'], ...gapRows]), 'Scope Gaps')
    XLSX.writeFile(wb, `${(project.project_name || 'Project').replace(/\s+/g, '_')}_BidClear.xlsx`)
  }

  const handlePdfExport = () => {
    const doc = new jsPDF()
    doc.setFontSize(18); doc.text('Bid Leveling Summary', 14, 20)
    doc.setFontSize(11); doc.text(`${project.project_name} — ${project.trade_package}`, 14, 30)
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, 14, 37)
    let y = 50
    doc.setFont('helvetica', 'bold'); doc.text('Bids:', 14, y); doc.setFont('helvetica', 'normal'); doc.text(`${bids.length}`, 45, y); y += 7
    doc.setFont('helvetica', 'bold'); doc.text('Gaps:', 14, y); doc.setFont('helvetica', 'normal'); doc.text(`${flags.filter(f => f.flag_type === 'scope_gap').length}`, 45, y); y += 7
    doc.setFont('helvetica', 'bold'); doc.text('Lowest Bid:', 14, y); doc.setFont('helvetica', 'normal')
    doc.text(`${lowestBid?.company_name || 'N/A'} — ${lowestBid ? fmt(lowestBid.adjusted_total) : '—'}`, 45, y); y += 15
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('BID SUMMARY', 14, y)
    autoTable(doc, {
      startY: y + 4, theme: 'striped',
      head: [['Sub', 'Base Total', 'Adjusted Total', 'Risk']],
      body: bids.map(b => [b.company_name, fmt(b.base_total), fmt(b.adjusted_total), (b.risk_level || 'low').toUpperCase()]),
      headStyles: { fillColor: [37, 99, 235] }
    })
    y = doc.lastAutoTable.finalY + 12
    const gapRows = flags.filter(f => f.flag_type === 'scope_gap').map(f => {
      const bid = bids.find(b => b.id === f.bid_id)
      return [`${bid?.company_name || '?'} — ${f.item_name}`, f.gap_low === f.gap_high ? fmt(f.gap_low) : `${fmt(f.gap_low)} – ${fmt(f.gap_high)}`, f.extracted_text || '']
    })
    if (gapRows.length) {
      doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.text('SCOPE GAPS', 14, y)
      autoTable(doc, { startY: y + 4, theme: 'grid', head: [['Item', 'Gap Value', 'Reason']], body: gapRows, headStyles: { fillColor: [220, 38, 38] }, columnStyles: { 2: { cellWidth: 70 } } })
    }
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('Prepared using BidClear — bidclear.com', 14, doc.internal.pageSize.height - 12)
    doc.save(`${(project.project_name || 'Project').replace(/\s+/g, '_')}_BidClear.pdf`)
  }

  // Alert strip
  const activeFlags = flags.filter(f => !f.is_reviewed)
  const allReviewed = flags.length > 0 && activeFlags.length === 0

  const alertParts = activeFlags.slice(0, 5).map(f => {
    const bid = bids.find(b => b.id === f.bid_id)
    return `${bid?.company_name || 'Sub'} missing ${f.item_name} (${fmt(f.gap_low)})`
  })

  // Stats
  const highRiskCount = bids.filter(b => b.risk_level === 'high').length
  const totalGaps = flags.filter(f => f.flag_type === 'scope_gap').length

  const cellColor = (cell) => {
    if (!cell) return 'bg-white'
    if (cell.status === 'excluded' || cell.status === 'missing') return 'bg-brand-red text-white cursor-pointer hover:bg-red-700'
    if (cell.flag?.flag_type === 'unusual_price') return 'bg-brand-amber-light text-[#92400E] cursor-pointer hover:bg-amber-100'
    return 'bg-white'
  }

  const riskStyles = { low: 'bg-brand-green text-white', medium: 'bg-brand-amber text-white', high: 'bg-brand-red text-white' }

  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
      <Navbar active="projects" />

      {/* Sub-header */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-border h-14 flex items-center px-8">
        <div className="flex items-center text-sm text-gray-text gap-1">
          <button onClick={() => navigate('/projects')} className="hover:text-brand-blue bg-transparent border-0 cursor-pointer">Projects</button>
          <span className="mx-1 text-gray-300">/</span>
          <span className="hover:text-brand-blue cursor-pointer" onClick={() => navigate('/projects')}>{project.project_name || '…'}</span>
          <span className="mx-1 text-gray-300">/</span>
          <span className="font-semibold text-charcoal">{project.trade_package || 'Bid Table'}</span>
        </div>
        <div className="ml-auto flex gap-3">
          <button onClick={handlePdfExport} className="px-4 py-1.5 border border-gray-border text-gray-text text-xs font-semibold uppercase rounded-lg bg-white hover:bg-gray-50 cursor-pointer flex items-center gap-1.5 transition-colors">
            <span className="material-symbols-outlined text-base">picture_as_pdf</span> PDF
          </button>
          <button onClick={handleExcelExport} className="px-4 py-1.5 bg-brand-blue text-white text-xs font-semibold uppercase rounded-lg hover:bg-brand-blue-dark cursor-pointer flex items-center gap-1.5 transition-colors">
            <span className="material-symbols-outlined text-base">table_view</span> Excel
          </button>
        </div>
      </div>

      {/* Alert strip */}
      {allReviewed ? (
        <div className="bg-brand-green h-11 flex items-center px-8 text-white text-sm">
          <span className="mr-2">✓</span> All scope gaps reviewed ✓
        </div>
      ) : alertParts.length > 0 && (
        <div className="bg-brand-red h-11 flex items-center px-8 text-white text-sm overflow-x-auto whitespace-nowrap">
          <span className="mr-2 shrink-0">⚠</span>
          <span>{alertParts.join(' · ')}{activeFlags.length > 5 && ' → more gaps below'}</span>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-32">
          <span className="material-symbols-outlined text-brand-blue text-3xl animate-spin">sync</span>
          <span className="ml-3 text-gray-text">Loading bid data…</span>
        </div>
      ) : !bids.length ? (
        <div className="flex flex-col items-center justify-center py-32">
          <p className="text-lg font-semibold text-charcoal mb-2">No bids found for this project</p>
          <button onClick={() => navigate('/projects')} className="text-brand-blue text-sm underline bg-transparent border-0 cursor-pointer mt-2">Back to Projects</button>
        </div>
      ) : (
        <>
          {/* Stats cards */}
          <div className="w-full max-w-[1200px] mx-auto px-8 pt-8 pb-4 grid grid-cols-4 gap-4">
            {[
              { label: 'Bids Compared', value: bids.length, color: 'text-charcoal' },
              { label: 'Scope Gaps', value: totalGaps, color: totalGaps > 0 ? 'text-brand-red' : 'text-charcoal' },
              { label: 'Lowest Bid', value: lowestBid ? `${lowestBid.company_name}` : '—', sub: lowestBid ? fmt(lowestBid.adjusted_total) : '', color: 'text-brand-green' },
              { label: 'High Risk Bids', value: highRiskCount, color: highRiskCount > 0 ? 'text-brand-red' : 'text-charcoal' },
            ].map(({ label, value, sub, color }) => (
              <div key={label} className="bg-white border border-gray-border rounded-xl px-5 py-4">
                <p className="text-xs font-semibold text-gray-text uppercase mb-1">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{value}</p>
                {sub && <p className="text-sm text-gray-text mt-0.5">{sub}</p>}
              </div>
            ))}
          </div>

          {bids.length === 1 && (
            <div className="w-full max-w-[1200px] mx-auto px-8 mb-4">
              <div className="bg-brand-amber-light border border-brand-amber-border rounded-xl px-5 py-3">
                <p className="text-sm text-[#92400E]">⚠ Upload at least 2 bids to compare</p>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="w-full overflow-x-auto border-t border-gray-border">
            <table className="w-full text-left border-collapse" style={{ minWidth: `${260 + bids.length * 180}px` }}>
              <thead>
                <tr className="bg-brand-gray border-b border-gray-border">
                  <th className="sticky left-0 bg-brand-gray py-4 px-6 text-xs font-semibold uppercase text-gray-text border-r border-gray-border w-[260px] z-10">Scope Item</th>
                  {bids.map((bid) => {
                    const isLowest = lowestBid?.id === bid.id
                    const risk = bid.risk_level || 'low'
                    return (
                      <th key={bid.id} className={`py-4 px-6 border-r border-gray-border text-center w-[180px] group relative ${isLowest ? 'border-l-2 border-l-brand-green' : ''}`}>
                        <div className="flex justify-between items-start">
                          <div className={`text-xs font-semibold uppercase ${risk === 'high' ? 'text-brand-red' : risk === 'medium' ? 'text-brand-amber' : 'text-gray-text'}`}>
                            {risk !== 'low' && '⚠ '}SUB {bids.indexOf(bid) + 1}
                          </div>
                          <button
                            onClick={() => deleteBid(bid.id, bid.company_name)}
                            title="Remove Bid"
                            className="text-gray-text hover:text-brand-red opacity-0 group-hover:opacity-100 transition-opacity p-1 absolute top-2 right-2 bg-transparent border-0 cursor-pointer flex items-center justify-center rounded bg-brand-gray"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                        <div className="text-base font-bold text-charcoal mt-1 pr-4">{bid.company_name}</div>
                        <div className="text-sm text-gray-text mt-0.5">{fmt(bid.base_total)}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="text-sm">
                {matrix.map((row, idx) => (
                  <tr key={idx} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-brand-gray'} border-b border-gray-border hover:bg-brand-blue-light/30 transition-colors`}>
                    <td className="sticky left-0 bg-inherit py-3 px-6 font-semibold text-charcoal border-r border-gray-border z-10">{row.item}</td>
                    {bids.map(bid => {
                      const cell = row[bid.id]
                      const isExcluded = !cell || cell.status === 'excluded' || cell.status === 'missing'
                      const isAmber = cell?.flag?.flag_type === 'unusual_price'
                      // Read from live flags state so reviewed status updates in real-time
                      const liveFlag = cell?.flag?.id ? flags.find(f => f.id === cell.flag.id) : null
                      const isReviewed = liveFlag?.is_reviewed || cell?.flag?.is_reviewed

                      return (
                        <td
                          key={bid.id}
                          onClick={() => (isExcluded || isAmber) && openDrawer(bid, { ...cell, flag: liveFlag || cell?.flag })}
                          className={`py-3 px-6 border-r border-gray-border text-right relative ${
                            isExcluded ? 'bg-brand-red text-white font-semibold cursor-pointer hover:bg-red-700 transition-colors' :
                            isAmber ? 'bg-brand-amber-light text-[#92400E] font-bold cursor-pointer hover:bg-amber-100 transition-colors' :
                            'font-mono text-charcoal'
                          }`}
                        >
                          {isExcluded ? (
                            <div className="flex flex-col items-center">
                              <span className="text-base mb-0.5">⊗</span>
                              <span className="text-xs uppercase">Excluded</span>
                            </div>
                          ) : (
                            <>
                              {fmt(cell?.amount)}
                              {isAmber && <span className="ml-1">ℹ</span>}
                            </>
                          )}
                          {isReviewed && (
                            <span className="absolute top-1 right-1 bg-white/80 text-brand-green text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shadow-sm">✓</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}

                {/* Adjusted Total */}
                <tr className="bg-brand-gray border-b-2 border-brand-blue">
                  <td className="sticky left-0 bg-brand-gray py-5 px-6 font-bold text-base text-charcoal border-r border-gray-border z-10">ADJUSTED TOTAL</td>
                  {bids.map(bid => {
                    const adj = bid.adjusted_total || 0
                    const base = bid.base_total || 0
                    const diff = adj - base
                    const isLowest = lowestBid?.id === bid.id
                    return (
                      <td key={bid.id} className={`py-5 px-6 border-r border-gray-border text-right text-base font-bold ${diff > 0 ? 'text-brand-red' : isLowest ? 'text-brand-green' : 'text-charcoal'}`}>
                        {fmt(adj)}
                        {diff > 0 && <span className="text-xs text-brand-red block mt-0.5">(+{fmt(diff)} adj)</span>}
                        {isLowest && diff === 0 && <span className="text-xs text-brand-green block mt-0.5">Lowest</span>}
                      </td>
                    )
                  })}
                </tr>

                {/* Risk Row */}
                <tr className="bg-white">
                  <td className="sticky left-0 bg-white py-4 px-6 font-semibold text-charcoal border-r border-gray-border z-10">Risk Assessment</td>
                  {bids.map(bid => {
                    const risk = bid.risk_level || 'low'
                    const labels = { low: 'LOW RISK', medium: 'MEDIUM RISK', high: 'HIGH RISK' }
                    return (
                      <td key={bid.id} className="py-4 px-6 border-r border-gray-border text-center">
                        <span className={`inline-block px-3 py-1 text-xs font-bold uppercase rounded-full ${riskStyles[risk]}`}>{labels[risk]}</span>
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Drawer Overlay */}
      {drawer && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-[1px]" onClick={() => setDrawer(null)} />
          <aside className="fixed right-0 top-0 bottom-0 w-[440px] bg-white border-l border-gray-border z-50 flex flex-col shadow-2xl" style={{ animation: 'slide-in-right 0.3s ease' }}>
            {/* Section 1 — Header */}
            <div className="border-t-4 border-brand-red pt-6 pb-5 px-6 border-b border-gray-border shrink-0">
              <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-semibold text-charcoal">
                  {drawer.bid.company_name} · {drawer.flag.item_name}
                </span>
                <button onClick={() => setDrawer(null)} className="text-gray-text hover:text-charcoal bg-transparent border-0 cursor-pointer">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              {/* Section 2 — Status */}
              <h2 className="text-xl font-bold text-brand-red flex items-center gap-2">
                <span className="material-symbols-outlined text-brand-red">warning</span>
                SCOPE EXCLUDED
              </h2>
            </div>

            <div className="flex-grow overflow-y-auto px-6 py-6 space-y-6">
              {/* Section 3 — Extracted Text */}
              {drawer.flag.extracted_text && (() => {
                const wordCount = drawer.flag.extracted_text.trim().split(/\s+/).length
                const isShort = wordCount < 8
                return (
                  <div className="bg-brand-gray border-l-[3px] border-brand-red rounded-r-lg p-4">
                    <p className={`text-sm font-mono italic ${isShort ? 'text-brand-amber' : 'text-gray-600'}`}>
                      "{drawer.flag.extracted_text}"
                    </p>
                    {isShort && (
                      <p className="text-xs text-brand-amber mt-2 flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">info</span>
                        Limited context extracted from document
                      </p>
                    )}
                  </div>
                )
              })()}

              {/* Section 4 — Gap Value */}
              <div>
                <span className="text-xs text-gray-text uppercase font-semibold tracking-wide">Estimated gap value:</span>
                <p className="text-xl font-bold text-brand-red mt-1">
                  {drawer.flag.gap_low === drawer.flag.gap_high
                    ? fmt(drawer.flag.gap_low)
                    : `${fmt(drawer.flag.gap_low)} — ${fmt(drawer.flag.gap_high)}`}
                </p>
                {drawer.flag.gap_low != null && drawer.flag.gap_high != null && (
                  <p className="text-sm text-gray-text mt-1">
                    Impact on adjusted total: +{fmt(Math.round((drawer.flag.gap_low + drawer.flag.gap_high) / 2))} avg
                  </p>
                )}
              </div>

              {/* Section 5 — Recommendation Box */}
              {drawer.flag.recommendation && (
                <div className="bg-brand-blue-light border border-brand-blue-border rounded-xl p-4">
                  <div className="flex items-start gap-2">
                    <span className="material-symbols-outlined text-brand-blue text-lg mt-0.5">info</span>
                    <p className="text-sm text-charcoal">
                      <span className="font-semibold">BidClear recommends: </span>{drawer.flag.recommendation}
                    </p>
                  </div>
                </div>
              )}

              {/* Saved Note Display (below recommendation) */}
              {noteSaved && note.trim() && (
                <div className="flex items-start gap-2">
                  <p className="text-sm text-gray-text italic flex-grow">"{note.trim()}"</p>
                  <button
                    onClick={() => { setNoteSaved(false); setShowNoteInput(true) }}
                    className="text-xs text-brand-blue bg-transparent border-0 cursor-pointer hover:underline shrink-0"
                  >Edit</button>
                </div>
              )}
              {!noteSaved && drawer.flag.note && !showNoteInput && (
                <div className="flex items-start gap-2">
                  <p className="text-sm text-gray-text italic flex-grow">"{drawer.flag.note}"</p>
                  <button
                    onClick={() => { setNote(drawer.flag.note); setShowNoteInput(true) }}
                    className="text-xs text-brand-blue bg-transparent border-0 cursor-pointer hover:underline shrink-0"
                  >Edit</button>
                </div>
              )}

              {/* Section 6 — Add Note */}
              {showNoteInput ? (
                <div>
                  <textarea
                    value={note}
                    onChange={e => setNote(e.target.value)}
                    rows={3}
                    placeholder="Add your notes here..."
                    className="w-full border border-gray-border rounded-lg px-3 py-2 text-sm text-charcoal outline-none focus:border-brand-blue resize-none"
                  />
                  <button
                    onClick={saveNote}
                    disabled={!note.trim()}
                    className="mt-2 bg-brand-green hover:bg-green-700 text-white text-xs font-semibold px-4 py-2 rounded-lg cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >Save Note</button>
                </div>
              ) : !noteSaved && !drawer.flag.note && (
                <button
                  onClick={() => setShowNoteInput(true)}
                  className="text-sm text-gray-text bg-transparent border-0 cursor-pointer hover:text-brand-blue hover:underline transition-colors"
                >ADD NOTE</button>
              )}
            </div>

            {/* Section 7 — Mark Reviewed */}
            <div className="p-6 border-t border-gray-border shrink-0">
              {drawer.flag.is_reviewed ? (
                <button disabled className="w-full bg-gray-300 text-white font-semibold py-3 rounded-xl text-sm cursor-not-allowed">
                  ✓ Reviewed
                </button>
              ) : (
                <button onClick={markReviewed} className="w-full bg-brand-green hover:bg-green-700 text-white font-semibold py-3 rounded-xl text-sm cursor-pointer transition-colors">
                  ✓ Mark Reviewed
                </button>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
