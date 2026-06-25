import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import JSZip from 'jszip'

const fmt = (n) => n == null ? '—' : '$' + Number(n).toLocaleString('en-US')
const fmtLarge = (n) => {
  if (!n) return '$0'
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`
  return fmt(n)
}

const DATE_RANGES = ['All time', 'Last 7 days', 'Last 30 days', 'Last 90 days']

export default function Reports() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [tradePill, setTradePill] = useState('All Trades')
  const [dateRange, setDateRange] = useState('All time')
  const [pendingTrade, setPendingTrade] = useState('All Trades')
  const [pendingDate, setPendingDate] = useState('All time')
  const [allGaps, setAllGaps] = useState([])
  const [zipProgress, setZipProgress] = useState(null) // null | string

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id

      // Load completed projects with bid + flag counts
      let q = supabase
        .from('projects')
        .select('id, project_name, trade_package, status, created_at, bids(id), flags(id)')
        .in('status', ['ready', 'complete'])
        .order('created_at', { ascending: false })
      if (userId) q = q.eq('user_id', userId)
      const { data: projData } = await q

      // Load all flags for value-protected stat
      let gq = supabase.from('flags').select('gap_low, gap_high, project_id')
      if (projData?.length) {
        gq = gq.in('project_id', projData.map(p => p.id))
      }
      const { data: gapsData } = await gq

      setAllGaps(gapsData || [])

      if (projData?.length) {
        setProjects(projData.map(p => ({
          id: p.id,
          name: p.project_name,
          trade: p.trade_package,
          status: p.status,
          bids: p.bids?.length || 0,
          gaps: p.flags?.length || 0,
          date: new Date(p.created_at),
          dateStr: new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
        })))
      } else {
        // Demo
        setProjects([
          { id: 'd1', name: 'Riverfront Tower B', trade: 'Electrical', bids: 5, gaps: 3, date: new Date('2024-10-12'), dateStr: 'Oct 12, 2024', status: 'ready' },
          { id: 'd2', name: 'Nexus HQ Campus', trade: 'Mechanical', bids: 8, gaps: 0, date: new Date('2024-10-10'), dateStr: 'Oct 10, 2024', status: 'complete' },
          { id: 'd3', name: 'Data Center Omega', trade: 'Electrical', bids: 6, gaps: 2, date: new Date('2024-09-25'), dateStr: 'Sep 25, 2024', status: 'ready' },
          { id: 'd4', name: 'Alpha Tower Core', trade: 'Concrete', bids: 12, gaps: 3, date: new Date('2024-09-10'), dateStr: 'Sep 10, 2024', status: 'complete' },
        ])
        setAllGaps([
          { gap_low: 21200, gap_high: 21200 },
          { gap_low: 6200, gap_high: 6200 },
          { gap_low: 24000, gap_high: 24000 },
        ])
      }
    } catch (err) { console.error(err) }
    setLoading(false)
  }

  // ── Filtering ──────────────────────────────────────────────────────────────
  const applyFilters = () => { setTradePill(pendingTrade); setDateRange(pendingDate) }

  const filtered = useMemo(() => {
    const now = new Date()
    const cutoff = dateRange === 'Last 7 days' ? 7 : dateRange === 'Last 30 days' ? 30 : dateRange === 'Last 90 days' ? 90 : null
    return projects.filter(p => {
      const tradeOk = tradePill === 'All Trades' || p.trade === tradePill
      const dateOk = !cutoff || (now - p.date) / 86400000 <= cutoff
      return tradeOk && dateOk
    })
  }, [projects, tradePill, dateRange])

  const filteredGaps = useMemo(() => {
    const ids = new Set(filtered.map(p => p.id))
    return allGaps.filter(g => !g.project_id || ids.has(g.project_id))
  }, [filtered, allGaps])

  const totalGaps = filtered.reduce((s, p) => s + p.gaps, 0)
  const valueProtected = filteredGaps.reduce((s, g) => {
    const avg = Math.round(((g.gap_low || 0) + (g.gap_high || 0)) / 2)
    return s + avg
  }, 0)

  const trades = ['All Trades', ...new Set(projects.map(p => p.trade))]

  // ── Per-row exports ────────────────────────────────────────────────────────
  const fetchProjectData = async (projectId) => {
    const [{ data: bidsData }, { data: scopeData }, { data: flagsData }] = await Promise.all([
      supabase.from('bids').select('*').eq('project_id', projectId).order('created_at'),
      supabase.from('scope_items').select('*').eq('project_id', projectId),
      supabase.from('flags').select('*').eq('project_id', projectId),
    ])
    return { bids: bidsData || [], scope: scopeData || [], flags: flagsData || [] }
  }

  const buildExcelBlob = (proj, bids, scope, flags) => {
    const itemSet = new Set(scope.map(s => s.item_name))
    const items = [...itemSet].sort()
    const head = ['Scope Item', ...bids.map(b => b.company_name)]
    const rows = items.map(item => {
      const r = [item]
      bids.forEach(bid => {
        const si = scope.find(s => s.bid_id === bid.id && s.item_name === item)
        r.push(si ? (si.status === 'excluded' ? 'EXCLUDED' : fmt(si.amount)) : 'EXCLUDED')
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
    return XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  }

  const buildPdfBlob = (proj, bids, flags) => {
    const doc = new jsPDF()
    doc.setFontSize(18); doc.text('Bid Leveling Summary', 14, 20)
    doc.setFontSize(11); doc.text(`${proj.name} — ${proj.trade}`, 14, 30)
    doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, 14, 37)
    let y = 50
    doc.setFont('helvetica', 'bold'); doc.text('Bids:', 14, y); doc.setFont('helvetica', 'normal'); doc.text(`${bids.length}`, 40, y); y += 7
    doc.setFont('helvetica', 'bold'); doc.text('Gaps:', 14, y); doc.setFont('helvetica', 'normal'); doc.text(`${flags.filter(f => f.flag_type === 'scope_gap').length}`, 40, y); y += 14
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
      autoTable(doc, { startY: y + 4, theme: 'grid', head: [['Item', 'Gap', 'Reason']], body: gapRows, headStyles: { fillColor: [220, 38, 38] }, columnStyles: { 2: { cellWidth: 70 } } })
    }
    doc.setFontSize(9); doc.setFont('helvetica', 'normal')
    doc.text('Prepared using BidClear — bidclear.com', 14, doc.internal.pageSize.height - 12)
    return doc.output('arraybuffer')
  }

  const downloadExcel = async (proj) => {
    const { bids, scope, flags } = proj.id.startsWith('d') ? demoData() : await fetchProjectData(proj.id)
    const blob = buildExcelBlob(proj, bids, scope, flags)
    const url = URL.createObjectURL(new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
    const a = document.createElement('a'); a.href = url; a.download = `${proj.name.replace(/\s+/g, '_')}_BidClear.xlsx`; a.click()
    URL.revokeObjectURL(url)
  }

  const downloadPdf = async (proj) => {
    const { bids, flags } = proj.id.startsWith('d') ? demoData() : await fetchProjectData(proj.id)
    const buf = buildPdfBlob(proj, bids, flags)
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }))
    const a = document.createElement('a'); a.href = url; a.download = `${proj.name.replace(/\s+/g, '_')}_BidClear.pdf`; a.click()
    URL.revokeObjectURL(url)
  }

  const demoData = () => ({
    bids: [
      { id: 'd1', company_name: 'Harbor Electric', base_total: 292500, adjusted_total: 292500, risk_level: 'low' },
      { id: 'd2', company_name: 'SunState', base_total: 261000, adjusted_total: 303400, risk_level: 'high' },
    ],
    scope: [],
    flags: [{ id: 'df1', bid_id: 'd2', item_name: 'Permits', flag_type: 'scope_gap', gap_low: 6200, gap_high: 6200, recommendation: 'Add to adjusted total.', extracted_text: 'Permits excluded.' }],
  })

  const exportAllZip = async () => {
    setZipProgress('Starting…')
    const zip = new JSZip()
    for (let i = 0; i < filtered.length; i++) {
      const proj = filtered[i]
      setZipProgress(`Building ZIP… ${i + 1} of ${filtered.length} reports done`)
      try {
        const { bids, flags } = proj.id.startsWith('d') ? demoData() : await fetchProjectData(proj.id)
        const buf = buildPdfBlob(proj, bids, flags)
        zip.file(`${proj.name.replace(/\s+/g, '_')}_BidClear.pdf`, buf)
      } catch (err) { console.error(`Skipping ${proj.name}:`, err) }
    }
    setZipProgress('Compressing…')
    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'BidClear_All_Reports.zip'; a.click()
    URL.revokeObjectURL(url)
    setZipProgress(null)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
      <Navbar active="reports" />

      <main className="flex-grow w-full max-w-[1200px] mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-[28px] font-bold text-charcoal mb-1">Reports</h1>
            <p className="text-sm text-gray-text">All completed bid leveling sessions</p>
          </div>
          <button
            onClick={exportAllZip}
            disabled={!!zipProgress || filtered.length === 0}
            className="flex items-center gap-2 bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-5 py-2.5 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
          >
            {zipProgress ? (
              <><span className="material-symbols-outlined text-base animate-spin">sync</span>{zipProgress}</>
            ) : (
              <><span className="material-symbols-outlined text-base">folder_zip</span>Export All as ZIP</>
            )}
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-5 mb-8">
          {[
            { label: 'Total Reports', value: filtered.length, icon: 'description', color: 'text-brand-blue' },
            { label: 'Scope Gaps Caught', value: totalGaps, icon: 'warning', color: totalGaps > 0 ? 'text-brand-red' : 'text-charcoal' },
            { label: 'Estimated Value Protected', value: fmtLarge(valueProtected), icon: 'savings', color: 'text-brand-green' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="bg-white border border-gray-border rounded-xl px-6 py-5 flex items-center gap-4">
              <span className={`material-symbols-outlined text-3xl ${color}`}>{icon}</span>
              <div>
                <p className="text-xs font-semibold text-gray-text uppercase mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4 mb-6 bg-white border border-gray-border rounded-xl px-5 py-4">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-text uppercase">Trade</label>
            <select
              value={pendingTrade}
              onChange={e => setPendingTrade(e.target.value)}
              className="border border-gray-border rounded-lg px-3 py-1.5 text-sm text-charcoal outline-none focus:border-brand-blue bg-white cursor-pointer"
            >
              {trades.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-text uppercase">Date</label>
            <select
              value={pendingDate}
              onChange={e => setPendingDate(e.target.value)}
              className="border border-gray-border rounded-lg px-3 py-1.5 text-sm text-charcoal outline-none focus:border-brand-blue bg-white cursor-pointer"
            >
              {DATE_RANGES.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <button
            onClick={applyFilters}
            className="ml-2 bg-brand-blue hover:bg-brand-blue-dark text-white text-xs font-semibold px-4 py-1.5 rounded-lg cursor-pointer transition-colors"
          >
            Apply
          </button>
          {(tradePill !== 'All Trades' || dateRange !== 'All time') && (
            <button
              onClick={() => { setTradePill('All Trades'); setDateRange('All time'); setPendingTrade('All Trades'); setPendingDate('All time') }}
              className="text-xs text-gray-text bg-transparent border-0 cursor-pointer hover:text-brand-red transition-colors"
            >
              Clear filters ✕
            </button>
          )}
        </div>

        {/* Empty State */}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-32">
            <span className="material-symbols-outlined text-gray-300 text-6xl mb-4">description</span>
            <p className="text-lg font-bold text-charcoal mb-2">No reports yet</p>
            <p className="text-sm text-gray-text mb-6 text-center max-w-xs">
              Complete your first bid leveling session to see reports here.
            </p>
            <button
              onClick={() => navigate('/projects/new')}
              className="bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-5 py-2.5 rounded-lg cursor-pointer transition-colors"
            >
              Start New Project
            </button>
          </div>
        )}

        {/* Table */}
        {!loading && filtered.length > 0 && (
          <div className="w-full overflow-x-auto border border-gray-border rounded-xl bg-white">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-brand-gray border-b border-gray-border">
                  {['Project Name', 'Trade', 'Bids', 'Gaps Found', 'Report Date', 'Download'].map(h => (
                    <th key={h} className={`px-6 py-3.5 text-xs font-semibold text-gray-text uppercase ${h === 'Bids' ? 'text-right' : h === 'Gaps Found' ? 'text-center' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                {filtered.map(p => (
                  <tr key={p.id} className="border-b border-gray-border hover:bg-brand-blue-light/40 transition-colors group">
                    <td
                      onClick={() => navigate(`/projects/${p.id}/table`)}
                      className="px-6 py-4 font-bold text-brand-blue cursor-pointer hover:underline border-l-2 border-transparent group-hover:border-brand-blue transition-all"
                    >
                      {p.name}
                    </td>
                    <td className="px-6 py-4 text-gray-text">{p.trade}</td>
                    <td className="px-6 py-4 text-right font-mono text-charcoal">{p.bids}</td>
                    <td className={`px-6 py-4 text-center font-bold ${p.gaps > 0 ? 'text-brand-red' : 'text-gray-text'}`}>
                      {p.gaps > 0 ? p.gaps : '—'}
                    </td>
                    <td className="px-6 py-4 text-gray-text">{p.dateStr}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => downloadExcel(p)}
                          title="Download Excel"
                          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold border border-brand-green text-brand-green rounded-lg bg-transparent cursor-pointer hover:bg-brand-green hover:text-white transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">table_view</span> XLS
                        </button>
                        <button
                          onClick={() => downloadPdf(p)}
                          title="Download PDF"
                          className="flex items-center gap-1 px-3 py-1 text-xs font-semibold border border-brand-red text-brand-red rounded-lg bg-transparent cursor-pointer hover:bg-brand-red hover:text-white transition-colors"
                        >
                          <span className="material-symbols-outlined text-sm">picture_as_pdf</span> PDF
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-24">
            <span className="material-symbols-outlined text-brand-blue text-3xl animate-spin">sync</span>
          </div>
        )}
      </main>
    </div>
  )
}
