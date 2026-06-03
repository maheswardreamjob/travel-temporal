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
  const [tripType, setTripType] = useState('Couple / Honeymoon Getaway')
  const [includeInsurance, setIncludeInsurance] = useState(true)
  const [simulateFlightFailure, setSimulateFlightFailure] = useState(false)
  const [simulateHotelFailure, setSimulateHotelFailure] = useState(false)
  const [simulateTransportFailure, setSimulateTransportFailure] = useState(false)
  const [simulatePaymentFailure, setSimulatePaymentFailure] = useState(false)
  const [simulateLoyaltyFailure, setSimulateLoyaltyFailure] = useState(false)

  // AI Assisted State
  const [bookingMode, setBookingMode] = useState('ai') // 'ai' or 'manual'
  const [aiPrompt, setAiPrompt] = useState('I want to book a couple trip from Paris to Tokyo in Business Class. We want a 5-Star Luxury Resort and a Tesla transfer from 2026-07-10 to 2026-07-20.')
  const [geminiKey, setGeminiKey] = useState(localStorage.getItem('gemini_api_key') || '')
  const [isAiParsing, setIsAiParsing] = useState(false)
  const [chatMessages, setChatMessages] = useState([
    {
      id: 'welcome',
      sender: 'assistant',
      text: "Hello! I am your AI Travel Assistant. Tell me about your destination, travel class, hotel preference, and dates, and I'll draft the booking details for you. Try clicking one of the presets below to see an example!"
    }
  ])
  const [typedMessage, setTypedMessage] = useState('')
  const [aiAdvisory, setAiAdvisory] = useState('')
  const chatMessagesEndRef = useRef(null)

  // Scroll chat window to bottom
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isAiParsing])


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
  const [configuredTimeout, setConfiguredTimeout] = useState(120) // Default 120 seconds
  const [countdown, setCountdown] = useState(120)
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
      // Start configured timer
      setCountdown(isOfflineSimulation ? 15 : configuredTimeout)
      
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current)
            if (isOfflineSimulation) {
              // Trigger compensation locally
              triggerOfflineCompensation()
            } else {
              // Automatically cancel booking when timer expires
              addLog(`[CLIENT] Timer expired. Automatically triggering cancellation signal for user: ${userId}`, 'warn')
              handleCancelBooking()
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
  }, [workflowStatus, configuredTimeout, isOfflineSimulation, userId])

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

  const getLocalMockAdvisory = (destVal) => {
    const dest = destVal.toLowerCase()
    if (dest.includes("tokyo") || dest.includes("japan")) {
      return "🌸 Aura AI Advisor: Mild and pleasant weather is expected in Tokyo. Travel advisory: No visa required for short tourism visits. Safe travels!"
    } else if (dest.includes("bali") || dest.includes("indonesia")) {
      return "🌴 Aura AI Advisor: Rainy showers are common in Bali during this season. Note: Visa-on-Arrival (30 days) is required for entry. Travel insurance highly recommended."
    } else if (dest.includes("london") || dest.includes("united kingdom") || dest.includes("uk")) {
      return "☔ Aura AI Advisor: Occasional rain showers predicted in London. Please ensure your passport is valid for at least 6 months. Standard health guidelines apply."
    }
    return "✈️ Aura AI Advisor: Checked destination guidelines. Weather looks pleasant. Safe travels!"
  }

  const fetchAdvisory = async (uid) => {
    try {
      const response = await fetch(`${API_BASE}/advisory/${uid}`)
      if (response.ok) {
        const data = await response.json()
        if (data.advisory) {
          setAiAdvisory(data.advisory)
          addLog(`🤖 [AI ADVISOR] ${data.advisory}`, 'warn')
        }
      }
    } catch (err) {
      console.error('Failed to fetch advisory:', err)
    }
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
        if (!isOfflineSimulation) {
          fetchAdvisory(userId)
        } else {
          const mockAdv = getLocalMockAdvisory(destination)
          setAiAdvisory(mockAdv)
          addLog(`🤖 [AI ADVISOR] ${mockAdv}`, 'warn')
        }
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

  const handleGeminiKeyChange = (key) => {
    setGeminiKey(key)
    localStorage.setItem('gemini_api_key', key)
  }

  // Action: Parse natural language prompt using Gemini
  const handleAiParse = async (e) => {
    e.preventDefault()
    if (!aiPrompt.trim()) return

    setIsAiParsing(true)
    addLog(`🤖 [AI] Dispatching prompt to Gemini API for parsing...`, 'info')

    try {
      const response = await fetch(`${API_BASE}/ai/parse`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Gemini-Key': geminiKey
        },
        body: JSON.stringify({
          prompt: aiPrompt,
          userId: userId || 'ai_passenger'
        })
      })

      if (!response.ok) {
        throw new Error(`Server returned code: ${response.status}`)
      }

      const data = await response.json()
      
      // Update manual form values with parsed parameters
      if (data.userId) setUserId(data.userId)
      if (data.origin) setOrigin(data.origin)
      if (data.destination) setDestination(data.destination)
      if (data.departureDate) setDepartureDate(data.departureDate)
      if (data.returnDate) setReturnDate(data.returnDate)
      if (data.travelClass) setTravelClass(data.travelClass)
      if (data.hotelRating) setHotelRating(data.hotelRating)
      if (data.transportVehicle) setTransportVehicle(data.transportVehicle)
      if (data.travelersCount) setTravelersCount(data.travelersCount)
      if (data.tripType) setTripType(data.tripType)
      if (data.includeInsurance !== undefined) setIncludeInsurance(data.includeInsurance)

      addLog(`✨ [AI] Prompt parsed successfully! Destination: ${data.destination}, Travelers: ${data.travelersCount}, Class: ${data.travelClass}`, 'success')
      addLog(`🔄 [AI] Booking parameters pre-populated. Verify details in Manual Form and launch the Temporal saga.`, 'success')
      
      setBookingMode('manual') // Automatically switch to manual mode so user can review the populated form!

    } catch (err) {
      addLog(`❌ [AI] Parsing failed: ${err.message}`, 'danger')
      addLog(`💡 [AI TIP] Check your Gemini API Key or try one of the presets.`, 'warn')
    } finally {
      setIsAiParsing(false)
    }
  }

  // Action: Send a message to the AI Chat assistant
  const handleSendMessage = async (textToSend) => {
    const text = textToSend || typedMessage
    if (!text.trim()) return

    if (!textToSend) setTypedMessage('')

    const userMsgId = 'msg-' + Date.now()
    setChatMessages((prev) => [
      ...prev,
      { id: userMsgId, sender: 'user', text: text }
    ])

    setIsAiParsing(true)
    addLog(`🤖 [AI Chat] Parsing message: "${text.substring(0, 40)}..."`, 'info')

    try {
      const response = await fetch(`${API_BASE}/ai/parse`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Gemini-Key': geminiKey
        },
        body: JSON.stringify({
          prompt: text,
          userId: userId || 'ai_passenger'
        })
      })

      if (!response.ok) {
        throw new Error(`Server returned code: ${response.status}`)
      }

      const data = await response.json()
      
      // Update form values
      if (data.userId) setUserId(data.userId)
      if (data.origin) setOrigin(data.origin)
      if (data.destination) setDestination(data.destination)
      if (data.departureDate) setDepartureDate(data.departureDate)
      if (data.returnDate) setReturnDate(data.returnDate)
      if (data.travelClass) setTravelClass(data.travelClass)
      if (data.hotelRating) setHotelRating(data.hotelRating)
      if (data.transportVehicle) setTransportVehicle(data.transportVehicle)
      if (data.travelersCount) setTravelersCount(data.travelersCount)
      if (data.tripType) setTripType(data.tripType)
      if (data.includeInsurance !== undefined) setIncludeInsurance(data.includeInsurance)

      addLog(`✨ [AI Chat] Successfully parsed! Destination: ${data.destination}, Travelers: ${data.travelersCount}, Class: ${data.travelClass}`, 'success')

      const replyText = `I've prepared your luxury trip details to **${data.destination}**! Here is a summary of your itinerary draft. You can launch this Temporal booking workflow directly using the action buttons below:`

      setChatMessages((prev) => [
        ...prev,
        {
          id: 'reply-' + Date.now(),
          sender: 'assistant',
          text: replyText,
          tripData: data
        }
      ])
    } catch (err) {
      addLog(`❌ [AI Chat] Parsing failed: ${err.message}`, 'danger')
      setChatMessages((prev) => [
        ...prev,
        {
          id: 'error-' + Date.now(),
          sender: 'assistant',
          text: `I encountered an error trying to process that: "${err.message}". Please check your connection or try another request.`
        }
      ])
    } finally {
      setIsAiParsing(false)
    }
  }




  // Action: Launch the workflow
  const handleStartBooking = async (e) => {
    e.preventDefault()
    if (!userId.trim()) return

    setIsBookingActive(true)
    setWorkflowStatus('PENDING_START')
    setWorkflowId('')
    setWorkflowRunId('')
    setAiAdvisory('')
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
            tripType,
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

    if (stepName === 'booking-reservations') {
      if (['INITIALIZING_TRIP', 'RESERVING_PARALLEL'].includes(workflowStatus)) {
        return { className: 'active', label: 'RESERVING...' }
      }
      if (['COMPENSATING', 'COMPENSATING_FLIGHT', 'COMPENSATING_HOTEL', 'COMPENSATING_TRANSPORT'].includes(workflowStatus)) {
        return { className: 'compensating', label: 'COMPENSATING...' }
      }
      if (['PENDING_USER_CONFIRMATION', 'PAYMENT_IN_PROGRESS', 'BILLING_CHARGED', 'BILLING_INVOICED', 'BILLING_COMPLETED', 'CONFIRMED'].includes(workflowStatus)) {
        return { className: 'completed', label: 'RESERVED' }
      }
      if (workflowStatus === 'CANCELLED') {
        return { className: 'compensated-done', label: 'CANCELLED & COMPENSATED' }
      }
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
        return { className: 'active', label: 'AWAITING CONFIRMATION' }
      }
      if (['PAYMENT_IN_PROGRESS', 'BILLING_CHARGED', 'BILLING_INVOICED', 'BILLING_COMPLETED', 'CONFIRMED'].includes(workflowStatus)) {
        return { className: 'completed', label: 'CONFIRMED' }
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

    if (stepName === 'payment-workflow') {
      if (['PAYMENT_IN_PROGRESS', 'BILLING_CHARGED', 'BILLING_INVOICED'].includes(workflowStatus)) {
        return { className: 'active', label: 'PROCESSING...' }
      }
      if (['BILLING_COMPLETED', 'CONFIRMED'].includes(workflowStatus)) {
        return { className: 'completed', label: 'COMPLETED' }
      }
      if (workflowStatus === 'CANCELLED') {
        if (simulatePaymentFailure || simulateLoyaltyFailure) {
          return { className: 'failed', label: 'FAILED & REVERTED' }
        }
        return { className: 'pending', label: 'SKIPPED' }
      }
      if (workflowStatus === 'COMPENSATING') {
        return { className: 'compensating', label: 'REVERTING...' }
      }
      return { className: 'pending', label: 'PENDING' }
    }

    if (stepName === 'payment-charge') {
      if (workflowStatus === 'PAYMENT_IN_PROGRESS') {
        return { className: 'active', label: 'CHARGING...' }
      }
      if (['BILLING_CHARGED', 'BILLING_INVOICED', 'BILLING_COMPLETED', 'CONFIRMED'].includes(workflowStatus)) {
        return { className: 'completed', label: 'CHARGED' }
      }
      if (workflowStatus === 'CANCELLED') {
        if (simulatePaymentFailure) return { className: 'failed', label: 'DECLINED' }
        if (simulateLoyaltyFailure) return { className: 'compensated-done', label: 'REFUNDED' }
        return { className: 'pending', label: 'SKIPPED' }
      }
      return { className: 'pending', label: 'PENDING' }
    }

    if (stepName === 'payment-invoice') {
      if (workflowStatus === 'BILLING_CHARGED') {
        return { className: 'active', label: 'ISSUING...' }
      }
      if (['BILLING_INVOICED', 'BILLING_COMPLETED', 'CONFIRMED'].includes(workflowStatus)) {
        return { className: 'completed', label: 'ISSUED' }
      }
      if (workflowStatus === 'CANCELLED') {
        return { className: 'pending', label: 'SKIPPED' }
      }
      return { className: 'pending', label: 'PENDING' }
    }

    if (stepName === 'payment-loyalty') {
      if (workflowStatus === 'BILLING_INVOICED') {
        return { className: 'active', label: 'CREDITING...' }
      }
      if (['BILLING_COMPLETED', 'CONFIRMED'].includes(workflowStatus)) {
        return { className: 'completed', label: 'CREDITED' }
      }
      if (workflowStatus === 'CANCELLED') {
        if (simulateLoyaltyFailure) return { className: 'failed', label: 'FAILED' }
        return { className: 'pending', label: 'SKIPPED' }
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
          className={`tab-btn ${activeTab === 'admin' ? 'active' : ''}`}
          onClick={() => setActiveTab('admin')}
        >
          <span>⚙️</span> Admin
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
              <h2 className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>🎫 Book Premium Journey</span>
                <div className="ai-mode-selector" style={{ display: 'flex', gap: '6px' }}>
                  <button 
                    type="button" 
                    className={`mode-btn ${bookingMode === 'ai' ? 'active' : ''}`}
                    onClick={() => setBookingMode('ai')}
                    style={{
                      padding: '5px 12px', fontSize: '0.8rem', borderRadius: '6px',
                      background: bookingMode === 'ai' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                      color: 'white', border: 'none', cursor: 'pointer', transition: 'all 0.3s',
                      fontWeight: 600
                    }}
                  >
                    ✨ AI Assistant
                  </button>
                  <button 
                    type="button" 
                    className={`mode-btn ${bookingMode === 'manual' ? 'active' : ''}`}
                    onClick={() => setBookingMode('manual')}
                    style={{
                      padding: '5px 12px', fontSize: '0.8rem', borderRadius: '6px',
                      background: bookingMode === 'manual' ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                      color: 'white', border: 'none', cursor: 'pointer', transition: 'all 0.3s',
                      fontWeight: 600
                    }}
                  >
                    ✍️ Manual Form
                  </button>
                </div>
              </h2>
              
              {bookingMode === 'ai' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* Chat widget container */}
                  <div className="chat-container">
                    <div className="chat-messages">
                      {chatMessages.map((msg) => (
                        <div key={msg.id} className={`chat-message ${msg.sender}`}>
                          <span className="chat-sender-name">
                            {msg.sender === 'user' ? 'You' : 'Aura Travel AI'}
                          </span>
                          <div className="chat-bubble">
                            <p style={{ margin: 0 }} dangerouslySetInnerHTML={{ __html: msg.text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}></p>
                            
                            {/* Render a dynamic summary card if tripData is attached */}
                            {msg.tripData && (
                              <div className="chat-trip-card">
                                <div className="chat-trip-header">
                                  <span>✈️ {msg.tripData.destination}</span>
                                  <span style={{ fontSize: '0.75rem', background: 'rgba(168, 85, 247, 0.15)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px' }}>
                                    {msg.tripData.travelClass}
                                  </span>
                                </div>
                                <div className="chat-trip-details">
                                  <div className="chat-trip-row">
                                    <span className="label">Origin:</span>
                                    <span className="val">{msg.tripData.origin}</span>
                                  </div>
                                  <div className="chat-trip-row">
                                    <span className="label">Dates:</span>
                                    <span className="val">{msg.tripData.departureDate} to {msg.tripData.returnDate}</span>
                                  </div>
                                  <div className="chat-trip-row">
                                    <span className="label">Hotel:</span>
                                    <span className="val">{msg.tripData.hotelRating}</span>
                                  </div>
                                  <div className="chat-trip-row">
                                    <span className="label">Transport:</span>
                                    <span className="val">{msg.tripData.transportVehicle}</span>
                                  </div>
                                  <div className="chat-trip-row">
                                    <span className="label">Guests:</span>
                                    <span className="val">{msg.tripData.travelersCount} traveler(s)</span>
                                  </div>
                                </div>
                                <div className="chat-trip-actions">
                                  <button
                                    type="button"
                                    className="chat-action-btn primary"
                                    onClick={() => {
                                      setBookingMode('manual')
                                      addLog("🔄 Form parameters loaded from chat card. Ready for review.", "success")
                                    }}
                                  >
                                    ✍️ Review Form
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      
                      {isAiParsing && (
                        <div className="typing-indicator">
                          <span className="typing-dot"></span>
                          <span className="typing-dot"></span>
                          <span className="typing-dot"></span>
                        </div>
                      )}
                      
                      <div ref={chatMessagesEndRef} />
                    </div>

                    {/* Chat Input Box */}
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault()
                        handleSendMessage()
                      }}
                      className="chat-input-bar"
                    >
                      <input
                        type="text"
                        className="chat-input-field"
                        value={typedMessage}
                        onChange={(e) => setTypedMessage(e.target.value)}
                        placeholder="Say e.g., Plan a luxury family trip to Sydney from Mumbai starting 2026-08-10..."
                        disabled={isAiParsing}
                      />
                      <button 
                        type="submit" 
                        className="chat-send-btn"
                        disabled={isAiParsing || !typedMessage.trim()}
                      >
                        <span>🪄</span> Ask
                      </button>
                    </form>
                  </div>

                  {/* Gemini API Key input in Chat Panel */}
                  <div className="form-group" style={{ margin: '0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label className="form-label" style={{ margin: 0, fontSize: '0.75rem' }}>Gemini API Key (Optional)</label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--primary)', fontWeight: 600 }}>Gemini 2.5 Flash</span>
                    </div>
                    <input
                      type="password"
                      className="form-input"
                      style={{ background: 'rgba(210, 199, 183, 0.4)', fontSize: '0.8rem', padding: '8px 12px' }}
                      value={geminiKey}
                      onChange={(e) => handleGeminiKeyChange(e.target.value)}
                      placeholder="Enter Gemini API Key (stored in local browser storage)"
                      disabled={isAiParsing}
                    />
                  </div>

                  {/* Presets in Chat panel */}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px' }}>
                    <label className="form-label" style={{ fontSize: '0.72rem', color: 'var(--slate-400)', marginBottom: '8px', display: 'block' }}>
                      💡 Preset Prompt Suggestions (Click to send):
                    </label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <button
                        type="button"
                        className="preset-btn"
                        onClick={() => handleSendMessage("I want to book a couple trip from Paris to Tokyo in Business Class. We want a 5-Star Luxury Resort and a Tesla transfer from 2026-07-10 to 2026-07-20.")}
                        style={{
                          padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)', color: 'var(--slate-300)', fontSize: '0.75rem',
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >
                        🇯🇵 Tokyo Honeymoon
                      </button>
                      <button
                        type="button"
                        className="preset-btn"
                        onClick={() => handleSendMessage("Solo trip from Mumbai to London from 2026-08-01 to 2026-08-08 in Premium Economy. 4-Star Premium Hotel with a Mercedes S-Class transfer. No insurance.")}
                        style={{
                          padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)', color: 'var(--slate-300)', fontSize: '0.75rem',
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >
                        🇬🇧 London Business
                      </button>
                      <button
                        type="button"
                        className="preset-btn"
                        onClick={() => handleSendMessage("Family trip for 4 from New York to Bali from 2026-09-12 to 2026-09-19 in Economy Class. Boutique Penthouse Suite and Cadillac SUV transfer.")}
                        style={{
                          padding: '6px 12px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)', color: 'var(--slate-300)', fontSize: '0.75rem',
                          cursor: 'pointer', transition: 'all 0.2s'
                        }}
                      >
                        🇮🇩 Bali Vacation
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleStartBooking}>
                  {/* Banner indicating AI generated values */}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 16px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.1)',
                    border: '1px solid rgba(168, 85, 247, 0.2)', marginBottom: '20px', fontSize: '0.85rem',
                    color: 'var(--slate-200)'
                  }}>
                    <span>✨ Parameters generated by AI. Review fields below:</span>
                    <button
                      type="button"
                      onClick={() => setBookingMode('ai')}
                      style={{
                        background: 'transparent', border: 'none', color: 'var(--primary)',
                        cursor: 'pointer', fontWeight: 'bold', textDecoration: 'underline',
                        fontSize: '0.85rem'
                      }}
                    >
                      Edit Prompt
                    </button>
                  </div>
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
                    <label className="form-label">✈️ Trip Type</label>
                    <select
                      className="form-input"
                      value={tripType}
                      onChange={(e) => setTripType(e.target.value)}
                      disabled={isBookingActive && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus)}
                    >
                      <option value="Solo Trip">🧳 Solo Trip</option>
                      <option value="Couple / Honeymoon Getaway">💑 Couple / Honeymoon Getaway</option>
                      <option value="Family Vacation">👨‍👩‍👧‍👦 Family Vacation</option>
                      <option value="Business Trip">💼 Business Trip</option>
                      <option value="Group Adventure">🏕️ Group Adventure</option>
                    </select>
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
            )}

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

              <div className={isBookingActive ? "pipeline-layout active-booking" : "pipeline-layout"}>
                <div className="pipeline-container" style={{ paddingLeft: '0px' }}>
                  
                  {/* Step 1: Booking Reservations (Parent Step with Parallel Children) */}
                  {(() => {
                    const parentDetails = getStepDetails('booking-reservations');
                    const flightDetails = getStepDetails('flight');
                    const hotelDetails = getStepDetails('hotel');
                    const transportDetails = getStepDetails('transport');
                    
                    return (
                      <div className={`pipeline-step ${parentDetails.className}`}>
                        <div className="step-circle">🎫</div>
                        <div className="step-content">
                          <div className="step-header">
                            <h4 className="step-title">Booking Reservations (Parallel Phase)</h4>
                            <span className={`step-status ${parentDetails.className}`}>{parentDetails.label}</span>
                          </div>
                          <p className="step-desc">Reserves flight, hotel, and local transport concurrently in parallel.</p>
                          
                          <div className="sub-steps-container">
                            <div className={`sub-step-pill ${flightDetails.className}`}>
                              <span className="sub-icon">✈️</span> Flight: {flightDetails.label}
                            </div>
                            <div className={`sub-step-pill ${hotelDetails.className}`}>
                              <span className="sub-icon">🏨</span> Hotel: {hotelDetails.label}
                            </div>
                            <div className={`sub-step-pill ${transportDetails.className}`}>
                              <span className="sub-icon">🚗</span> Transport: {transportDetails.label}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Step 2: User Confirmation Checkpoint */}
                  {(() => {
                    const details = getStepDetails('confirm');
                    return (
                      <div className={`pipeline-step ${details.className}`}>
                        <div className="step-circle">⏳</div>
                        <div className="step-content">
                          <div className="step-header">
                            <h4 className="step-title">Awaiting for TripConfirmation</h4>
                            <span className={`step-status ${details.className}`}>{details.label}</span>
                          </div>
                          <p className="step-desc">Awaits manual trip confirmation. Initiates compensation if timeout occurs.</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Step 3: Child Payment Workflow (Parent Step with Sequential Children) */}
                  {(() => {
                    const parentDetails = getStepDetails('payment-workflow');
                    const chargeDetails = getStepDetails('payment-charge');
                    const invoiceDetails = getStepDetails('payment-invoice');
                    const loyaltyDetails = getStepDetails('payment-loyalty');
                    
                    return (
                      <div className={`pipeline-step ${parentDetails.className}`}>
                        <div className="step-circle">💳</div>
                        <div className="step-content">
                          <div className="step-header">
                            <h4 className="step-title">Child Payment Workflow</h4>
                            <span className={`step-status ${parentDetails.className}`}>{parentDetails.label}</span>
                          </div>
                          <p className="step-desc">Orchestrates card charge, invoicing, and loyalty points inside a sub-workflow.</p>
                          
                          <div className="sub-steps-container">
                            <div className={`sub-step-pill ${chargeDetails.className}`}>
                              <span className="sub-icon">💳</span> Card Charge: {chargeDetails.label}
                            </div>
                            <div className={`sub-step-pill ${invoiceDetails.className}`}>
                              <span className="sub-icon">🧾</span> Invoice: {invoiceDetails.label}
                            </div>
                            <div className={`sub-step-pill ${loyaltyDetails.className}`}>
                              <span className="sub-icon">🎁</span> Loyalty: {loyaltyDetails.label}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Step 4: Finalized */}
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

                {isBookingActive && (
                  <div className="pipeline-controls">
                    {/* Countdown and Confirmation Area */}
                    {workflowStatus === 'PENDING_USER_CONFIRMATION' && (
                      <div className="confirmation-box" style={{ marginTop: '0px' }}>
                        <div className="confirmation-header">
                          <div className="confirmation-title">
                            <span>⚠️</span> Confirmation Required
                          </div>
                          <div className="countdown-badge">
                            <span>⏰</span> {countdown}s remaining
                          </div>
                        </div>
                        <p style={{ margin: '0 0 16px 0', fontSize: '0.9rem', color: 'var(--slate-400)' }}>
                          The booking resources are provisionally reserved. Click the button below to issue a Temporal signal to confirm. If the timer runs out, the transaction will automatically run compensation activities.
                        </p>
                        {aiAdvisory && (() => {
                          const prefix = "✨ Aura AI Advisor:";
                          let content = aiAdvisory;
                          let hasHeader = false;
                          if (content.startsWith(prefix)) {
                            content = content.substring(prefix.length).trim();
                            hasHeader = true;
                          }
                          const rawLines = content.split('\n').filter(line => line.trim().length > 0);

                          // Group lines: a heading line is followed by its body text
                          const segments = [];
                          let i = 0;
                          while (i < rawLines.length) {
                            const line = rawLines[i].trim();

                            // Pattern 1: [Bracket Header]
                            const bracketMatch = line.match(/^\[(.+)\]$/);
                            if (bracketMatch) {
                              const heading = bracketMatch[1];
                              // Collect body lines until next heading
                              const bodyLines = [];
                              i++;
                              while (i < rawLines.length) {
                                const next = rawLines[i].trim();
                                if (next.match(/^\[.+\]$/) || next.match(/^[💡🌤️🛂✈️☀️🌧️🗼☔🌴🗽⚡]\s+\w/) || next.match(/^\*\*.+\*\*$/)) break;
                                bodyLines.push(next);
                                i++;
                              }
                              segments.push({ type: 'section', heading, body: bodyLines.join(' ') });
                              continue;
                            }

                            // Pattern 2: Label: Value (colon-separated)
                            const colonIdx = line.indexOf(':');
                            if (colonIdx > 0 && colonIdx < 60) {
                              const label = line.substring(0, colonIdx).trim();
                              const desc  = line.substring(colonIdx + 1).trim();
                              if (desc.length > 0) {
                                segments.push({ type: 'section', heading: label, body: desc });
                                i++;
                                continue;
                              }
                            }

                            // Pattern 3: Short standalone heading line (e.g. "💡 Expert Recommendation")
                            // Emoji regex breaks on multi-byte chars — use simple length check instead
                            if (!line.includes(':') && line.length <= 65) {
                              const heading = line;
                              const bodyLines = [];
                              i++;
                              while (i < rawLines.length) {
                                const next = rawLines[i].trim();
                                // Stop when we hit another heading-like line (short, no colon, or bracket)
                                if (next.match(/^\[.+\]$/) || (!next.includes(':') && next.length <= 65)) break;
                                bodyLines.push(next);
                                i++;
                              }
                              segments.push({ type: 'section', heading, body: bodyLines.join(' ') });
                              continue;
                            }

                            // Fallback: plain long line
                            segments.push({ type: 'plain', text: line });
                            i++;
                          }

                          return (
                            <div style={{
                              padding: '16px', borderRadius: '12px', background: 'rgba(28, 62, 42, 0.12)',
                              border: '1px solid rgba(16, 185, 129, 0.25)', marginBottom: '16px', fontSize: '0.85rem',
                              color: 'var(--text-h)', lineHeight: '1.4', fontFamily: 'var(--font-sans)',
                              textAlign: 'left'
                            }}>
                              {hasHeader && (
                                <div style={{ 
                                  fontWeight: 'bold', 
                                  fontSize: '0.95rem', 
                                  color: 'var(--accent)', 
                                  borderBottom: '1px dashed rgba(16, 185, 129, 0.35)', 
                                  paddingBottom: '8px', 
                                  marginBottom: '12px',
                                  fontFamily: 'var(--heading)',
                                  letterSpacing: '0.5px'
                                }}>
                                  ✨ Aura AI Advisor
                                </div>
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {segments.map((seg, idx) => {
                                  if (seg.type === 'section') {
                                    return (
                                      <div key={idx} style={{ 
                                        display: 'flex', 
                                        flexDirection: 'column', 
                                        gap: '4px',
                                        background: 'rgba(255, 255, 255, 0.02)',
                                        padding: '8px 12px',
                                        borderRadius: '6px',
                                        borderLeft: '3px solid var(--accent)'
                                      }}>
                                        <span style={{ 
                                          fontFamily: 'var(--heading)', 
                                          fontWeight: '800', 
                                          color: 'var(--accent)', 
                                          fontSize: '0.78rem',
                                          textTransform: 'uppercase',
                                          letterSpacing: '0.5px'
                                        }}>
                                          {seg.heading}
                                        </span>
                                        {seg.body && (
                                          <span style={{ 
                                            fontFamily: 'var(--mono)', 
                                            fontWeight: '700', 
                                            color: '#1a1a1a', 
                                            fontSize: '0.8rem',
                                            lineHeight: '1.5'
                                          }}>
                                            {seg.body}
                                          </span>
                                        )}
                                      </div>
                                    );
                                  }
                                  return (
                                    <div key={idx} style={{ 
                                      fontFamily: 'var(--sans)', 
                                      fontWeight: '400', 
                                      color: 'var(--text)', 
                                      fontSize: '0.8rem' 
                                    }}>
                                      {seg.text}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
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

                    {!isOfflineSimulation && !['CONFIRMED', 'CANCELLED', 'FAILED', 'NOT_FOUND'].includes(workflowStatus) && (
                      <button 
                        className="btn-kill"
                        onClick={handleKillBackend}
                        style={{
                          marginTop: workflowStatus === 'PENDING_USER_CONFIRMATION' ? '20px' : '0px',
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
                )}
              </div>
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

      {/* Tab 2: Admin Control Panel & Auditing iframe container */}
      {activeTab === 'admin' && (
        <div className="tab-content iframe-container">
          
          {/* Configuration Card */}
          <div className="glass-card" style={{ marginBottom: '30px', padding: '24px' }}>
            <h2 className="card-title" style={{ fontSize: '1.2rem', marginBottom: '16px', borderBottom: 'none', paddingBottom: '0px' }}>
              <span>⚙️</span> Workflow Control Panel
            </h2>
            <div style={{ display: 'flex', gap: '30px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, minWidth: '320px', flex: 1 }}>
                <label className="form-label" style={{ marginBottom: '8px', fontSize: '0.8rem', color: 'var(--slate-400)' }}>
                  ⏳ User Confirmation Timeout (seconds)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  <input 
                    type="range" 
                    min="10" 
                    max="300" 
                    step="10"
                    value={configuredTimeout}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setConfiguredTimeout(val);
                      addLog(`[ADMIN] Configured confirmation timeout changed to ${val} seconds.`, 'info');
                    }}
                    style={{ flex: 1, accentColor: 'var(--primary)', cursor: 'pointer' }}
                  />
                  <span style={{ 
                    fontFamily: 'var(--font-mono)', 
                    fontSize: '1.1rem', 
                    fontWeight: 700, 
                    color: 'var(--primary)',
                    minWidth: '50px',
                    textAlign: 'right'
                  }}>
                    {configuredTimeout}s
                  </span>
                </div>
                <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: 'var(--slate-500)', lineHeight: '1.4' }}>
                  Sets the duration of the countdown timer before the workflow initiates automatic Saga rollback.
                </p>
              </div>
            </div>
          </div>
          
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
