import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useDemo } from '../lib/DemoContext'

export default function ProtectedRoute({ children }) {
  const navigate = useNavigate()
  const { isDemo } = useDemo()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (isDemo) {
      setChecked(true)
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate('/login', { replace: true })
      } else {
        setChecked(true)
      }
    })
  }, [navigate, isDemo])

  if (!checked) return null
  return children
}
