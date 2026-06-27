import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { DemoProvider } from './lib/DemoContext'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Projects from './pages/Projects'
import NewProject from './pages/NewProject'
import Processing from './pages/Processing'
import BidTable from './pages/BidTable'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import ProtectedRoute from './components/ProtectedRoute'

export default function App() {
  return (
    <DemoProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/dashboard" element={
            <ProtectedRoute><Dashboard /></ProtectedRoute>
          }/>
          <Route path="/projects" element={
            <ProtectedRoute><Projects /></ProtectedRoute>
          }/>
          <Route path="/projects/new" element={
            <ProtectedRoute><NewProject /></ProtectedRoute>
          }/>
          <Route path="/projects/:id/processing" element={
            <ProtectedRoute><Processing /></ProtectedRoute>
          }/>
          <Route path="/projects/:id/table" element={
            <ProtectedRoute><BidTable /></ProtectedRoute>
          }/>
          <Route path="/reports" element={
            <ProtectedRoute><Reports /></ProtectedRoute>
          }/>
          <Route path="/settings" element={
            <ProtectedRoute><Settings /></ProtectedRoute>
          }/>
        </Routes>
      </BrowserRouter>
    </DemoProvider>
  )
}
