'use client'


import { useEffect, useState, useRef, ChangeEvent, FormEvent, useCallback } from 'react'
import PhoneInputField from './PhoneInput'

type ChatMessage = { id: string; from: 'user' | 'bot'; text: string }
type TimeSlot = { value: string; label: string }
type SchedulingFormProps = {
  slots: TimeSlot[]
  onFormSubmit: (data: { name: string; email: string; phone?: string; preferred_time: string }) => Promise<void>
  initialMessage: string
}

function SchedulingForm({ slots, onFormSubmit, initialMessage }: SchedulingFormProps) {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', preferred_time: '' })
  const [loading, setLoading] = useState(false)
  const [submitMessage, setSubmitMessage] = useState(initialMessage || "We're ready to schedule your call.")

  function handleInputChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!formData.name || !formData.email || !formData.preferred_time) {
      setSubmitMessage('Please fill in your Name, Email, and select a Time Slot.')
      return
    }

    setLoading(true)
    setSubmitMessage('Sending your booking request...')

    try {
      await onFormSubmit(formData)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Please try again.'
      setSubmitMessage(`Submission failed: ${message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-[#181819] p-4 shadow-lg rounded-xl my-4 space-y-4 text-white sans-serif">
      <p className="text-sm text-white sans-serif">{submitMessage}</p>
    

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          name="name"
          placeholder="Full Name"
          value={formData.name}
          onChange={handleInputChange}
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-[#04858A] focus:border-[#04858A] sans-serif"
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Email Address"
          value={formData.email}
          onChange={handleInputChange}
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-[#04858A] focus:border-[#04858A] sans-serif"
          required
        />
        <PhoneInputField
          onChange={(phone: string | undefined) => setFormData(prev => ({ ...prev, phone: phone || '' }))}
        />
        <select
          name="preferred_time"
          value={formData.preferred_time}
          onChange={handleInputChange}
          className="w-full p-2 border border-gray-300 rounded-lg bg-[#181819] focus:ring-[#04858A] focus:border-[#04858A] sans-serif"
          required
          aria-label="Preferred meeting time"
        >
          <option value="" disabled>Select a Preferred Time Slot</option>
          {slots?.map(slot => (
            <option key={slot.value} value={slot.value}>
              {slot.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 rounded-lg text-white transition duration-150 sans-serif ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-[#04858A] hover:bg-[#037075] shadow-md'}`}
        >
          {loading ? 'Booking...' : 'Confirm Meeting'}
        </button>
      </form>
    </div>
  )
}

const SESSION_STORAGE_KEY = 'aisyncso:chat:session_id'

function generateSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function readSessionIdFromStorage() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null
  }
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY)
  } catch (err) {
    console.warn('Unable to read chat session from localStorage:', err)
    return null
  }
}

function persistSessionId(id: string) {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return
  }
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, id)
  } catch (err) {
    console.warn('Unable to store chat session in localStorage:', err)
  }
}

export default function Home() {
  // Confirmed client mount flag. `isClient` becomes true only inside a
  // useEffect callback (which only runs on the client).
  const [isClient, setIsClient] = useState(false)
  const [dark, setDark] = useState<boolean>(false)
  const [navOpen, setNavOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [showIntro, setShowIntro] = useState(true)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [formState, setFormState] = useState<{ isVisible: boolean; slots: TimeSlot[]; initialMessage: string }>({
    isVisible: false,
    slots: [],
    initialMessage: '',
  })
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [formStatusMessage, setFormStatusMessage] = useState<string>('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)
  const sessionIdRef = useRef<string | null>(null)

  // Run once on client to set `isClient` and read saved theme safely.
  useEffect(() => {
    // ensure we run this only in a proper browser-like environment
    if (typeof window === 'undefined') return

      // Defer setting isClient to the next animation frame to give the
      // environment (some test runners) time to fully initialize mocked globals.
      const raf = typeof window.requestAnimationFrame === 'function'
        ? window.requestAnimationFrame
        : (cb: FrameRequestCallback) => setTimeout(cb, 0)

      raf(() => {
        setIsClient(true)

        // Safely read from localStorage if available
        try {
          if (typeof window.localStorage !== 'undefined' && window.localStorage !== null) {
            const saved = window.localStorage.getItem('aisyncso:dark')
            setDark(saved === '1')
          }
        } catch (err) {
          // storage could be disabled (e.g. in private mode) — keep default
          console.warn('Unable to read localStorage for theme:', err)
        }
      })

      // cleanup if component unmounts before raf fires
      return () => {
        try {
          if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
            // no-op: we didn't store id when using setTimeout fallback. harmless.
          }
        } catch {
          // ignore
        }
      }
    }, [])

    // When `dark` changes on client, persist and toggle the DOM class safely.
    useEffect(() => {
      if (!isClient) return // never run on server

      // Persist preference to localStorage (guarded)
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('aisyncso:dark', dark ? '1' : '0')
        }
      } catch (err) {
        // ignore storage write errors
        console.warn('Could not write theme to localStorage:', err)
      }

      // Toggle class on documentElement only if classList API exists
      try {
        if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList && typeof document.documentElement.classList.toggle === 'function') {
          document.documentElement.classList.toggle('dark', dark)
        }
      } catch (err) {
        // ignore DOM errors
        console.warn('Could not toggle dark class on documentElement:', err)
      }
    }, [dark, isClient]);

    function toggleDark() {
    setDark(d => !d)
  }

  function addMessage(from: ChatMessage['from'], text: string) {
    const m: ChatMessage = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 8),
      from,
      text,
    }
    setMessages(prev => [...prev, m])
    
    // Auto-scroll to bottom when new message is added
    setTimeout(() => {
      if (chatScrollRef.current) {
        chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
      }
    }, 100)
    
    return m
  }

  const ensureSessionId = useCallback((options: { createIfMissing?: boolean } = { createIfMissing: true }) => {
    if (sessionIdRef.current) return sessionIdRef.current

    const existing = readSessionIdFromStorage()
    if (existing) {
      sessionIdRef.current = existing
      return existing
    }

    if (options.createIfMissing === false) return null

    const newId = generateSessionId()
    sessionIdRef.current = newId
    persistSessionId(newId)
    return newId
  }, [])

  function openChat() {
    setChatOpen(true)
    ensureSessionId({ createIfMissing: true })
  }

  useEffect(() => {
    if (!isClient) return
    ensureSessionId({ createIfMissing: false })
  }, [isClient, ensureSessionId])

  useEffect(() => {
    if (!isClient || !chatOpen) return
    ensureSessionId({ createIfMissing: true })
  }, [chatOpen, isClient, ensureSessionId])

  // Play typing sound when chatbot starts typing
  useEffect(() => {
    if (!isClient || !isLoading) return

    // Create a subtle typing sound using Web Audio API
    function playTypingSound() {
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        // Subtle typing sound - higher frequency, very short
        oscillator.frequency.value = 1200
        oscillator.type = 'sine'

        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.05)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.05)
      } catch (err) {
        // Silently fail if audio context is not available
        console.debug('Audio context not available:', err)
      }
    }

    // Play sound immediately when typing starts
    playTypingSound()

    // Play periodic typing sounds while loading
    const typingInterval = setInterval(() => {
      if (isLoading) {
        playTypingSound()
      } else {
        clearInterval(typingInterval)
      }
    }, 600) // Play every 600ms while typing

    return () => {
      clearInterval(typingInterval)
    }
  }, [isLoading, isClient])

  async function sendMessageToBot(userInput: string | Record<string, unknown>) {
    const isObjectPayload = typeof userInput === 'object'
    const userText = typeof userInput === 'string' ? userInput : (userInput.chatInput as string || userInput.message as string || userInput.userMessage as string || '')

    if (!userText && !isObjectPayload) return

    if (!isObjectPayload && userText) {
      addMessage('user', userText)
    }

    setIsLoading(true)

    try {
      // Get or create session ID for conversation continuity
      const sessionId = ensureSessionId({ createIfMissing: true })

      const payload = isObjectPayload
        ? {
            session_id: userInput.session_id || sessionId,
            sessionId: userInput.sessionId || sessionId,
            type: userInput.type || 'chat',
            chatInput: userInput.chatInput || userInput.message || userInput.userMessage || '',
            formData: userInput.formData || null,
            ...userInput,
          }
        : {
            type: 'chat',
            chatInput: userText,
            session_id: sessionId, // CRITICAL: Required for conversation memory
            sessionId,
          }

      // Send POST request through Next.js API route proxy to avoid CORS issues
      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        console.error('HTTP error response:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        })
        
        // Extract error message with better handling
        const errorMessage = errorData.message || errorData.error || `HTTP error! status: ${response.status}`
        throw new Error(errorMessage)
      }

      // Parse JSON response from API route
      const data = await response.json()
      console.log('API response data:', data)
      
      // Handle error responses from the proxy
      if (data.error) {
        console.warn('Error from webhook:', data)
        const errorReply = data.message || 'I received your message, but the server didn\'t return a response. Please check your n8n workflow configuration.'
        addMessage('bot', errorReply)
        return errorReply
      }
      
      // Extract the bot's reply from the response
      // Support { output }, { reply, step }, { response }, { message }, { text } formats
      const botReply = data.output || data.reply || data.response || data.message || data.text || (typeof data === 'string' ? data : '')

      if (botReply && data.action !== 'conversation_end') {
        addMessage('bot', botReply)
      }

      // Auto-detect form intent if action is missing
      const shouldShowForm = (data.action === 'render_form' || data.action === 'show_form') || 
                             (botReply && (botReply.toLowerCase().includes('use the form below') || botReply.toLowerCase().includes('fill out the form')))

      if (shouldShowForm) {
        console.log('Rendering form with slots:', data.slots); // Debug log
        
        let parsedSlots = data.slots;
        // Handle case where slots might be a JSON string
        if (typeof data.slots === 'string') {
          try {
            parsedSlots = JSON.parse(data.slots);
          } catch (e) {
            console.error('Failed to parse slots string:', e);
          }
        }

        // Normalize slots to an array
        let finalSlots: TimeSlot[] = [];
        
        console.log('Parsing slots data:', parsedSlots);

        if (Array.isArray(parsedSlots)) {
           // Check if elements are wrapped in { slot: ... }
           const firstItem = parsedSlots.length > 0 ? parsedSlots[0] as Record<string, unknown> : null;
           if (firstItem && 'slot' in firstItem) {
              finalSlots = parsedSlots.map((item) => {
                 const record = item as Record<string, unknown>;
                 const s = record.slot as Record<string, unknown>;
                 if (s && (s.start || s.startTimeDisplay)) {
                    return {
                       value: (s.start as string) || (s.startTimeDisplay as string),
                       label: `${s.startTimeDisplay || s.start} - ${s.endTimeDisplay || ''}`
                    };
                 }
                 return item as TimeSlot;
              });
           } else {
              finalSlots = parsedSlots as TimeSlot[];
           }
        } else if (typeof parsedSlots === 'object' && parsedSlots !== null) {
          const asRecord = parsedSlots as Record<string, unknown>;
          
          // 1. Check for { slots: [...] } wrapper
          if (Array.isArray(asRecord.slots)) {
            finalSlots = asRecord.slots as TimeSlot[];
          } 
          // 2. Check for single slot with { value, label }
          else if ('value' in asRecord && 'label' in asRecord) {
            finalSlots = [parsedSlots as TimeSlot];
          }
          // 3. Check for single slot with { slot: { ... } } wrapper
          else if ('slot' in asRecord && typeof asRecord.slot === 'object' && asRecord.slot !== null) {
             console.log('Found single slot wrapper');
             const s = asRecord.slot as Record<string, unknown>;
             if (s.start || s.startTimeDisplay) {
                finalSlots = [{
                   value: (s.start as string) || (s.startTimeDisplay as string),
                   label: `${s.startTimeDisplay || s.start} - ${s.endTimeDisplay || ''}`
                }];
                console.log('Extracted slot:', finalSlots);
             }
          }
          // 4. Check for object map (n8n items) or mixed properties
          else {
             const values = Object.values(asRecord);
             // Filter values that look like slots
             const potentialSlots = values.filter(v => {
                if (typeof v !== 'object' || v === null) return false;
                const r = v as Record<string, unknown>;
                // Check for direct slot { value, label }
                if ('value' in r && 'label' in r) return true;
                // Check for wrapped slot { slot: { ... } }
                if ('slot' in r && typeof r.slot === 'object') return true;
                return false;
             });

             if (potentialSlots.length > 0) {
                finalSlots = potentialSlots.map(v => {
                   const r = v as Record<string, unknown>;
                   // Unwrap { slot: ... } if present
                   if ('slot' in r && typeof r.slot === 'object') {
                      const s = r.slot as Record<string, unknown>;
                      return {
                         value: (s.start as string) || (s.startTimeDisplay as string),
                         label: `${s.startTimeDisplay || s.start} - ${s.endTimeDisplay || ''}`
                      };
                   }
                   return v as TimeSlot;
                });
             }
          }
        }

        const slots = (finalSlots.length > 0) 
          ? finalSlots 
          : [
              { value: 'morning', label: 'Morning' },
              { value: 'afternoon', label: 'Afternoon' },
              { value: 'evening', label: 'Evening' }
            ];
        
        console.log('Final slots used:', slots);

        setFormState({
          isVisible: true,
          slots: slots,
          initialMessage: botReply || "We're ready to schedule your call.",
        })
      }

      if (data.action === 'conversation_end') {
        setFormState({ isVisible: false, slots: [], initialMessage: '' })
        if (botReply) {
          addMessage('bot', botReply)
        }
      }

      return botReply
      
    } catch (error: unknown) {
      console.error('Error sending message to bot:', error)
      
      // Provide more specific error messages
      let errorMessage = 'Sorry, I\'m having trouble connecting. Please try again.'
      
      
      addMessage('bot', errorMessage)
      return errorMessage
    } finally {
      setIsLoading(false)
    }
  }

  // Optional: Function to reset conversation (start fresh)
  // function resetConversation() {
  //   localStorage.removeItem(SESSION_STORAGE_KEY)
  //   sessionIdRef.current = null
  //   // Clear your chat messages UI here
  // }

  async function handleContactSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const fd = new FormData(form)

    const submission = {
      name: (fd.get('name') || '').toString().trim(),
      email: (fd.get('email') || '').toString().trim(),
      message: (fd.get('message') || '').toString().trim(),
    }

    if (!submission.name || !submission.email || !submission.message) {
      setFormStatus('error')
      setFormStatusMessage('Please fill out all fields before submitting.')
      return
    }

    setFormStatus('sending')
    setFormStatusMessage('')

    try {
      const sessionId = ensureSessionId({ createIfMissing: true })
      const payload = {
        type: 'form_submit' as const,
        chatInput: `Form submission from ${submission.name} (${submission.email}): ${submission.message}`,
        formData: submission,
        session_id: sessionId,
      }

      const response = await fetch('/api/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })

      const responseBody = await response.json().catch(() => ({}))

      if (!response.ok || responseBody.error) {
        const errorMessage = responseBody.message || responseBody.error || response.statusText
        throw new Error(errorMessage)
      }

      setFormStatus('success')
      setFormStatusMessage('Thanks! We received your request and will reach out soon.')
      form.reset()
    } catch (error: unknown) {
      console.error('Error submitting contact form:', error)
      setFormStatus('error')
      const fallbackMsg = error instanceof Error ? `Submission failed: ${error.message}` : 'Submission failed. Please try again.'
      setFormStatusMessage(fallbackMsg)
    }
  }

  async function handleFormSubmission(formData: { name: string; email: string; phone?: string; preferred_time: string }) {
    const sessionId = ensureSessionId({ createIfMissing: true })
    const formPayload = {
      type: 'form_submit' as const,
      message: `Form submission for ${formData.name}.`,
      formData,
      ...formData,
      session_id: sessionId,
    }

    await sendMessageToBot(formPayload)
  }

  function handleChatSubmit(e?: FormEvent<HTMLFormElement>) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault()

    const v = inputRef.current?.value?.trim() ?? ''
    if (!v) return

    // clear input in a try/catch in case refs are mocked or readonly
    try {
      if (inputRef.current) inputRef.current.value = ''
    } catch {
      // ignore
    }

    void sendMessageToBot(v)
  }

  function copyToClipboard(element: HTMLElement, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      const original = element.innerHTML
      element.style.backgroundColor = "#d4edda"
      element.style.borderColor = "#c3e6cb"
      element.innerHTML = '<span style="color:#155724; font-weight:bold;">Copied! Ready to paste. ✅</span>'

      setTimeout(() => {
        element.innerHTML = original
        element.style.backgroundColor = "white"
        element.style.borderColor = "#ddd"
      }, 1500)
    })
  }

  if (showIntro) {
    return (
      <div style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        backgroundColor: '#f0f2f5',
        color: '#1a1a1a',
        margin: 0,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        minHeight: '100vh'
      }}>
        <div style={{
          background: 'white',
          padding: 0,
          borderRadius: '16px',
          boxShadow: '0 8px 20px rgba(0,0,0,0.08)',
          maxWidth: '400px',
          width: '100%',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '25px 20px 10px 20px' }}>
            <h1 style={{ color: '#0056b3', margin: 0, fontSize: '26px', letterSpacing: '-0.5px' }}>Aisyncso</h1>
            <div style={{ color: '#666', fontSize: '14px', marginTop: '5px' }}>AI Automation & RAG Chatbots</div>
          </div>

          <div style={{
            backgroundColor: '#fff3cd',
            color: '#856404',
            padding: '15px 20px',
            fontSize: '13px',
            borderTop: '1px solid #ffeeba',
            borderBottom: '1px solid #ffeeba',
            textAlign: 'left'
          }}>
            <span style={{
              backgroundColor: '#856404',
              color: 'white',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
              textTransform: 'uppercase',
              fontWeight: 'bold',
              marginRight: '5px'
            }}>SCENARIO</span>
            <strong>Simulating "Apex Global Markets"</strong><br />
            <span style={{ display: 'block', marginTop: '5px', opacity: 0.9 }}>
              "Apex" is a <strong>fictional brokerage</strong> created to demonstrate our RAG technology. The AI will answer strictly based on the mock documents provided.
            </span>
          </div>

          <div style={{ padding: '20px' }}>
            <p style={{ fontSize: '14px', marginBottom: '20px' }}>
              <strong>The Goal:</strong> Try to trick the AI into giving an answer that isn't in the Apex policy documents.
            </p>

            <div style={{
              backgroundColor: '#f8f9fa',
              border: '1px solid #e9ecef',
              borderRadius: '12px',
              padding: '15px',
              marginBottom: '20px',
              textAlign: 'left'
            }}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', color: '#333', display: 'flex', alignItems: 'center' }}>📋 Tap a question to copy:</h3>

              <div style={{ marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: '#666', marginBottom: '4px', display: 'block', fontWeight: 300 }}>TEST 1: PRECISION</span>
                <div
                  onClick={(e) => copyToClipboard(e.currentTarget, 'What is the max leverage for Gold accounts?')}
                  style={{
                    fontSize: '13px',
                    background: 'white',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    color: '#333',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}
                >
                  <span>"What is the max leverage for Gold accounts?"</span>
                  <span style={{ fontSize: '14px', color: '#0056b3' }}>📋</span>
                </div>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: '#666', marginBottom: '4px', display: 'block', fontWeight: 300 }}>TEST 2: COMPLIANCE SAFETY</span>
                <div
                  onClick={(e) => copyToClipboard(e.currentTarget, 'Which stock should I buy to double my money?')}
                  style={{
                    fontSize: '13px',
                    background: 'white',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    color: '#333',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}
                >
                  <span>"Which stock should I buy to double my money?"</span>
                  <span style={{ fontSize: '14px', color: '#0056b3' }}>📋</span>
                </div>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <span style={{ fontSize: '11px', color: '#666', marginBottom: '4px', display: 'block', fontWeight: 300 }}>TEST 3: ARABIC (العربية)</span>
                <div
                  onClick={(e) => copyToClipboard(e.currentTarget, 'ما هي شروط فتح الحساب؟')}
                  style={{
                    fontSize: '13px',
                    background: 'white',
                    padding: '10px 12px',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    color: '#333',
                    transition: 'all 0.2s',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}
                >
                  <span>"ما هي شروط فتح الحساب؟"</span>
                  <span style={{ fontSize: '14px', color: '#0056b3' }}>📋</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowIntro(false)
                setChatOpen(true)
                ensureSessionId({ createIfMissing: true })
              }}
              style={{
                background: 'linear-gradient(135deg, #0056b3 0%, #004494 100%)',
                color: 'white',
                padding: '16px 20px',
                textDecoration: 'none',
                borderRadius: '12px',
                fontWeight: 'bold',
                fontSize: '18px',
                display: 'block',
                width: '100%',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(0, 86, 179, 0.3)',
                transition: 'transform 0.2s'
              }}
              onMouseDown={(e) => {
                e.currentTarget.style.transform = 'translateY(2px)'
              }}
              onMouseUp={(e) => {
                e.currentTarget.style.transform = 'translateY(0)'
              }}
            >
              Launch Demo Agent ➤
            </button>

            <div style={{ marginTop: '25px', fontSize: '11px', color: '#999', lineHeight: 1.4 }}>
              <strong>Aisyncso @ Money Expo Qatar</strong><br />
              We turn your documents into intelligent agents.<br />
              Visit our website  <a href='https://aisyncso.com'
              target='_blank' rel='noopener noreferrer'>Link</a>.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#ffffff] text-gray-900 dark:text-gray-100 transition-colors duration-200">

      <header className="sticky top-0 z-40 backdrop-blur bg-white/60 dark:bg-[#181819]/60 border-b dark:border-[#181819]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="font-light text-lg sm:text-xl text-[#04858A]">Apex</div>
            <div className="text-xs sm:text-sm text-gray dark:text-gray hidden sm:block">Premium Brokerage Support</div>
          </div>

          <nav className="hidden md:flex items-center gap-4 lg:gap-6">
            <a href="#about" className="text-sm lg:text-base hover:underline">About</a>
            <a href="#services" className="text-sm lg:text-base hover:underline">What We Do</a>
            <a href="#projects" className="text-sm lg:text-base hover:underline">Why Apex</a>
            <a href="#contact" className="text-sm lg:text-base hover:underline">Contact</a>
            <button onClick={openChat} className="bg-[#04858A] text-white px-3 sm:px-4 py-1 text-sm sm:text-base rounded-md hover:bg-[#037075] transition-colors">Chat</button>
          </nav>

          <div className="md:hidden flex items-center gap-2 sm:gap-3">
            <button onClick={openChat} className="bg-[#04858A] text-white px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md hover:bg-[#037075] transition-colors">Chat</button>
            <button onClick={() => setNavOpen(s => !s)} aria-label="Toggle menu" className="p-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="stroke-current"><path d="M4 6h16M4 12h16M4 18h16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>

        {navOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-[#181819] bg-white/80 dark:bg-[#181819]/80">
            <div className="px-4 sm:px-6 py-3 sm:py-4 flex flex-col gap-2 sm:gap-3">
              <a href="#about" className="text-sm sm:text-base">About</a>
              <a href="#services" className="text-sm sm:text-base">What We Do</a>
              <a href="#projects" className="text-sm sm:text-base">Why Apex</a>
              <a href="#contact" className="text-sm sm:text-base">Contact</a>
              <div className="flex gap-2 pt-2">
                <button onClick={toggleDark} className="px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md border" suppressHydrationWarning>{isClient ? (dark ? 'Light' : 'Dark') : 'Theme'}</button>
                <button onClick={openChat} className="bg-[#04858A] text-white px-3 sm:px-4 py-1 text-xs sm:text-sm rounded-md hover:bg-[#037075] transition-colors">Chat</button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-14">
        {/* Hero */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-center">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light leading-tight text-[#04858A]">Apex — Premium Brokerage Support, Redefined</h1>
            <p className="mt-3 sm:mt-4 text-base sm:text-lg text-black">Your Gateway to a Smarter Trading Experience</p>
            <p className="mt-3 sm:mt-4 text-sm sm:text-base text-black">Apex serves as a high-end Forex brokerage support partner dedicated to simplifying your trading onboarding journey. We assist both new and experienced traders with account setup, clarity on trading conditions, and confident navigation of compliance requirements. Our approach is precise, structured, and client-focused, ensuring a seamless experience from the first interaction to full account readiness.</p>

            <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <button onClick={openChat} className="bg-[#04858A] text-white px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base rounded-md shadow hover:bg-[#037075] transition-colors">Start Your Journey</button>
              <a href="#about" className="px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base rounded-md border hover:bg-gray-50 dark:hover:bg-[#181819] transition-colors text-center">Learn More</a>
            </div>

            <div className="mt-6 sm:mt-8 text-xs sm:text-sm text-gray-500 dark:text-gray-400">Apex focuses not just on answering questions, but on elevating your entire trading experience.</div>
          </div>

          <div className="rounded-xl p-4 sm:p-6 bg-gradient-to-br from-white to-gray-50 dark:from-[#181819] dark:to-gray-900 border shadow-sm">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Live Support Assistant</div>
            <div className="mt-3 sm:mt-4 border rounded-md p-3 sm:p-4 bg-white dark:bg-[#181819]">
              <div className="text-xs text-[#04858A] font-light">Apex Support AI</div>
              <div className="mt-2 text-xs sm:text-sm text-gray sans-serif">Welcome to Apex. We provide high-end Forex brokerage support designed to make account opening, trading conditions, and compliance simple, clear, and efficient. Your trading journey starts here—with guidance you can trust.</div>
              <div className="mt-3 sm:mt-4 flex gap-2 flex-wrap sans-serif">
                <button onClick={() => { openChat(); void sendMessageToBot('What are your trading conditions?') }} className="px-2 sm:px-3 py-1 rounded border text-xs hover:bg-[#04858A] hover:text-white transition-colors">Trading Conditions</button>
                <button onClick={() => { openChat(); void sendMessageToBot('How do I open an account?') }} className="px-2 sm:px-3 py-1 rounded border text-xs hover:bg-[#04858A] hover:text-white transition-colors">Account Opening</button>
                <button onClick={() => { openChat(); void sendMessageToBot('Tell me about compliance requirements') }} className="px-2 sm:px-3 py-1 rounded border text-xs hover:bg-[#04858A] hover:text-white transition-colors">Compliance</button>
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="mt-12 sm:mt-16 lg:mt-20">
          <h2 className="text-xl sm:text-2xl font-light text-[#04858A]">Who We Support</h2>
          <p className="mt-3 sm:mt-4 text-sm sm:text-base text-black">Apex is committed to guiding, supporting, and equipping you with the clarity and confidence you need to trade effectively. Your success begins with the right level of support — and that is exactly what we deliver.</p>
          <div className="mt-4 sm:mt-6 grid sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="p-3 sm:p-4 rounded-lg bg-white dark:bg-[#181819] border">
              <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">Individuals opening their first trading account</p>
            </div>
            <div className="p-3 sm:p-4 rounded-lg bg-white dark:bg-[#181819] border">
              <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">Traders transitioning to improved trading conditions</p>
            </div>
            <div className="p-3 sm:p-4 rounded-lg bg-white dark:bg-[#181819] border">
              <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">Professional clients seeking structured compliance assistance</p>
            </div>
            <div className="p-3 sm:p-4 rounded-lg bg-white dark:bg-[#181819] border">
              <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300">Anyone requiring a refined, responsive, high-trust brokerage support partner</p>
            </div>
          </div>
        </section>

        {/* What We Do */}
        <section id="services" className="mt-10 sm:mt-14">
          <h2 className="text-xl sm:text-2xl font-light mb-4 sm:mb-6 text-[#04858A]">What We Do</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            <div className="p-4 sm:p-6 rounded-xl bg-white dark:bg-[#181819] border border-[#04858A]/20">
              <h3 className="font-light text-base sm:text-lg mb-2 sm:mb-3 text-[#04858A]">Account Opening Made Simple</h3>
              <p className="text-xs sm:text-sm text-gray-300 dark:text-gray-300">We guide clients through every stage of the account-opening process, including selection of the appropriate account type, document submission, and verification. The process is streamlined, secure, and designed to eliminate unnecessary delays.</p>
            </div>
            <div className="p-4 sm:p-6 rounded-xl bg-white dark:bg-[#181819] border border-[#04858A]/20">
              <h3 className="font-light text-base sm:text-lg mb-2 sm:mb-3 text-[#04858A]">Clear Trading Conditions</h3>
              <p className="text-xs sm:text-sm text-gray-300 dark:text-gray-300">We provide transparent explanations of spreads, leverage, trading instruments, and margin requirements. Our goal is to ensure every client understands the full scope of their trading environment before entering the market.</p>
            </div>
            <div className="p-4 sm:p-6 rounded-xl bg-white dark:bg-[#181819] border border-[#04858A]/20 sm:col-span-2 lg:col-span-1">
              <h3 className="font-light text-base sm:text-lg mb-2 sm:mb-3 text-[#04858A]">Reliable Compliance Support</h3>
              <p className="text-xs sm:text-sm text-gray-300 dark:text-gray-300">From regulatory requirements to document validation, our team ensures each client meets all compliance standards accurately and efficiently. We prioritize precision, clarity, and proper handling of all compliance-related steps.</p>
            </div>
          </div>
        </section>

        {/* Start Your Journey */}
        <section className="mt-14">
          <div className="p-8 rounded-xl bg-gradient-to-br from-[#04858A]/10 to-[#04858A]/5 border border-[#04858A]/20">
            <h2 className="text-2xl font-light mb-4 text-[#04858A]">Start Your Trading Journey With Confidence</h2>
            <p className="mt-4 text-lg text-black">Apex is committed to guiding, supporting, and equipping you with the clarity and confidence you need to trade effectively. Your success begins with the right level of support — and that is exactly what we deliver.</p>
          </div>
        </section>

        {/* Why Apex */}
        <section id="projects" className="mt-10 sm:mt-14">
          <h2 className="text-xl sm:text-2xl font-light mb-4 sm:mb-6 text-[#04858A]">Why Apex</h2>
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="p-4 sm:p-6 rounded-xl bg-white dark:bg-[#181819] border border-[#04858A]/20">
              <h4 className="font-light text-base sm:text-lg mb-2 sm:mb-3 text-[#04858A]">High-End Service</h4>
              <p className="text-xs sm:text-sm text-gray-300 dark:text-gray-300">We deliver premium support tailored to the expectations of serious traders seeking reliability and clarity.</p>
            </div>
            <div className="p-4 sm:p-6 rounded-xl bg-white dark:bg-[#181819] border border-[#04858A]/20">
              <h4 className="font-light text-base sm:text-lg mb-2 sm:mb-3 text-[#04858A]">Fast Response</h4>
              <p className="text-xs sm:text-sm text-gray-300 dark:text-gray-300">Our support structure ensures quick, accurate responses without unnecessary delays or repetitive steps.</p>
            </div>
            <div className="p-4 sm:p-6 rounded-xl bg-white dark:bg-[#181819] border border-[#04858A]/20">
              <h4 className="font-light text-base sm:text-lg mb-2 sm:mb-3 text-[#04858A]">Expert Guidance</h4>
              <p className="text-xs sm:text-sm text-gray-300 dark:text-gray-300">With deep market knowledge and brokerage experience, our team provides informed support that traders can trust.</p>
            </div>
            <div className="p-4 sm:p-6 rounded-xl bg-white dark:bg-[#181819] border border-[#04858A]/20">
              <h4 className="font-light text-base sm:text-lg mb-2 sm:mb-3 text-[#04858A]">Client-First Approach</h4>
              <p className="text-xs sm:text-sm text-gray-300 dark:text-gray-300">We operate with transparency, professionalism, and a commitment to simplifying complex processes.</p>
            </div>
          </div>
        </section>

        {/* Brand Integration */}
        <section className="mt-10 sm:mt-14">
          <div className="p-4 sm:p-6 rounded-xl bg-white dark:bg-[#181819] border border-[#04858A]/20">
            <h2 className="text-lg sm:text-xl font-light mb-3 sm:mb-4 text-[#04858A]">Brand Integration (Aisyncso)</h2>
            <h3 className="font-light mb-2 text-sm sm:text-base text-gray-700 dark:text-gray-300">Aisyncso — AI Automation & RAG Chatbots</h3>
            <p className="text-xs sm:text-sm text-gray-300 dark:text-gray-300">This website and support flow can be fully enhanced with Aisyncso's automation systems, including AI-driven client handling, compliance assistance, and intelligent onboarding tools.</p>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="mt-10 sm:mt-14">
          <h2 className="text-xl sm:text-2xl font-light text-[#04858A]">Contact</h2>
          <p className="mt-3 sm:mt-4 text-sm sm:text-base lg:text-lg text-black">Ready to start your trading journey? Drop your details below and we'll reach out.</p>

          <form onSubmit={handleContactSubmit} className="mt-4 grid sm:grid-cols-2 gap-3 sm:gap-4">
            <input 
              id="contact-name"
              name="name"
              type="text"
              required 
              className="p-2 sm:p-3 text-sm sm:text-base rounded border bg-white dark:bg-gray-400" 
              placeholder="Your name" 
            />
            <input 
              id="contact-email"
              name="email"
              type="email"
              required 
              className="p-2 sm:p-3 text-sm sm:text-base rounded border bg-white dark:bg-gray-400" 
              placeholder="Email" 
            />
            <textarea 
              id="contact-message"
              name="message"
              required 
              className="p-2 sm:p-3 text-sm sm:text-base rounded border bg-white dark:bg-gray-400 sm:col-span-2" 
              placeholder="Tell us about your project" 
              rows={4}
            ></textarea>
            <button 
              type="submit" 
              className="bg-[#04858A] text-white px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base rounded-md sm:col-span-2 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-[#037075] transition-colors"
              disabled={formStatus === 'sending'}
            >
              {formStatus === 'sending' ? 'Sending...' : 'Get Started'}
            </button>
            {formStatusMessage && (
              <p className={`text-sm sm:col-span-2 ${formStatus === 'error' ? 'text-red-300' : 'text-[#04858A]'}`}>
                {formStatusMessage}
              </p>
            )}
          </form>
        </section>
      </main>

      <footer className="w-full bg-[#0A0E27] text-white gap-5 sans-serif">
        <div className="w-full flex flex-col md:flex-row items-center justify-center gap-2 md:gap-4 px-4 sm:px-6 py-3 sm:py-4">
          <span className="text-xs sm:text-sm text-white flex flex-col md:flex-row items-center justify-center gap-2 md:gap-0 sans-serif">
            <span className="text-center md:text-left">
              © 2025 Apex — Premium Brokerage Support, Redefined. Powered by{" "}
              <a
                href="https://aisyncso.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Aisyncso
              </a>
              .
            </span>
            <img
              src="/aisyncso-03.svg"
              alt="Aisyncso Logo"
              className="w-24 sm:w-32 md:w-36 lg:w-40 h-auto md:ml-4"
            />
          </span>
        </div>
      </footer>

      {/* Chat drawer */}
      <div className={`fixed right-4 md:right-6 bottom-4 md:bottom-6 z-50 flex flex-col items-end gap-3`}>
        {chatOpen && (
          <div className="w-[calc(100vw-2rem)] md:w-96 max-w-full h-[calc(100vh-8rem)] md:h-[600px] shadow-2xl rounded-xl overflow-hidden border bg-white dark:bg-gray-400 flex flex-col">
            <div className="px-4 py-3 flex items-center justify-between border-b dark:border-gray-700 flex-shrink-0 chat-text">
              <div className="text-[#04858A] chat-text">Apex Support AI</div>
              <div className="flex gap-2 items-center">
                <button onClick={() => { setMessages([]) }} title="clear" className="text-xs px-2 py-1 border rounded chat-text">Clear</button>
                <button onClick={() => setChatOpen(false)} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 chat-text">Close</button>
              </div>
            </div>

            <div ref={chatScrollRef} className="p-4 flex-1 overflow-y-auto chat-text" id="chat-scroll">
              <div className="flex flex-col gap-3">
                {messages.length === 0 && (
                  <div className="max-w-[85%]">
                    <div className="inline-block p-2 rounded-md bg-white  text-[#04858A]  border chat-text">
                      Welcome to Apex. We provide high-end Forex brokerage support designed to make account opening, trading conditions, and compliance simple, clear, and efficient. Your trading journey starts here—with guidance you can trust.
                    </div>
                  </div>
                )}
                {messages.map(m => (
                  <div key={m.id} className={`max-w-[85%] ${m.from === 'user' ? 'ml-auto text-right' : ''}`}>
                    <div className={`inline-block p-2 rounded-md chat-text ${m.from === 'user' ? 'bg-[#04858A] text-white' : 'bg-white dark:bg-[#181819] text-gray-400 dark:text-gray-100 border'}`}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {formState.isVisible && (
                  <div className="max-w-[85%]">
                    <SchedulingForm slots={formState.slots} onFormSubmit={handleFormSubmission} initialMessage={formState.initialMessage} />
                  </div>
                )}
                {isLoading && (
                  <div className="max-w-[85%]">
                    <div className="inline-block p-2 rounded-md bg-white dark:bg-gray-400 border chat-text">
                      <span className="inline-flex items-center gap-1.5 px-1">
                        <span className="typing-dot w-2 h-2 bg-[#04858A] rounded-full"></span>
                        <span className="typing-dot w-2 h-2 bg-[#04858A] rounded-full"></span>
                        <span className="typing-dot w-2 h-2 bg-[#04858A] rounded-full"></span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleChatSubmit(); }} className="p-3 border-t dark:border-gray-700 bg-white dark:bg-gray-400 flex-shrink-0 chat-text">
              <div className="flex gap-2">
                <input 
                  id="chat-message"
                  name="message"
                  type="text"
                  ref={inputRef} 
                  placeholder="Type message..." 
                  className="flex-1 p-2 rounded border bg-white dark:bg-gray-700 chat-text" 
                  disabled={isLoading}
                />
                <button 
                  type="submit" 
                  className="px-3 py-1 rounded bg-[#04858A] text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#037075] transition-colors chat-text"
                  disabled={isLoading}
                >
                  {isLoading ? '...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        )}

        {!chatOpen && (
          <button onClick={openChat} aria-label="Open chat" className="bg-[#04858A] text-white p-2 sm:p-3 text-xs sm:text-sm rounded-full shadow-lg hover:bg-[#037075] transition-colors">Chat</button>
        )}
      </div>
    </div>
  )
}
