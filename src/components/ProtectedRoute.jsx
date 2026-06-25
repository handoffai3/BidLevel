import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute({ children }) {
  const navigate = useNavigate()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        navigate('/login', { replace: true })
      } else {
        setChecked(true)
      }
    })
  }, [navigate])

  if (!checked) return null
  return children
}
