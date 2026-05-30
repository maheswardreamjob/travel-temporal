import { useState, useEffect, useRef } from 'react'
import './App.css'

// API Base URL - Configured to point to the Spring Boot REST API
const API_BASE = 'http://localhost:9191/travel'

const LOCATIONS = [
  { value: 'Paris, France', label: 'Paris, France (CDG)' },
  { value: 'Tokyo, Japan', label: 'Tokyo, Japan (HND)' },
  { value: 'London, United Kingdom', label: 'London, UK (LHR)' },
  { value: 'New York, USA', label: 'New York, USA (JFK)' },
  { value: 'Bali, Indonesia', label: 'Bali, Indonesia (DPS)' },
  { value: 'Mumbai, India', label: 'Mumbai, India (BOM)' },
  { value: 'Sydney, Australia', label: 'Sydney, Australia (SYD)' }
]

function App() {
  // Booking Form State
  const [userId, setUserId] = useState('mahesh_dev')
  const [origin, setOrigin] = useState('Paris, France')
  const [destination, setDestination] = useState('Tokyo, Japan')
  const [departureDate, setDepartureDate] = useState('2026-06-15')
  const [returnDate, setReturnDate] = useState('2026-06-22')
  const [travelClass, setTravelClass] = useState('Business Class')
  const [hotelRating, setHotelRating] = useState('5-Star Luxury Resort')
  const [transportVehicle, setTransportVehicle] = useState('Tesla Model Y (EV)')
  const [travelersCount, setTravelersCount] = useState(2)
  const [includeInsurance, setIncludeInsurance] = useState(true)
  const [simulateFlightFailure, setSimulateFlightFailure] = useState(false)
  const [simulateHotelFailure, setSimulateHotelFailure] = useState(false)
  const [simulateTransportFailure, setSimulateTransportFailure] = useState(false)
  const [simulatePaymentFailure, setSimulatePaymentFailure] = useState(false)
  const [simulateLoyaltyFailure, setSimulateLoyaltyFailure] = useState(false)

  // UI / Workflow States
  const [isBookingActive, setIsBookingActive] = useState(false)
  const [workflowStatus, setWorkflowStatus] = useState('PENDING_START')
  const [isOfflineSimulation, setIsOfflineSimulation] = useState(false)
  const [activeTab, setActiveTab] = useState('application')
  const [activeSubTab, setActiveSubTab] = useState('temporal')
  const [workflowId, setWorkflowId] = useState('')
  const [workflowRunId, setWorkflowRunId] = useState('')
  const [isBackendOffline, setIsBackendOffline] = useState(false)
  const isBackendOfflineRef = useRef(false)
  
  // Countdown Timer State
  const [countdown, setCountdown] = useState(120) // 2 minutes
  const timerRef = useRef(null)

  // Real-time Event Console Logs
  const [logs, setLogs] = useState([
    { time: new Date().toLocaleTimeString(), msg: 'Dashboard initialized. Ready to launch Temporal booking workflow.', type: 'info' }
  ])
  const consoleEndRef = useRef(null)
  
  // Polling Interval Ref
  const pollIntervalRef = useRef(null)

  // Auto scroll console to bottom when logs update
  useEffect(() => {
    consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  // Helper to add a log entry
  const addLog = (msg, type = 'info') => {
    setLogs((prev) => [
      ...prev,
      { time: new Date().toLocaleTimeString(), msg, type }
    ])
  }

  // Countdown timer logic for PENDING_USER_CONFIRMATION
  useEffect(() => {
    if (workflowStatus === 'PENDING_USER_CONFIRMATION') {
      // Start a 120s timer
      setCountdown(isOfflineSimulation ? 15 : 120) // Fast 15s timer for offline simulation demo
      
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current)
            if (isOfflineSimulation) {
              // Trigger compensation locally
              triggerOfflineCompensation()
            }
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [workflowStatus])

  // Polls backend status
  const startStatusPolling = (uid) => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current)

    addLog(`[CLIENT] Starting Temporal state polling for workflow ID: travel_${uid}`, 'info')
    
    let lastStatus = ''
    pollIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/status/${uid}`)
        if (!response.ok) throw new Error('Failed to query status')
        const status = await response.text()
        
        if (isBackendOfflineRef.current) {
          isBackendOfflineRef.current = false
          setIsBackendOffline(false)
          addLog('⚡ [CLIENT] Connection restored! Spring Boot backend is back online.', 'success')
          addLog('🔄 [CLIENT] Resuming state tracking. Notice how Temporal continues workflow without state loss.', 'success')
        }

        if (status !== lastStatus) {
          handleStatusTransition(status)
          lastStatus = status
        }
      } catch (err) {
        if (!isBackendOfflineRef.current) {
          isBackendOfflineRef.current = true
          setIsBackendOffline(true)
          addLog('❌ [CLIENT] Connection lost! Spring Boot backend is offline.', 'danger')
          addLog('💡 [DEMO] Temporal workflow state is preserved in Temporal Server. Restart the Spring Boot app to resume!', 'warn')
        }
        console.error('Polling error:', err)
      }
    }, 1500)
  }

  // Manage logs and terminal updates during status transitions
  const handleStatusTransition = (status) => {
    setWorkflowStatus(status)
    
    switch(status) {
      case 'FLIGHT_BOOKING_IN_PROGRESS':
        addLog(`✈️ [ACTIVITY] Initiating flight reservation: From ${origin} to ${destination} on ${departureDate} (${travelClass})...`, 'info')
        break
      case 'HOTEL_BOOKING_IN_PROGRESS':
        addLog('🎉 [ACTIVITY] Flight booking successful! Registering compensation.', 'success')
        addLog(`🏨 [ACTIVITY] Initiating hotel reservation: ${hotelRating} in ${destination} (Check-out: ${returnDate})...`, 'info')
        break
      case 'TRANSPORT_ARRANGING_IN_PROGRESS':
        addLog('🎉 [ACTIVITY] Hotel booking successful! Registering compensation.', 'success')
        addLog(`🚗 [ACTIVITY] Arranging executive transfer: Chauffeur-driven ${transportVehicle}...`, 'info')
        break
      case 'PENDING_USER_CONFIRMATION':
        addLog('🎉 [ACTIVITY] Executive transfer successfully arranged! Registering compensation.', 'success')
        addLog('⏳ [WORKFLOW] Checkpoint reached: Awaiting final passenger confirmation signal...', 'warn')
        break
      case 'CONFIRMED':
        addLog('📩 [WORKFLOW] Received user confirmation signal. Finalizing ledger transaction...', 'success')
        addLog(`🎉 [ACTIVITY] Travel booking finalized & confirmed! Enjoy your journey, ${userId}!`, 'success')
        stopPolling()
        break
      case 'COMPENSATING':
        addLog('❌ [TRANSACTION] Saga Initiated: Executing rollbacks due to timeout or failure signal.', 'danger')
        break
      case 'COMPENSATING_TRANSPORT':
        addLog(`🔄 [ACTIVITY] Saga Compensation: Releasing executive transfer (${transportVehicle}) reservation...`, 'warn')
        break
      case 'COMPENSATING_HOTEL':
        addLog(`🔄 [ACTIVITY] Saga Compensation: Cancelling hotel reservation (${hotelRating}) at ${destination}...`, 'warn')
        break
      case 'COMPENSATING_FLIGHT':
        addLog(`🔄 [ACTIVITY] Saga Compensation: Cancelling flight booking to ${destination}...`, 'warn')
        break
      case 'CANCELLED':
        addLog('❌ [ACTIVITY] Rollback compensation finished. System returned to original clean state.', 'danger')
        addLog('⏹️ [WORKFLOW] Transaction terminated: CANCELLED (Fully Compensated & Rolled Back)', 'danger')
        stopPolling()
        break
      case 'FAILED':
        addLog('❌ [WORKFLOW] Workflow execution encountered a critical failure!', 'danger')
        stopPolling()
        break
      case 'NOT_FOUND':
        addLog('🔍 [CLIENT] Workflow finished or not found. Polling ended.', 'info')
        stopPolling()
        break
      default:
        break
    }
  }

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }
  }

  // Clear polling on unmount
  useEffect(() => {
    return () => stopPolling()
  }, [])

  // Action: Launch the workflow
  const handleStartBooking = async (e) => {
    e.preventDefault()
    if (!userId.trim()) return

    setIsBookingActive(true)
    setWorkflowStatus('PENDING_START')
    setWorkflowId('')
    setWorkflowRunId('')
    setLogs([{ time: new Date().toLocaleTimeString(), msg: `🚀 Launching Travel Booking Workflow for User: ${userId}`, type: 'info' }])

    if (isOfflineSimulation) {
      // Run visual simulation locally
      runOfflineSimulation()
    } else {
      try {
        addLog(`[CLIENT] Sending POST /travel/book for user: ${userId}...`, 'info')
        const response = await fetch(`${API_BASE}/book`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            origin,
            destination,
            travelDate: departureDate,
            departureDate,
            returnDate,
            travelClass,
            hotelRating,
            transportVehicle,
            travelersCount: parseInt(travelersCount),
            includeInsurance,
            simulateFlightFailure,
            simulateHotelFailure,
            simulateTransportFailure,
            simulatePaymentFailure,
            simulateLoyaltyFailure
          })
        })

        if (!response.ok) {
          throw new Error(`Server returned code: ${response.status}`)
        }

        const data = await response.json()
        setWorkflowId(data.workflowId)
        setWorkflowRunId(data.runId)
        addLog(`[SERVER] ${data.status}`, 'success')
        addLog(`[CLIENT] Captured Workflow ID: ${data.workflowId} | Run ID: ${data.runId}`, 'info')
        startStatusPolling(userId)

      } catch (err) {
        addLog(`❌ [CLIENT] Connection error: Unable to reach Spring Boot API at ${API_BASE}.`, 'danger')
        addLog(`💡 [TIP] Make sure your Spring Boot server is running on port 9191, or toggle 'Offline Simulation Mode' above to test the UI!`, 'warn')
        setIsBookingActive(false)
      }
    }
  }

  // Action: Signal Temporal Workflow to Confirm
  const handleConfirmBooking = async () => {
    if (isOfflineSimulation) {
      // Confirm locally
      handleStatusTransition('CONFIRMED')
    } else {
      try {
        addLog(`[CLIENT] Sending confirmation signal POST /travel/confirm/${userId}...`, 'info')
        const response = await fetch(`${API_BASE}/confirm/${userId}`, {
          method: 'POST'
        })
        if (!response.ok) throw new Error('Signal dispatch failed')
        const msg = await response.text()
        addLog(`[SERVER] ${msg}`, 'success')
      } catch (err) {
        addLog(`❌ [CLIENT] Failed to send confirmation signal: ${err.message}`, 'danger')
      }
    }
  }

  // Action: Signal Temporal Workflow to Cancel/Reject
  const handleCancelBooking = async () => {
    if (isOfflineSimulation) {
      // Cancel locally
      triggerOfflineCompensation()
    } else {
      try {
        addLog(`[CLIENT] Sending cancellation signal POST /travel/cancel/${userId}...`, 'info')
        const response = await fetch(`${API_BASE}/cancel/${userId}`, {
          method: 'POST'
        })
        if (!response.ok) throw new Error('Cancellation signal dispatch failed')
        const msg = await response.text()
        addLog(`[SERVER] ${msg}`, 'warn')
      } catch (err) {
        addLog(`❌ [CLIENT] Failed to send cancellation signal: ${err.message}`, 'danger')
      }
    }
  }

  // Action: Terminate Spring Boot JVM (Chaos switch)
  const handleKillBackend = async () => {
    addLog('💥 [CLIENT] Initiating Chaos Engine: Terminating Spring Boot JVM...', 'danger')
    try {
      fetch(`${API_BASE}/kill`, { method: 'POST' }).catch(() => {})
      addLog('⚠️ [CLIENT] Kill signal sent. Server is shutting down. Polling will fail...', 'warn')
    } catch (err) {
      console.error(err)
    }
  }

  // Offline Simulator Engine (Fallback with full failure simulation support)
  const runOfflineSimulation = () => {
    setWorkflowId(`travel_${userId}`)
    setWorkflowRunId('sandbox-run-id-uuid-12345')
    
    // Simulate steps sequentially
    setTimeout(() => {
      if (!isBookingActive) return;
      handleStatusTransition('FLIGHT_BOOKING_IN_PROGRESS')
      
      setTimeout(() => {
        if (!isBookingActive) return;
        if (simulateFlightFailure) {
          addLog('❌ [ACTIVITY-SIM] Flight booking API timeout or service unavailable!', 'danger')
          triggerOfflineCompensation('flight')
          return
        }
        handleStatusTransition('HOTEL_BOOKING_IN_PROGRESS')
        
        setTimeout(() => {
          if (!isBookingActive) return;
          if (simulateHotelFailure) {
            addLog('❌ [ACTIVITY-SIM] Hotel room inventory lock failed!', 'danger')
            triggerOfflineCompensation('hotel')
            return
          }
          handleStatusTransition('TRANSPORT_ARRANGING_IN_PROGRESS')
          
          setTimeout(() => {
            if (!isBookingActive) return;
            if (simulateTransportFailure) {
              addLog('❌ [ACTIVITY-SIM] No executive vehicles available at airport transfer dispatch!', 'danger')
              triggerOfflineCompensation('transport')
              return
            }
            handleStatusTransition('PENDING_USER_CONFIRMATION')
          }, 1500)
        }, 1500)
      }, 1500)
    }, 1000)
  }

  const triggerOfflineCompensation = (failedStep) => {
    handleStatusTransition('COMPENSATING')
    
    if (failedStep === 'transport') {
      setTimeout(() => {
        handleStatusTransition('COMPENSATING_HOTEL')
        setTimeout(() => {
          handleStatusTransition('COMPENSATING_FLIGHT')
          setTimeout(() => {
            handleStatusTransition('CANCELLED')
          }, 1500)
        }, 1500)
      }, 1500)
    } else if (failedStep === 'hotel') {
      setTimeout(() => {
        handleStatusTransition('COMPENSATING_FLIGHT')
        setTimeout(() => {
          handleStatusTransition('CANCELLED')
        }, 1500)
      }, 1500)
    } else if (failedStep === 'flight') {
      setTimeout(() => {
        handleStatusTransition('CANCELLED')
      }, 1500)
    } else {
      // User cancelled at checkpoint
      setTimeout(() => {
        handleStatusTransition('COMPENSATING_TRANSPORT')
        setTimeout(() => {
          handleStatusTransition('COMPENSATING_HOTEL')
          setTimeout(() => {
            handleStatusTransition('COMPENSATING_FLIGHT')
            setTimeout(() => {
              handleStatusTransition('CANCELLED')
            }, 1500)
          }, 1500)
        }, 1500)
      }, 1500)
    }
  }

  // Saga Step Status Resolvers for UI styling classes & labels
  const getStepDetails = (stepName) => {
    if (!isBookingActive || workflowStatus === 'PENDING_START') {
      return { className: 'pending', label: 'PENDING' }
    }

    if (stepName === 'flight') {
      if (workflowStatus === 'RESERVING_PARALLEL') {
        return { className: 'active', label: 'RESERVING...' }
      }
      if (workflowStatus === 'COMPENSATING_FLIGHT') {
        return { className: 'compensating', label: 'COMPENSATING...' }
      }
      if (['PENDING_USER_CONFIRMATION', 'PAYMENT_IN_PROGRESS', 'BILLING_CHARGED', 'BILLING_INVOICED', 'BILLING_COMPLETED', 'CONFIRMED', 'COMPENSATING_TRANSPORT', 'COMPENSATING_HOTEL'].includes(workflowStatus)) {
        return { className: 'completed', label: 'COMPLETED' }
      }
      if (workflowStatus === 'CANCELLED') {
        return simulateFlightFailure ? { className: 'failed', label: 'FAILED' } : { className: 'compensated-done', label: 'COMPENSATED' }
      }
      return { className: 'pending', label: 'PENDING' }
    }

    if (stepName === 'hotel') {
      if (workflowStatus === 'RESERVING_PARALLEL') {
        return { className: 'active', label: 'RESERVING...' }
      }
      if (workflowStatus === 'COMPENSATING_HOTEL') {
        return { className: 'compensating', label: 'COMPENSATING...' }
      }
      if (['PENDING_USER_CONFIRMATION', 'PAYMENT_IN_PROGRESS', 'BILLING_CHARGED', 'BILLING_INVOICED', 'BILLING_COMPLETED', 'CONFIRMED', 'COMPENSATING_TRANSPORT'].includes(workflowStatus)) {
        return { className: 'completed', label: 'COMPLETED' }
      }
      if (workflowStatus === 'CANCELLED') {
        if (simulateHotelFailure) return { className: 'failed', label: 'FAILED' }
        if (simulateFlightFailure) return { className: 'pending', label: 'SKIPPED' }
        return { className: 'compensated-done', label: 'COMPENSATED' }
      }
      if (workflowStatus === 'COMPENSATING_FLIGHT') {
        return simulateHotelFailure ? { className: 'failed', label: 'FAILED' } : { className: 'compensated-done', label: 'COMPENSATED' }
      }
      return { className: 'pending', label: 'PENDING' }
    }

    if (stepName === 'transport') {
      if (workflowStatus === 'RESERVING_PARALLEL') {
        return { className: 'active', label: 'RESERVING...' }
      }
      if (workflowStatus === 'COMPENSATING_TRANSPORT') {
        return { className: 'compensating', label: 'COMPENSATING...' }
      }
      if (['PENDING_USER_CONFIRMATION', 'PAYMENT_IN_PROGRESS', 'BILLING_CHARGED', 'BILLING_INVOICED', 'BILLING_COMPLETED', 'CONFIRMED'].includes(workflowStatus)) {
        return { className: 'completed', label: 'COMPLETED' }
      }
      if (workflowStatus === 'CANCELLED') {
        if (simulateTransportFailure) return { className: 'failed', label: 'FAILED' }
        if (simulateFlightFailure || simulateHotelFailure) return { className: 'pending', label: 'SKIPPED' }
        return { className: 'compensated-done', label: 'COMPENSATED' }
      }
      if (['COMPENSATING_FLIGHT', 'COMPENSATING_HOTEL'].includes(workflowStatus)) {
        return simulateTransportFailure ? { className: 'failed', label: 'FAILED' } : { className: 'compensated-done', label: 'COMPENSATED' }
      }
      return { className: 'pending', label: 'PENDING' }
    }

    if (stepName === 'confirm') {
      if (workflowStatus === 'PENDING_USER_CONFIRMATION') {
        return { className: 'active', label: 'AWAITING ACCEPTANCE' }
      }
      if (['PAYMENT_IN_PROGRESS', 'BILLING_CHARGED', 'BILLING_INVOICED', 'BILLING_COMPLETED', 'CONFIRMED'].includes(workflowStatus)) {
        return { className: 'completed', label: 'ACCEPTED' }
      }
      if (workflowStatus === 'CANCELLED') {
        if (simulateFlightFailure || simulateHotelFailure || simulateTransportFailure) {
          return { className: 'pending', label: 'SKIPPED' }
        }
        return { className: 'failed', label: 'REJECTED' }
      }
      if (['COMPENSATING_FLIGHT', 'COMPENSATING_HOTEL', 'COMPENSATING_TRANSPORT'].includes(workflowStatus)) {
        return { className: 'failed', label: 'CANCELLED' }
      }
      return { className: 'pending', label: 'PENDING' }
    }

    if (stepName === 'payment') {
      if (workflowStatus === 'PAYMENT_IN_PROGRESS') {
        return { className: 'active', label: 'PROCESSING...' }
      }
      if (workflowStatus === 'BILLING_CHARGED') {
        return { className: 'active', label: 'CARD CHARGED' }
      }
      if (workflowStatus === 'BILLING_INVOICED') {
        return { className: 'active', label: 'INVOICED' }
      }
      if (workflowStatus === 'BILLING_COMPLETED' || workflowStatus === 'CONFIRMED') {
        return { className: 'completed', label: 'COMPLETED' }
      }
      if (workflowStatus === 'CANCELLED') {
        if (simulatePaymentFailure) return { className: 'failed', label: 'FAILED (DECLINED)' }
        if (simulateLoyaltyFailure) return { className: 'failed', label: 'FAILED (REFUNDED)' }
        return { className: 'pending', label: 'SKIPPED' }
      }
      if (workflowStatus === 'COMPENSATING') {
        return { className: 'compensating', label: 'REVERTING...' }
      }
      return { className: 'pending', label: 'PENDING' }
    }

    if (stepName === 'finalize') {
      if (workflowStatus === 'CONFIRMED') {
        return { className: 'completed', label: 'SUCCESS' }
      }
      if (workflowStatus === 'CANCELLED') {
        return { className: 'failed', label: 'ABORTED' }
      }
      return { className: 'pending', label: 'PENDING' }
    }

    return { className: 'pending', label: 'PENDING' }
  }

  return (
    <div className="dashboard-container">
      {/* Dashboard Premium Banner Header */}
      <div className="premium-header-banner">
        <div className="banner-overlay"></div>
        <div className="banner-content">
          <div className="brand-badge">
            <span className="sparkle">✦</span> AURA LUXURY TRAVELS
          </div>
          <h1 className="hero-title">Premium Journeys</h1>
          <p className="hero-subtitle" style={{ marginBottom: '0px' }}>
            <span>Reliable distributed transactions orchestrating flight, hotel, and transport bookings.</span>
            <span className="badge-temporal">Temporal SDK</span>
          </p>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="tab-navigation">
        <button 
          className={`tab-btn ${activeTab === 'application' ? 'active' : ''}`}
          onClick={() => setActiveTab('application')}
        >
          <span>🎫</span> Application
        </button>
        <button 
          className={`tab-btn ${activeTab === 'auditing' ? 'active' : ''}`}
          onClick={() => setActiveTab('auditing')}
        >
          <span>🕵️</span> Auditing
        </button>
      </div>

      {/* Tab Contents */}
      {activeTab === 'application' && (
        <div className="tab-content dashboard-grid">
          {/* Left Column: Form & Controller Panel */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* Simulation Toggle card */}
            <div className="glass-card" style={{ padding: '20px 30px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: 'var(--slate-50)' }}>
                    {isOfflineSimulation ? '🔌 Sandbox Mode Active' : '⚡ Live Temporal API'}
                  </h3>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--slate-400)' }}>
                    {isOfflineSimulation ? 'Simulating workflows locally in frontend.' : 'Connecting to Spring Boot on port 9191.'}
                  </p>
                </div>
                <label className="switch" style={{ position: 'relative', display: 'inline-block', width: '50px', height: '26px' }}>
                  <input 
                    type="checkbox" 
                    checked={isOfflineSimulation} 
                    onChange={(e) => {
                      setIsOfflineSimulation(e.target.checked)
                      addLog(e.target.checked ? '🔌 Sandbox Mode enabled. Offline visual demo.' : '⚡ Connected Mode enabled. Target: http://localhost:9191.', 'warn')
                    }}
                    disabled={isBookingActive && ['FLIGHT_BOOKING_IN_PROGRESS', 'HOTEL_BOOKING_IN_PROGRESS', 'TRANSPORT_ARRANGING_IN_PROGRESS', 'PENDING_USER_CONFIRMATION'].includes(workflowStatus)}
                    style={{ opacity: 0, width: 0, height: 0 }}
                  />
                  <span className="slider" style={{
                    position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: isOfflineSimulation ? 'var(--primary)' : '#1e293b',
                    borderRadius: '34px', transition: '.4s',
                    boxShadow: isOfflineSimulation ? '0 0 10px var(--primary-glow)' : 'none'
                  }}>
                    <span style={{
                      position: 'absolute', content: '""', height: '18px', width: '18px', left: '4px', bottom: '4px',
                      backgroundColor: 'white', borderRadius: '50%', transition: '.4s',
                      transform: isOfflineSimulation ? 'translateX(24px)' : 'translateX(0)'
                    }}></span>
                  </span>
                </label>
              </div>
            </div>

            {/* Form Card */}
            <div className="glass-card">
              <h2 className="card-title">
                <span style={{ fontSize: '1.5rem' }}>🎫</span> Book Premium Journey
              </h2>
              
              <form onSubmit={handleStartBooking}>
                <div className="form-grid">
                  <div className="form-group">
                    <label className="form-label">User ID / Handle</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={userId}
                      onChange={(e) => setUserId(e.target.value.replace(/\s+/g, '_'))}
                      placeholder="e.g. mahesh_dev"
                      disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                      required 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Travelers Count</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={travelersCount}
                      min="1"
                      max="10"
                      onChange={(e) => setTravelersCount(e.target.value)}
                      disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                      required 
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Origin (From)</label>
                    <select 
                      className="form-input" 
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                    >
                      {LOCATIONS.map((loc) => (
                        <option key={`origin-${loc.value}`} value={loc.value}>{loc.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Destination (To)</label>
                    <select 
                      className="form-input" 
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                    >
                      {LOCATIONS.map((loc) => (
                        <option key={`dest-${loc.value}`} value={loc.value}>{loc.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Departure Date</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={departureDate}
                      onChange={(e) => setDepartureDate(e.target.value)}
                      disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Return Date</label>
                    <input 
                      type="date" 
                      className="form-input" 
                      value={returnDate}
                      onChange={(e) => setReturnDate(e.target.value)}
                      disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Flight Class</label>
                    <select 
                      className="form-input" 
                      value={travelClass}
                      onChange={(e) => setTravelClass(e.target.value)}
                      disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                    >
                      <option value="First Class">💎 First Class</option>
                      <option value="Business Class">👔 Business Class</option>
                      <option value="Premium Economy">✈️ Premium Economy</option>
                      <option value="Economy Class">🎫 Economy Class</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Hotel Rating</label>
                    <select 
                      className="form-input" 
                      value={hotelRating}
                      onChange={(e) => setHotelRating(e.target.value)}
                      disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                    >
                      <option value="5-Star Luxury Resort">⭐⭐⭐⭐⭐ Luxury Resort</option>
                      <option value="4-Star Premium Hotel">⭐⭐⭐⭐ Premium Hotel</option>
                      <option value="Boutique Penthouse Suite">🏰 Boutique Penthouse</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Airport Transfer Chauffeur</label>
                    <select 
                      className="form-input" 
                      value={transportVehicle}
                      onChange={(e) => setTransportVehicle(e.target.value)}
                      disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                    >
                      <option value="Tesla Model Y (EV)">⚡ Tesla Model Y (EV)</option>
                      <option value="Mercedes S-Class (Executive)">🚘 Mercedes S-Class (Executive)</option>
                      <option value="Cadillac Escalade (Luxury SUV)">🚙 Cadillac Escalade (Luxury SUV)</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', height: '100%', paddingTop: '16px' }}>
                    <label className="checkbox-container" style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.95rem', color: 'var(--slate-300)', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={includeInsurance}
                        onChange={(e) => setIncludeInsurance(e.target.checked)}
                        disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                        style={{ width: '20px', height: '20px', accentColor: 'var(--primary)' }}
                      />
                      🛡️ Include Premium Travel Insurance
                    </label>
                  </div>
                </div>

                {/* Chaos Simulation Section */}
                <div className="form-group" style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
                  <label className="form-label" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>☣️</span> Chaos Simulation (Force API Failures)
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '12px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: 'var(--slate-300)', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={simulateFlightFailure}
                        onChange={(e) => {
                          setSimulateFlightFailure(e.target.checked)
                          if (e.target.checked) {
                            setSimulateHotelFailure(false)
                            setSimulateTransportFailure(false)
                          }
                        }}
                        disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--danger)' }}
                      />
                      Simulate Flight API Failure
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: 'var(--slate-300)', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={simulateHotelFailure}
                        onChange={(e) => {
                          setSimulateHotelFailure(e.target.checked)
                          if (e.target.checked) {
                            setSimulateFlightFailure(false)
                            setSimulateTransportFailure(false)
                          }
                        }}
                        disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--danger)' }}
                      />
                      Simulate Hotel API Failure
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: 'var(--slate-300)', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={simulateTransportFailure}
                        onChange={(e) => {
                          setSimulateTransportFailure(e.target.checked)
                          if (e.target.checked) {
                            setSimulateFlightFailure(false)
                            setSimulateHotelFailure(false)
                            setSimulatePaymentFailure(false)
                            setSimulateLoyaltyFailure(false)
                          }
                        }}
                        disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--danger)' }}
                      />
                      Simulate Transport API Failure
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: 'var(--slate-300)', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={simulatePaymentFailure}
                        onChange={(e) => {
                          setSimulatePaymentFailure(e.target.checked)
                          if (e.target.checked) {
                            setSimulateFlightFailure(false)
                            setSimulateHotelFailure(false)
                            setSimulateTransportFailure(false)
                            setSimulateLoyaltyFailure(false)
                          }
                        }}
                        disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--danger)' }}
                      />
                      Simulate Payment Failure
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: 'var(--slate-300)', cursor: 'pointer' }}>
                      <input 
                        type="checkbox" 
                        checked={simulateLoyaltyFailure}
                        onChange={(e) => {
                          setSimulateLoyaltyFailure(e.target.checked)
                          if (e.target.checked) {
                            setSimulateFlightFailure(false)
                            setSimulateHotelFailure(false)
                            setSimulateTransportFailure(false)
                            setSimulatePaymentFailure(false)
                          }
                        }}
                        disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--danger)' }}
                      />
                      Simulate Loyalty Failure
                    </label>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                  style={{ marginTop: '20px' }}
                >
                  <span>🚀</span> Launch Premium Booking Workflow
                </button>
              </form>

              {isBookingActive && ['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus) && (
                <button 
                  className="btn-primary" 
                  onClick={() => {
                    setIsBookingActive(false)
                    setWorkflowStatus('PENDING_START')
                    setWorkflowId('')
                    setWorkflowRunId('')
                    setSimulateFlightFailure(false)
                    setSimulateHotelFailure(false)
                    setSimulateTransportFailure(false)
                    addLog('Dashboard reset. Ready for next luxury request.', 'info')
                  }}
                  style={{ marginTop: '16px', background: 'var(--slate-800)', boxShadow: 'none', border: '1px solid var(--slate-700)' }}
                >
                  🔄 Reset Dashboard
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Visual Pipeline Tracker & Real-Time Console */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            
            {/* Visual Tracker Card */}
            <div className="glass-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h2 className="card-title" style={{ margin: 0, borderBottom: 'none', paddingBottom: 0 }}>
                  <span style={{ fontSize: '1.5rem' }}>📊</span> Booking Orchestration Pipeline
                </h2>
                {isBookingActive && (
                  <div style={{
                    fontSize: '0.8rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px',
                    backgroundColor: ['CONFIRMED'].includes(workflowStatus) ? 'rgba(16, 185, 129, 0.15)' : 
                                     ['CANCELLED', 'FAILED'].includes(workflowStatus) ? 'rgba(239, 68, 68, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                    color: ['CONFIRMED'].includes(workflowStatus) ? 'var(--success)' : 
                           ['CANCELLED', 'FAILED'].includes(workflowStatus) ? 'var(--danger)' : 'var(--primary)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    Status: {workflowStatus}
                  </div>
                )}
              </div>

              {isBookingActive && (
                <div className="booking-summary-card">
                  <div className="summary-section">
                    <div className="summary-route">
                      <span className="city">{origin.split(',')[0]}</span>
                      <span className="route-arrow">➔</span>
                      <span className="city">{destination.split(',')[0]}</span>
                    </div>
                    <div className="summary-dates">
                      📅 {departureDate} to {returnDate} | 👥 {travelersCount} Guest{travelersCount > 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="summary-details-grid">
                    <div className="detail-item">
                      <span className="label">FLIGHT CLASS</span>
                      <span className="val">✈️ {travelClass}</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">LODGING</span>
                      <span className="val">🏨 {hotelRating}</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">TRANSFER</span>
                      <span className="val">🚗 {transportVehicle.split(' ')[0]}</span>
                    </div>
                    <div className="detail-item">
                      <span className="label">INSURANCE</span>
                      <span className="val">{includeInsurance ? '🛡️ Included' : '❌ Waived'}</span>
                    </div>
                  </div>
                </div>
              )}

              {isBookingActive && (
                <div className="workflow-meta" style={{
                  display: 'flex', gap: '16px', flexWrap: 'wrap',
                  marginBottom: '20px', padding: '12px 16px', borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--slate-300)',
                  justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                    <div><span style={{ color: 'var(--primary)' }}>Workflow ID:</span> {workflowId || `travel_${userId}`}</div>
                    <div><span style={{ color: 'var(--primary)' }}>Run ID:</span> {workflowRunId || (isOfflineSimulation ? 'sandbox-run-id-uuid-12345' : 'Loading...')}</div>
                  </div>
                  {isBackendOffline && (
                    <div style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--danger)',
                      padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold',
                      animation: 'pulse-danger 1.5s infinite', border: '1px solid rgba(239, 68, 68, 0.3)'
                    }}>
                      🔴 Server Offline
                    </div>
                  )}
                </div>
              )}

              <div className="pipeline-container">
                
                {/* Step 1: Flight */}
                {(() => {
                  const details = getStepDetails('flight');
                  return (
                    <div className={`pipeline-step ${details.className}`}>
                      <div className="step-circle">✈️</div>
                      <div className="step-content">
                        <div className="step-header">
                          <h4 className="step-title">Book Flight</h4>
                          <span className={`step-status ${details.className}`}>{details.label}</span>
                        </div>
                        <p className="step-desc">Reserves airline seat to destination. Comp: `cancelFlight`</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Step 2: Hotel */}
                {(() => {
                  const details = getStepDetails('hotel');
                  return (
                    <div className={`pipeline-step ${details.className}`}>
                      <div className="step-circle">🏨</div>
                      <div className="step-content">
                        <div className="step-header">
                          <h4 className="step-title">Book Hotel</h4>
                          <span className={`step-status ${details.className}`}>{details.label}</span>
                        </div>
                        <p className="step-desc">Books double-room room for target dates. Comp: `cancelHotel`</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Step 3: Local Transport */}
                {(() => {
                  const details = getStepDetails('transport');
                  return (
                    <div className={`pipeline-step ${details.className}`}>
                      <div className="step-circle">🚗</div>
                      <div className="step-content">
                        <div className="step-header">
                          <h4 className="step-title">Arrange Local Transport</h4>
                          <span className={`step-status ${details.className}`}>{details.label}</span>
                        </div>
                        <p className="step-desc">Dispatches executive airport transfer. Comp: `cancelTransport`</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Step 4: User Confirmation Signal */}
                {(() => {
                  const details = getStepDetails('confirm');
                  return (
                    <div className={`pipeline-step ${details.className}`}>
                      <div className="step-circle">⏳</div>
                      <div className="step-content">
                        <div className="step-header">
                          <h4 className="step-title">Trip Acceptance Checkpoint</h4>
                          <span className={`step-status ${details.className}`}>{details.label}</span>
                        </div>
                        <p className="step-desc">Awaits manual trip acceptance. Initiates compensation if timeout occurs.</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Step 5: Child Billing & Payments */}
                {(() => {
                  const details = getStepDetails('payment');
                  return (
                    <div className={`pipeline-step ${details.className}`}>
                      <div className="step-circle">💳</div>
                      <div className="step-content">
                        <div className="step-header">
                          <h4 className="step-title">Child Payment Workflow</h4>
                          <span className={`step-status ${details.className}`}>{details.label}</span>
                        </div>
                        <p className="step-desc">Orchestrates card charge, invoicing, and loyalty points. Comp: `refundPayment`</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Step 6: Finalized */}
                {(() => {
                  const details = getStepDetails('finalize');
                  return (
                    <div className={`pipeline-step ${details.className}`}>
                      <div className="step-circle">🎉</div>
                      <div className="step-content">
                        <div className="step-header">
                          <h4 className="step-title">Finalize Travel Booking</h4>
                          <span className={`step-status ${details.className}`}>{details.label}</span>
                        </div>
                        <p className="step-desc">Commits booking ledger. Completes workflow successfully.</p>
                      </div>
                    </div>
                  );
                })()}

              </div>

              {/* Countdown and Confirmation Area */}
              {isBookingActive && workflowStatus === 'PENDING_USER_CONFIRMATION' && (
                <div className="confirmation-box">
                  <div className="confirmation-header">
                    <div className="confirmation-title">
                      <span>⚠️</span> Acceptance Required
                    </div>
                    <div className="countdown-badge">
                      <span>⏰</span> {countdown}s remaining
                    </div>
                  </div>
                  <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--slate-400)' }}>
                    The booking resources are provisionally reserved. Click the button below to issue a Temporal signal to confirm. If the timer runs out, the transaction will automatically run compensation activities.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <button className="btn-confirm" onClick={handleConfirmBooking} style={{ flex: 1 }}>
                      ✅ Confirm Booking
                    </button>
                    <button className="btn-confirm" onClick={handleCancelBooking} style={{ flex: 1, backgroundColor: 'var(--danger)', backgroundImage: 'none', boxShadow: 'none' }}>
                      ❌ Cancel Booking
                    </button>
                  </div>
                </div>
              )}
              {isBookingActive && !isOfflineSimulation && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus) && (
                <button 
                  className="btn-kill"
                  onClick={handleKillBackend}
                  style={{
                    marginTop: '20px',
                    width: '100%',
                    padding: '12px',
                    borderRadius: '10px',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    cursor: 'pointer',
                    background: 'rgba(239, 68, 68, 0.1)',
                    color: 'var(--danger)',
                    boxShadow: 'none',
                    transition: 'all 0.3s'
                  }}
                >
                  💥 Kill Spring Boot Worker Instance
                </button>
              )}
            </div>

            {/* Console / Terminal Terminal Card */}
            <div className="console-card">
              <div className="console-header">
                <div className="console-title">
                  <span className={`console-dot ${isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus) ? 'pulsing' : ''}`}></span>
                  <span>Temporal Worker Logs Console</span>
                </div>
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: 'var(--slate-700)' }}>PORT: 7233</span>
              </div>
              
              <div className="console-logs">
                {logs.map((log, idx) => (
                  <div key={idx} className="log-entry">
                    <span className="log-time">[{log.time}]</span>
                    <span className={`log-msg ${log.type}`}>{log.msg}</span>
                  </div>
                ))}
                <div ref={consoleEndRef} />
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Tab 2: Auditing with Sub-Tabs */}
      {activeTab === 'auditing' && (
        <div className="tab-content iframe-container">
          
          {/* Sub-tab Navigation */}
          <div className="sub-tab-navigation" style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '12px' }}>
            <button 
              className={`sub-tab-btn ${activeSubTab === 'temporal' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('temporal')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                background: activeSubTab === 'temporal' ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: activeSubTab === 'temporal' ? 'white' : 'var(--slate-400)',
                border: '1px solid ' + (activeSubTab === 'temporal' ? 'rgba(255,255,255,0.1)' : 'transparent'),
                boxShadow: activeSubTab === 'temporal' ? '0 2px 8px rgba(0, 0, 0, 0.2)' : 'none',
                transition: 'all 0.3s'
              }}
            >
              <span>🕵️</span> Temporal UI (Auditing)
            </button>
            <button 
              className={`sub-tab-btn ${activeSubTab === 'h2' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('h2')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                background: activeSubTab === 'h2' ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: activeSubTab === 'h2' ? 'white' : 'var(--slate-400)',
                border: '1px solid ' + (activeSubTab === 'h2' ? 'rgba(255,255,255,0.1)' : 'transparent'),
                boxShadow: activeSubTab === 'h2' ? '0 2px 8px rgba(0, 0, 0, 0.2)' : 'none',
                transition: 'all 0.3s'
              }}
            >
              <span>🗄️</span> H2 Console
            </button>
            <button 
              className={`sub-tab-btn ${activeSubTab === 'swagger' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('swagger')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                background: activeSubTab === 'swagger' ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: activeSubTab === 'swagger' ? 'white' : 'var(--slate-400)',
                border: '1px solid ' + (activeSubTab === 'swagger' ? 'rgba(255,255,255,0.1)' : 'transparent'),
                boxShadow: activeSubTab === 'swagger' ? '0 2px 8px rgba(0, 0, 0, 0.2)' : 'none',
                transition: 'all 0.3s'
              }}
            >
              <span>📖</span> Swagger UI
            </button>
            <button 
              className={`sub-tab-btn ${activeSubTab === 'github' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('github')}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '8px',
                fontFamily: 'var(--font-sans)', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
                background: activeSubTab === 'github' ? 'rgba(255,255,255,0.06)' : 'transparent',
                color: activeSubTab === 'github' ? 'white' : 'var(--slate-400)',
                border: '1px solid ' + (activeSubTab === 'github' ? 'rgba(255,255,255,0.1)' : 'transparent'),
                boxShadow: activeSubTab === 'github' ? '0 2px 8px rgba(0, 0, 0, 0.2)' : 'none',
                transition: 'all 0.3s'
              }}
            >
              <span>🐙</span> GitHub Code
            </button>
          </div>

          {/* Sub-tab 1: Temporal Web UI */}
          {activeSubTab === 'temporal' && (
            <div className="sub-tab-content" style={{ animation: 'fadeIn 0.4s' }}>
              <div className="iframe-header">
                <div>
                  <h2 className="iframe-title" style={{ fontSize: '1.2rem' }}>🕵️ Temporal UI Auditing</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--slate-400)' }}>
                    Track and inspect workflow executions, history logs, and activity payloads in real-time.
                  </p>
                </div>
                <a href="http://localhost:8088/namespaces/default/workflows" target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ width: 'auto', padding: '10px 16px', fontSize: '0.85rem' }}>
                  <span>↗️</span> Open in New Tab
                </a>
              </div>
              <iframe 
                src="http://localhost:8088/namespaces/default/workflows" 
                title="Temporal Web UI"
                className="embedded-iframe"
              />
            </div>
          )}

          {/* Sub-tab: H2 Database Console */}
          {activeSubTab === 'h2' && (
            <div className="sub-tab-content" style={{ animation: 'fadeIn 0.4s' }}>
              <div className="iframe-header">
                <div>
                  <h2 className="iframe-title" style={{ fontSize: '1.2rem' }}>🗄️ H2 Database Console</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--slate-400)' }}>
                    Inspect relational tables and state persistence. Fields are auto-populated. Just click <b>Connect</b> (Password is blank).
                  </p>
                </div>
                <a href="http://localhost:9191/h2-console?driver=org.h2.Driver&url=jdbc:h2:mem:traveldb&user=sa" target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ width: 'auto', padding: '10px 16px', fontSize: '0.85rem' }}>
                  <span>↗️</span> Open in New Tab
                </a>
              </div>
              <iframe 
                src="http://localhost:9191/h2-console?driver=org.h2.Driver&url=jdbc:h2:mem:traveldb&user=sa" 
                title="H2 Console UI"
                className="embedded-iframe"
              />
            </div>
          )}

          {/* Sub-tab 2: Swagger UI */}
          {activeSubTab === 'swagger' && (
            <div className="sub-tab-content" style={{ animation: 'fadeIn 0.4s' }}>
              <div className="iframe-header">
                <div>
                  <h2 className="iframe-title" style={{ fontSize: '1.2rem' }}>📖 API Swagger UI</h2>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--slate-400)' }}>
                    Explore, inspect, and trigger Spring Boot REST endpoints directly using the OpenAPI specification.
                  </p>
                </div>
                <a href="http://localhost:9191/swagger-ui/index.html" target="_blank" rel="noopener noreferrer" className="btn-primary" style={{ width: 'auto', padding: '10px 16px', fontSize: '0.85rem' }}>
                  <span>↗️</span> Open in New Tab
                </a>
              </div>
              <iframe 
                src="http://localhost:9191/swagger-ui/index.html" 
                title="Swagger API UI"
                className="embedded-iframe"
              />
            </div>
          )}

          {/* Sub-tab 3: GitHub Code Info */}
          {activeSubTab === 'github' && (
            <div className="sub-tab-content" style={{ padding: '60px 20px', textAlign: 'center', animation: 'fadeIn 0.4s' }}>
              <div style={{ maxWidth: '600px', margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                <span style={{ fontSize: '4.5rem' }}>🐙</span>
                <h2 className="iframe-title" style={{ fontSize: '1.5rem', borderBottom: 'none', paddingBottom: 0 }}>GitHub Code Repository</h2>
                <p style={{ fontSize: '0.95rem', color: 'var(--slate-400)', lineHeight: '1.6', margin: 0 }}>
                  Access the complete monorepo containing both the Spring Boot backend (`travel_temporal`) and the React UI (`travel-approval-ui`) source code.
                </p>
                <a 
                  href="https://github.com/maheswardreamjob/travel-temporal" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="btn-primary" 
                  style={{ width: 'auto', padding: '14px 28px', fontSize: '1rem', marginTop: '10px' }}
                >
                  <span>↗️</span> Open GitHub Repository
                </a>
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

export default App
