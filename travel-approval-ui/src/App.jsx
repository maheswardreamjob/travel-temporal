import { useState, useEffect, useRef } from 'react'
import './App.css'

// API Base URL - Configured to point to the Spring Boot REST API
const API_BASE = 'http://localhost:9191/travel'

function App() {
  // Booking Form State
  const [userId, setUserId] = useState('mahesh_dev')
  const [destination, setDestination] = useState('Tokyo, Japan')
  const [travelDate, setTravelDate] = useState('2026-06-15')
  const [simulateFlightFailure, setSimulateFlightFailure] = useState(false)
  const [simulateHotelFailure, setSimulateHotelFailure] = useState(false)
  const [simulateTransportFailure, setSimulateTransportFailure] = useState(false)

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
        break
      case 'COMPENSATING_TRANSPORT':
        addLog('🔄 [ACTIVITY] Saga Compensation: Rollback of local transport reservation in progress...', 'warn')
        break
      case 'COMPENSATING_HOTEL':
        addLog('🔄 [ACTIVITY] Saga Compensation: Rollback of hotel reservation in progress...', 'warn')
        break
      case 'COMPENSATING_FLIGHT':
        addLog('🔄 [ACTIVITY] Saga Compensation: Rollback of flight reservation in progress...', 'warn')
        break
      case 'CANCELLED':
        addLog('❌ [ACTIVITY] Rollback compensation completed. System returned to clean state.', 'danger')
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
    setWorkflowId('')
    setWorkflowRunId('')
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
          body: JSON.stringify({
            userId,
            destination,
            travelDate,
            simulateFlightFailure,
            simulateHotelFailure,
            simulateTransportFailure
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
      if (workflowStatus === 'FLIGHT_BOOKING_IN_PROGRESS') {
        return { className: 'active', label: 'BOOKING...' }
      }
      if (workflowStatus === 'COMPENSATING_FLIGHT') {
        return { className: 'compensating', label: 'COMPENSATING...' }
      }
      if (['HOTEL_BOOKING_IN_PROGRESS', 'TRANSPORT_ARRANGING_IN_PROGRESS', 'PENDING_USER_CONFIRMATION', 'CONFIRMED', 'COMPENSATING_TRANSPORT', 'COMPENSATING_HOTEL'].includes(workflowStatus)) {
        return { className: 'completed', label: 'COMPLETED' }
      }
      if (workflowStatus === 'CANCELLED') {
        return simulateFlightFailure ? { className: 'failed', label: 'FAILED' } : { className: 'compensated-done', label: 'COMPENSATED' }
      }
      return { className: 'pending', label: 'PENDING' }
    }

    if (stepName === 'hotel') {
      if (workflowStatus === 'HOTEL_BOOKING_IN_PROGRESS') {
        return { className: 'active', label: 'BOOKING...' }
      }
      if (workflowStatus === 'COMPENSATING_HOTEL') {
        return { className: 'compensating', label: 'COMPENSATING...' }
      }
      if (['TRANSPORT_ARRANGING_IN_PROGRESS', 'PENDING_USER_CONFIRMATION', 'CONFIRMED', 'COMPENSATING_TRANSPORT'].includes(workflowStatus)) {
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
      if (workflowStatus === 'TRANSPORT_ARRANGING_IN_PROGRESS') {
        return { className: 'active', label: 'ARRANGING...' }
      }
      if (workflowStatus === 'COMPENSATING_TRANSPORT') {
        return { className: 'compensating', label: 'COMPENSATING...' }
      }
      if (['PENDING_USER_CONFIRMATION', 'CONFIRMED'].includes(workflowStatus)) {
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
        return { className: 'active', label: 'AWAITING APPROVAL' }
      }
      if (workflowStatus === 'CONFIRMED') {
        return { className: 'completed', label: 'APPROVED' }
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
      {/* Dashboard Header */}
      <header style={{ marginBottom: '40px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <h1 className="hero-title">Travel Booking</h1>
            <div className="hero-subtitle" style={{ marginBottom: '0px' }}>
              <span>Reliable distributed transactions orchestrating flight, hotel, and transport bookings.</span>
              <span className="badge-temporal">Temporal SDK</span>
            </div>
          </div>
        </div>
      </header>

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

                {/* Chaos Simulation Section */}
                <div className="form-group" style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
                  <label className="form-label" style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>☣️</span> Chaos Simulation (Force API Failures)
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
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
                          }
                        }}
                        disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--danger)' }}
                      />
                      Simulate Transport API Failure
                    </label>
                  </div>
                </div>

                <button 
                  type="submit" 
                  className="btn-primary"
                  disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                  style={{ marginTop: '20px' }}
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
                    setWorkflowId('')
                    setWorkflowRunId('')
                    setSimulateFlightFailure(false)
                    setSimulateHotelFailure(false)
                    setSimulateTransportFailure(false)
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
                          <h4 className="step-title">User Approval Checkpoint</h4>
                          <span className={`step-status ${details.className}`}>{details.label}</span>
                        </div>
                        <p className="step-desc">Awaits manual confirmation. Initiates compensation if timeout occurs.</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Step 5: Finalized */}
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
