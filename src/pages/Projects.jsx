import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

export default function Projects() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalProjects, setTotalProjects] = useState(0)
  const itemsPerPage = 10

  useEffect(() => { fetchProjects() }, [currentPage])

  const fetchProjects = async () => {
    setLoading(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id

      let query = supabase
        .from('projects')
        .select('id, project_name, trade_package, client_name, status, created_at, bids(id), flags(id)', { count: 'exact' })
        .order('created_at', { ascending: false })

      if (userId) {
        query = query.eq('user_id', userId)
      }

      const from = (currentPage - 1) * itemsPerPage
      const to = from + itemsPerPage - 1

      const { data, count, error } = await query.range(from, to)

      if (error) throw error

      setTotalProjects(count || 0)

      if (data && data.length > 0) {
        setProjects(data.map(p => ({
          id: p.id,
          name: p.project_name,
          trade: p.trade_package,
          clientName: p.client_name || '',
          bids: p.bids?.length || 0,
          gaps: p.flags?.length || 0,
          status: p.status,
          date: new Date(p.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
        })))
      } else {
        // Demo
        setProjects([
          { id: 'd1', name: 'Alpha Tower Core', trade: 'Concrete Superstructure', clientName: '', bids: 12, gaps: 3, status: 'processing', date: 'Oct 15, 2024' },
          { id: 'd2', name: 'Nexus HQ Campus', trade: 'HVAC & Plumbing', clientName: '', bids: 8, gaps: 0, status: 'ready', date: 'Oct 12, 2024' },
          { id: 'd3', name: 'Terminal 4 Expansion', trade: 'Structural Steel', clientName: '', bids: 5, gaps: 1, status: 'processing', date: 'Oct 10, 2024' },
          { id: 'd4', name: 'Riverfront Residential', trade: 'Electrical Fit-out', clientName: '', bids: 14, gaps: 0, status: 'complete', date: 'Sep 28, 2024' },
          { id: 'd5', name: 'Data Center Omega', trade: 'Fire Suppression', clientName: '', bids: 6, gaps: 2, status: 'processing', date: 'Sep 25, 2024' },
          { id: 'd6', name: 'Metro Link Stations', trade: 'Elevators & Escalators', clientName: '', bids: 4, gaps: 0, status: 'ready', date: 'Sep 15, 2024' },
        ])
        setTotalProjects(24)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = useMemo(() => {
    return projects.filter(p => {
      const s = searchTerm.toLowerCase()
      const matchSearch = !s || p.name.toLowerCase().includes(s) || p.trade.toLowerCase().includes(s) || p.clientName.toLowerCase().includes(s)
      const matchStatus = statusFilter === 'All' || p.status === statusFilter.toLowerCase()
      return matchSearch && matchStatus
    })
  }, [projects, searchTerm, statusFilter])

  const totalPages = Math.ceil(totalProjects / itemsPerPage) || 1

  // `filtered` is already our set of projects that we want to show.
  // We no longer slice `filtered` because the server paginated it for us!
  const paged = filtered

  const handleOpen = (p) => {
    if (p.status === 'processing') navigate(`/projects/${p.id}/processing`)
    else navigate(`/projects/${p.id}/table`)
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure? This cannot be undone.')) return
    try {
      if (id.startsWith('d')) {
        setProjects(prev => prev.filter(p => p.id !== id))
        setTotalProjects(prev => prev - 1)
        alert('Project deleted')
        return
      }
      const { error } = await supabase.from('projects').delete().eq('id', id)
      if (error) throw error
      setProjects(prev => prev.filter(p => p.id !== id))
      setTotalProjects(prev => prev - 1)
      alert('Project deleted')
    } catch (err) {
      console.error(err)
      alert('Failed to delete project.')
    }
  }

  const statusBadge = (status) => {
    const styles = {
      processing: 'bg-brand-blue-light text-brand-blue border-brand-blue-border',
      ready: 'bg-brand-green-light text-brand-green border-brand-green-border',
      complete: 'bg-gray-100 text-gray-500 border-gray-200',
    }
    const labels = { processing: 'Processing', ready: 'Ready', complete: 'Complete' }
    return (
      <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 border rounded-full ${styles[status] || styles.complete}`}>
        {labels[status] || status}
      </span>
    )
  }

  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
      <Navbar active="projects" />

      <main className="flex-grow w-full max-w-[1200px] mx-auto px-12 py-12">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-[28px] font-bold text-charcoal">All Projects</h1>
          <div className="flex items-center gap-4">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-text text-lg">search</span>
              <input
                type="text"
                placeholder="Search projects..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-64 border border-gray-border rounded-lg text-sm text-charcoal outline-none focus:border-brand-blue transition-colors bg-white"
              />
            </div>
            <button
              onClick={() => navigate('/projects/new')}
              className="bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-4 py-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <span className="text-lg leading-none">+</span> New Project
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 mb-6 border-b border-gray-border pb-4">
          {['All', 'Processing', 'Ready', 'Complete'].map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-4 py-1.5 text-sm font-medium rounded-lg border cursor-pointer transition-all ${
                statusFilter === f
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : 'bg-white text-gray-text border-gray-border hover:border-gray-400'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="w-full overflow-x-auto border border-gray-border rounded-xl bg-white">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-brand-gray border-b border-gray-border">
                <th className="px-6 py-3.5 text-xs font-semibold text-gray-text uppercase w-[22%]">Project Name</th>
                <th className="px-6 py-3.5 text-xs font-semibold text-gray-text uppercase w-[18%]">Trade Package</th>
                <th className="px-6 py-3.5 text-xs font-semibold text-gray-text uppercase w-[8%] text-right">Bids</th>
                <th className="px-6 py-3.5 text-xs font-semibold text-gray-text uppercase w-[10%] text-center">Gaps Found</th>
                <th className="px-6 py-3.5 text-xs font-semibold text-gray-text uppercase w-[12%]">Status</th>
                <th className="px-6 py-3.5 text-xs font-semibold text-gray-text uppercase w-[14%]">Date Created</th>
                <th className="px-6 py-3.5 text-xs font-semibold text-gray-text uppercase w-[16%] text-right">Action</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {paged.length > 0 ? paged.map(p => (
                <tr key={p.id} className="border-b border-gray-border hover:bg-brand-blue-light/50 transition-colors group">
                  <td className="px-6 py-4 font-bold text-charcoal border-l-2 border-transparent group-hover:border-brand-blue">{p.name}</td>
                  <td className="px-6 py-4 text-gray-text">{p.trade}</td>
                  <td className="px-6 py-4 text-right font-mono text-charcoal">{p.bids}</td>
                  <td className={`px-6 py-4 text-center font-bold ${p.gaps > 0 ? 'text-brand-red' : 'text-gray-text'}`}>
                    {p.gaps > 0 ? p.gaps : '—'}
                  </td>
                  <td className="px-6 py-4">{statusBadge(p.status)}</td>
                  <td className="px-6 py-4 text-gray-text">{p.date}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => handleOpen(p)} className="px-3 py-1 text-xs font-semibold uppercase border border-brand-blue text-brand-blue rounded-lg bg-transparent cursor-pointer hover:bg-brand-blue hover:text-white transition-colors">Open</button>
                      <button onClick={() => handleDelete(p.id)} className="px-3 py-1 text-xs font-semibold uppercase border border-gray-border text-gray-text rounded-lg bg-transparent cursor-pointer hover:border-brand-red hover:text-brand-red transition-colors">Delete</button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="7" className="px-6 py-10 text-center text-gray-text">No projects found matching your search and filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex justify-between items-center mt-6">
          <p className="text-sm text-gray-text">
            Showing {filtered.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, totalProjects)} of {totalProjects} projects
          </p>
          <div className="flex gap-2">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => p - 1)}
              className="px-3 py-1.5 text-sm border border-gray-border rounded-lg text-gray-text bg-white cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              ← Previous
            </button>
            <button
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
              className="px-3 py-1.5 text-sm border border-gray-border rounded-lg text-gray-text bg-white cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
