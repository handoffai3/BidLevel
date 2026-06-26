import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'

export default function Dashboard() {
  const navigate = useNavigate()
  const [userName, setUserName] = useState('')
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [monthStats, setMonthStats] = useState({ bids: 0, hours: 0 })

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Get user profile
      const { data: userData } = await supabase.auth.getUser()
      if (userData?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', userData.user.id)
          .single()
        setUserName(profile?.full_name?.split(' ')[0] || 'there')
      }

      let query = supabase
        .from('projects')
        .select('id, project_name, trade_package, status, created_at, bids(id, base_total), flags(id)')
        .order('created_at', { ascending: false })
        .limit(6)
        
      if (userData?.user) {
        query = query.eq('user_id', userData.user.id)
      }
      
      const { data: projData } = await query

      if (projData && projData.length > 0) {
        const mapped = projData.map(p => ({
          id: p.id,
          name: p.project_name,
          trade: p.trade_package,
          bids: p.bids?.filter(b => b.base_total !== null).length || 0,
          gaps: p.flags?.length || 0,
          status: p.status,
          date: new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        }))
        setProjects(mapped)

        // Month stats
        const totalBids = mapped.reduce((sum, p) => sum + p.bids, 0)
        setMonthStats({ bids: totalBids, hours: mapped.length * 4 })
      } else {
        if (userData?.user) {
          setProjects([])
          setMonthStats({ bids: 0, hours: 0 })
        } else {
          // Demo data
          setProjects([
            { id: 'd1', name: 'Riverfront Tower B', trade: 'Electrical', bids: 5, gaps: 3, status: 'ready', date: 'Oct 12' },
            { id: 'd2', name: 'Nexus HQ Campus', trade: 'HVAC & Plumbing', bids: 8, gaps: 0, status: 'complete', date: 'Oct 10' },
            { id: 'd3', name: 'Terminal 4 Expansion', trade: 'Structural Steel', bids: 5, gaps: 1, status: 'processing', date: 'Oct 8' },
            { id: 'd4', name: 'Data Center Omega', trade: 'Fire Suppression', bids: 6, gaps: 2, status: 'processing', date: 'Sep 28' },
            { id: 'd5', name: 'Metro Link Stations', trade: 'Elevators', bids: 4, gaps: 0, status: 'ready', date: 'Sep 15' },
            { id: 'd6', name: 'Alpha Tower Core', trade: 'Concrete', bids: 12, gaps: 3, status: 'complete', date: 'Sep 10' },
          ])
          setMonthStats({ bids: 24, hours: 24 })
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'complete': return 'bg-brand-green'
      case 'ready': return 'bg-brand-blue'
      case 'processing': return 'bg-brand-amber'
      default: return 'bg-gray-300'
    }
  }

  const needsReview = projects.filter(p => p.status === 'ready' || p.status === 'processing').length

  const handleCardClick = (p) => {
    if (p.status === 'processing') navigate(`/projects/${p.id}/processing`)
    else navigate(`/projects/${p.id}/table`)
  }

  return (
    <div className="min-h-screen bg-page-bg flex flex-col">
      <Navbar active="dashboard" />

      <main className="flex-grow w-full max-w-[1200px] mx-auto px-12 py-12">
        {/* Title Row */}
        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-[32px] font-bold text-charcoal mb-1">
              Good morning, {userName}.
            </h1>
            <p className="text-sm text-gray-text">
              You have {needsReview} project{needsReview !== 1 ? 's' : ''} needing review.
            </p>
          </div>
          <button
            onClick={() => navigate('/projects/new')}
            className="bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 cursor-pointer transition-colors"
          >
            <span className="text-lg leading-none">+</span> NEW PROJECT
          </button>
        </div>

        {/* Stats Banner */}
        <div className="bg-white border border-gray-border border-l-4 border-l-brand-blue rounded-xl px-6 py-4 mb-8">
          <p className="text-sm text-gray-text">
            This month: <span className="font-semibold text-charcoal">{monthStats.bids} bids leveled</span> · <span className="font-semibold text-charcoal">{monthStats.hours} hours saved</span> · <span className="font-semibold text-charcoal">$0 subscription fees</span>
          </p>
        </div>

        {/* Project Cards Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <span className="material-symbols-outlined text-brand-blue text-3xl animate-spin">sync</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.length === 0 ? (
              <div className="col-span-full bg-white border border-gray-border rounded-xl p-12 text-center">
                <span className="material-symbols-outlined text-gray-300 text-5xl mb-4">folder_open</span>
                <h3 className="text-lg font-bold text-charcoal mb-2">No projects yet</h3>
                <p className="text-sm text-gray-text mb-6 max-w-xs mx-auto">
                  Create your first project to start comparing subcontractor bids.
                </p>
                <button
                  onClick={() => navigate('/projects/new')}
                  className="bg-brand-blue hover:bg-brand-blue-dark text-white text-sm font-semibold px-5 py-2.5 rounded-lg inline-flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <span className="text-lg leading-none">+</span> NEW PROJECT
                </button>
              </div>
            ) : (
              projects.map(p => (
                <div
                  key={p.id}
                  onClick={() => handleCardClick(p)}
                  className="bg-white border border-gray-border rounded-xl p-6 cursor-pointer hover:shadow-md transition-shadow overflow-hidden relative"
                >
                  {/* Top Row */}
                  <div className="flex justify-between items-start mb-5">
                    <h3 className="text-lg font-bold text-charcoal leading-snug pr-3">{p.name}</h3>
                    <span className="bg-brand-blue-light text-brand-blue text-xs font-semibold uppercase px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
                      {p.trade}
                    </span>
                  </div>

                  {/* Mini Stats */}
                  <div className="flex items-center gap-6 text-sm mb-6">
                    <div>
                      <span className="text-gray-text text-xs uppercase font-semibold block mb-0.5">Bids</span>
                      <span className="text-charcoal font-bold">{p.bids}</span>
                    </div>
                    <div className="w-px h-8 bg-gray-border" />
                    <div>
                      <span className="text-gray-text text-xs uppercase font-semibold block mb-0.5">Gaps Found</span>
                      <span className={`font-bold ${p.gaps > 0 ? 'text-brand-red' : 'text-gray-text'}`}>
                        {p.gaps > 0 ? p.gaps : '—'}
                      </span>
                    </div>
                    <div className="w-px h-8 bg-gray-border" />
                    <div>
                      <span className="text-gray-text text-xs uppercase font-semibold block mb-0.5">Created</span>
                      <span className="text-charcoal font-medium">{p.date}</span>
                    </div>
                  </div>

                  {/* Status Bar */}
                  <div className={`absolute bottom-0 left-0 right-0 h-1 ${getStatusColor(p.status)} rounded-b-xl`} />
                </div>
              ))
            )}
          </div>
        )}
      </main>
    </div>
  )
}
