import { useState, useEffect, useRef } from 'react'
import './App.css'

// API Base URL - Configured to point to the Spring Boot REST API
const API_BASE = 'http://localhost:9191/travel'

function App() {
  // Booking Form State
  const [userId, setUserId] = useState('mahesh_dev')
  const [destination, setDestination] = useState('Tokyo, Japan')
  const [travelDate, setTravelDate] = useState('2026-06-15')

  // UI / Workflow States
  const [isBookingActive, setIsBookingActive] = useState(false)
  const [workflowStatus, setWorkflowStatus] = useState('PENDING_START')
  const [isOfflineSimulation, setIsOfflineSimulation] = useState(false)
  
  // Countdown Timer State
  const [countdown, setCountdown] = useState(60) // 1 minute
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
      // Start a 60s timer
      setCountdown(isOfflineSimulation ? 15 : 60) // Fast 15s timer for offline simulation demo
      
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
        
        if (status !== lastStatus) {
          handleStatusTransition(status)
          lastStatus = status
        }
      } catch (err) {
        // Workflow might not be registered yet, or server offline
        console.error('Polling error:', err)
      }
    }, 1500)
  }

  // Manage logs and terminal updates during status transitions
  const handleStatusTransition = (status) => {
    setWorkflowStatus(status)
    
    switch(status) {
      case 'FLIGHT_BOOKING_IN_PROGRESS':
        addLog('✈️ [ACTIVITY] Initiating flight booking activity...', 'info')
        break
      case 'HOTEL_BOOKING_IN_PROGRESS':
        addLog('🎉 [ACTIVITY] Flight booking successful! Registering compensation.', 'success')
        addLog('🏨 [ACTIVITY] Initiating hotel reservation activity...', 'info')
        break
      case 'TRANSPORT_ARRANGING_IN_PROGRESS':
        addLog('🎉 [ACTIVITY] Hotel booking successful! Registering compensation.', 'success')
        addLog('🚗 [ACTIVITY] Initiating local transport dispatch activity...', 'info')
        break
      case 'PENDING_USER_CONFIRMATION':
        addLog('🎉 [ACTIVITY] Transport dispatch successful! Registering compensation.', 'success')
        addLog('⏳ [WORKFLOW] Transaction reached checkpoint. Awaiting user signal...', 'warn')
        break
      case 'CONFIRMED':
        addLog('📩 [WORKFLOW] Received user confirmation signal. Finalizing transaction...', 'success')
        addLog('🎉 [ACTIVITY] Booking finalized and confirmed! Transaction finished successfully.', 'success')
        stopPolling()
        break
      case 'COMPENSATING':
        addLog('❌ [TRANSACTION] Initiating rollback/compensation due to timeout or failure!', 'danger')
        addLog('🔄 [ACTIVITY] Executing compensation: Cancelling Transport, Hotel, & Flight...', 'warn')
        break
      case 'CANCELLED':
        addLog('❌ [ACTIVITY] Compensation completed. System returned to clean state.', 'danger')
        addLog('⏹️ [WORKFLOW] Transaction terminated: CANCELLED (Compensated & Rolled Back)', 'danger')
        stopPolling()
        break
      case 'FAILED':
        addLog('❌ [WORKFLOW] Workflow execution encountered a critical error!', 'danger')
        stopPolling()
        break
      case 'NOT_FOUND':
        addLog('🔍 [CLIENT] Workflow completed or not found. Polling idle.', 'info')
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
    setLogs([{ time: new Date().toLocaleTimeString(), msg: `🚀 Launching Travel Booking Workflow for User: ${userId}`, type: 'info' }])

    if (isOfflineSimulation) {
      // Run visual simulation locally
      runOfflineSimulation()
    } else {
      try {
        addLog(`[CLIENT] Sending POST /travel/book with user: ${userId}...`, 'info')
        const response = await fetch(`${API_BASE}/book`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, destination, travelDate })
        })

        if (!response.ok) {
          throw new Error(`Server returned code: ${response.status}`)
        }

        const msg = await response.text()
        addLog(`[SERVER] ${msg}`, 'success')
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

  // Offline Simulator Engine (Fallback)
  const runOfflineSimulation = () => {
    let step = 0
    const steps = [
      { status: 'FLIGHT_BOOKING_IN_PROGRESS', delay: 1500 },
      { status: 'HOTEL_BOOKING_IN_PROGRESS', delay: 3000 },
      { status: 'TRANSPORT_ARRANGING_IN_PROGRESS', delay: 4500 },
      { status: 'PENDING_USER_CONFIRMATION', delay: 6000 }
    ]

    steps.forEach((s) => {
      setTimeout(() => {
        // Ensure another booking hasn't been started or cancelled in between
        if (isBookingActive) {
          handleStatusTransition(s.status)
        }
      }, s.delay)
    })
  }

  const triggerOfflineCompensation = () => {
    handleStatusTransition('COMPENSATING')
    setTimeout(() => {
      handleStatusTransition('CANCELLED')
    }, 2000)
  }

  // Saga Step Status Resolvers for UI styling classes
  const getStepClass = (stepName) => {
    // Determine mapping based on current workflow status
    const statusMap = {
      flight: {
        active: ['FLIGHT_BOOKING_IN_PROGRESS'],
        completed: ['HOTEL_BOOKING_IN_PROGRESS', 'TRANSPORT_ARRANGING_IN_PROGRESS', 'PENDING_USER_CONFIRMATION', 'CONFIRMED'],
        compensating: ['COMPENSATING'],
        compensated: ['CANCELLED']
      },
      hotel: {
        active: ['HOTEL_BOOKING_IN_PROGRESS'],
        completed: ['TRANSPORT_ARRANGING_IN_PROGRESS', 'PENDING_USER_CONFIRMATION', 'CONFIRMED'],
        compensating: ['COMPENSATING'],
        compensated: ['CANCELLED']
      },
      transport: {
        active: ['TRANSPORT_ARRANGING_IN_PROGRESS'],
        completed: ['PENDING_USER_CONFIRMATION', 'CONFIRMED'],
        compensating: ['COMPENSATING'],
        compensated: ['CANCELLED']
      },
      confirm: {
        active: ['PENDING_USER_CONFIRMATION'],
        completed: ['CONFIRMED'],
        compensated: ['CANCELLED']
      },
      finalize: {
        active: [],
        completed: ['CONFIRMED'],
        compensated: ['CANCELLED']
      }
    }

    const currentMap = statusMap[stepName]
    if (!isBookingActive || workflowStatus === 'PENDING_START') return 'pending'
    if (currentMap.active.includes(workflowStatus)) return 'active'
    if (currentMap.completed.includes(workflowStatus)) return 'completed'
    if (workflowStatus === 'COMPENSATING' && currentMap.compensating?.includes('COMPENSATING')) return 'compensating'
    if (workflowStatus === 'CANCELLED' && currentMap.compensated?.includes('CANCELLED')) return 'compensated-done'
    return 'pending'
  }

  return (
    <div className="dashboard-container">
      {/* Dashboard Header */}
      <header style={{ marginBottom: '40px' }}>
        <h1 className="hero-title">Travel Booking</h1>
        <div className="hero-subtitle">
          <span>Reliable distributed transactions orchestrating flight, hotel, and transport bookings.</span>
          <span className="badge-temporal">Temporal SDK</span>
        </div>
      </header>

      {/* Main Grid */}
      <div className="dashboard-grid">
        
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
              <span style={{ fontSize: '1.5rem' }}>🎫</span> New Booking Request
            </h2>
            
            <form onSubmit={handleStartBooking}>
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
                <label className="form-label">Destination</label>
                <select 
                  className="form-input" 
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                >
                  <option value="Tokyo, Japan">Tokyo, Japan (HND)</option>
                  <option value="Paris, France">Paris, France (CDG)</option>
                  <option value="London, United Kingdom">London, UK (LHR)</option>
                  <option value="Bali, Indonesia">Bali, Indonesia (DPS)</option>
                  <option value="New York, USA">New York, USA (JFK)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Travel Date</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={travelDate}
                  onChange={(e) => setTravelDate(e.target.value)}
                  disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                  required
                />
              </div>

              <button 
                type="submit" 
                className="btn-primary"
                disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
              >
                <span>🚀</span> Start Booking Process
              </button>
            </form>

            {isBookingActive && ['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus) && (
              <button 
                className="btn-primary" 
                onClick={() => {
                  setIsBookingActive(false)
                  setWorkflowStatus('PENDING_START')
                  addLog('Dashboard reset. Ready for next request.', 'info')
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

            <div className="pipeline-container">
              
              {/* Step 1: Flight */}
              <div className={`pipeline-step ${getStepClass('flight')} ${['HOTEL_BOOKING_IN_PROGRESS', 'TRANSPORT_ARRANGING_IN_PROGRESS', 'PENDING_USER_CONFIRMATION', 'CONFIRMED'].includes(workflowStatus) ? 'completed' : ''} ${workflowStatus === 'COMPENSATING' || workflowStatus === 'CANCELLED' ? 'compensated' : ''}`}>
                <div className="step-circle">✈️</div>
                <div className="step-content">
                  <div className="step-header">
                    <h4 className="step-title">Book Flight</h4>
                    <span className={`step-status ${getStepClass('flight')}`}>{getStepClass('flight')}</span>
                  </div>
                  <p className="step-desc">Reserves airline seat to destination. Comp: `cancelFlight`</p>
                </div>
              </div>

              {/* Step 2: Hotel */}
              <div className={`pipeline-step ${getStepClass('hotel')} ${['TRANSPORT_ARRANGING_IN_PROGRESS', 'PENDING_USER_CONFIRMATION', 'CONFIRMED'].includes(workflowStatus) ? 'completed' : ''} ${workflowStatus === 'COMPENSATING' || workflowStatus === 'CANCELLED' ? 'compensated' : ''}`}>
                <div className="step-circle">🏨</div>
                <div className="step-content">
                  <div className="step-header">
                    <h4 className="step-title">Book Hotel</h4>
                    <span className={`step-status ${getStepClass('hotel')}`}>{getStepClass('hotel')}</span>
                  </div>
                  <p className="step-desc">Books double-room room for target dates. Comp: `cancelHotel`</p>
                </div>
              </div>

              {/* Step 3: Local Transport */}
              <div className={`pipeline-step ${getStepClass('transport')} ${['PENDING_USER_CONFIRMATION', 'CONFIRMED'].includes(workflowStatus) ? 'completed' : ''} ${workflowStatus === 'COMPENSATING' || workflowStatus === 'CANCELLED' ? 'compensated' : ''}`}>
                <div className="step-circle">🚗</div>
                <div className="step-content">
                  <div className="step-header">
                    <h4 className="step-title">Arrange Local Transport</h4>
                    <span className={`step-status ${getStepClass('transport')}`}>{getStepClass('transport')}</span>
                  </div>
                  <p className="step-desc">Dispatches executive airport transfer. Comp: `cancelTransport`</p>
                </div>
              </div>

              {/* Step 4: User Confirmation Signal */}
              <div className={`pipeline-step ${getStepClass('confirm')}`}>
                <div className="step-circle">⏳</div>
                <div className="step-content">
                  <div className="step-header">
                    <h4 className="step-title">User Approval Checkpoint</h4>
                    <span className={`step-status ${getStepClass('confirm')}`}>{getStepClass('confirm')}</span>
                  </div>
                  <p className="step-desc">Awaits manual confirmation. Initiates compensation if timeout occurs.</p>
                </div>
              </div>

              {/* Step 5: Finalized */}
              <div className={`pipeline-step ${getStepClass('finalize')}`}>
                <div className="step-circle">🎉</div>
                <div className="step-content">
                  <div className="step-header">
                    <h4 className="step-title">Finalize Travel Booking</h4>
                    <span className={`step-status ${getStepClass('finalize')}`}>{getStepClass('finalize')}</span>
                  </div>
                  <p className="step-desc">Commits booking ledger. Completes workflow successfully.</p>
                </div>
              </div>

            </div>

            {/* Countdown and Confirmation Area */}
            {isBookingActive && workflowStatus === 'PENDING_USER_CONFIRMATION' && (
              <div className="confirmation-box">
                <div className="confirmation-header">
                  <div className="confirmation-title">
                    <span>⚠️</span> Approval Required
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
    </div>
  )
}

export default App
