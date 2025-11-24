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
    <div className="bg-[#101828] p-4 shadow-lg rounded-xl my-4 space-y-4 text-white">
      <p className="text-sm font-semibold text-white">{submitMessage}</p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          type="text"
          name="name"
          placeholder="Full Name"
          value={formData.name}
          onChange={handleInputChange}
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          required
        />
        <input
          type="email"
          name="email"
          placeholder="Email Address"
          value={formData.email}
          onChange={handleInputChange}
          className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          required
        />
        <PhoneInputField
          onChange={(phone: string | undefined) => setFormData(prev => ({ ...prev, phone: phone || '' }))}
        />
        <select
          name="preferred_time"
          value={formData.preferred_time}
          onChange={handleInputChange}
          className="w-full p-2 border border-gray-300 rounded-lg bg-[#101828] focus:ring-blue-500 focus:border-blue-500"
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
          className={`w-full py-2 rounded-lg text-white font-bold transition duration-150 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-md'}`}
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
      
      if (error instanceof Error) {
        if (error.message?.includes('n8n workflow error')) {
          // Show the n8n-specific error message directly
          errorMessage = error.message.replace('n8n workflow error: ', '')
        } else if (error.message?.includes('No Respond to Webhook node')) {
          errorMessage = '⚠️ n8n Workflow Configuration Error: Your n8n workflow is missing a "Respond to Webhook" node. Please add one at the end of your workflow to return a response to the chatbot.'
        } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
          errorMessage = 'Network error: Could not reach the server. Please check your internet connection and try again.'
        } else if (error.message?.includes('n8n webhook error')) {
          // Extract the actual error from n8n
          errorMessage = error.message.replace('n8n webhook error (', '⚠️ n8n Error: ').replace(/\): /, ' - ')
        } else if (error.message) {
          errorMessage = `Error: ${error.message}`
        }
      }
      
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 transition-colors duration-200">

      <header className="sticky top-0 z-40 backdrop-blur bg-white/60 dark:bg-gray-900/60 border-b dark:border-gray-800">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="font-semibold text-xl">AISyncSo</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">AI Innovation Studio · Marketing + RAG</div>
          </div>

          <nav className="hidden md:flex items-center gap-6">
            <a href="#about" className="hover:underline">About</a>
            <a href="#services" className="hover:underline">Services</a>
            <a href="#projects" className="hover:underline">Projects</a>
            <a href="#contact" className="hover:underline">Contact</a>

            {/* Avoid rendering dynamic theme label until we are on client to prevent hydration mismatch */}
            <button onClick={toggleDark} className="px-3 py-1 rounded-md border" suppressHydrationWarning>
              {isClient ? (dark ? 'Light' : 'Dark') : 'Theme'}
            </button>

            <button onClick={openChat} className="bg-indigo-600 text-white px-4 py-1 rounded-md">Chat</button>
          </nav>

          <div className="md:hidden flex items-center gap-3">
            <button onClick={openChat} className="bg-indigo-600 text-white px-3 py-1 rounded-md">Chat</button>
            <button onClick={() => setNavOpen(s => !s)} aria-label="Toggle menu" className="p-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="stroke-current"><path d="M4 6h16M4 12h16M4 18h16" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
        </div>

        {navOpen && (
          <div className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-gray-900/80">
            <div className="px-6 py-4 flex flex-col gap-3">
              <a href="#about">About</a>
              <a href="#services">Services</a>
              <a href="#projects">Projects</a>
              <a href="#contact">Contact</a>
              <div className="flex gap-2 pt-2">
                <button onClick={toggleDark} className="px-3 py-1 rounded-md border" suppressHydrationWarning>{isClient ? (dark ? 'Light' : 'Dark') : 'Theme'}</button>
                <button onClick={openChat} className="bg-indigo-600 text-white px-4 py-1 rounded-md">Chat</button>
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-6 py-14">
        {/* Hero */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">AISyncSo — sync your data, brand & workflows into one intelligent assistant</h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300">We build RAG-powered chatbots and AI experiences for customer support, lead gen, and internal workflows — tuned for the MENA market.</p>

            <div className="mt-6 flex gap-4">
              <a href="#contact" className="bg-indigo-600 text-white px-6 py-3 rounded-md font-medium shadow">Get a demo</a>
              <button onClick={openChat} className="px-6 py-3 rounded-md border">Try chatbot</button>
            </div>

            <div className="mt-8 text-sm text-gray-500 dark:text-gray-400">Trusted by regional companies across fintech, real estate, and healthcare.</div>
          </div>

          <div className="rounded-xl p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border shadow-sm">
            <div className="text-sm text-gray-500 dark:text-gray-400">Live demo — minimal simulated chat</div>
            <div className="mt-4 border rounded-md p-4 bg-white dark:bg-gray-800">
              <div className="text-xs text-gray-400">AISyncSo Assistant</div>
              <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">Hi! Ask me about building a RAG chatbot, integrations, or pricing.</div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => { openChat(); void sendMessageToBot('How much does a basic chatbot cost?') }} className="px-3 py-1 rounded border">Pricing</button>
                <button onClick={() => { openChat(); void sendMessageToBot('Can you integrate with Dropbox and Pinecone?') }} className="px-3 py-1 rounded border">Integrations</button>
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="mt-20">
          <h2 className="text-2xl font-semibold">About AISyncSo</h2>
          <p className="mt-3 text-gray-600 dark:text-gray-300">AISyncSo is an AI innovation studio that builds custom, data-trained chatbots powered by Retrieval-Augmented Generation (RAG). We help businesses automate customer interaction, lead generation, and internal support by synchronizing their data, brand voice and workflows into a single intelligent assistant.</p>
        </section>

        {/* Services */}
        <section id="services" className="mt-14 grid md:grid-cols-3 gap-6">
          <div className="p-6 rounded-xl bg-white dark:bg-gray-800 border">
            <h3 className="font-semibold">RAG Chatbots</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Custom retrieval pipelines, knowledge sync, and conversational UX tuned to your brand.</p>
          </div>
          <div className="p-6 rounded-xl bg-white dark:bg-gray-800 border">
            <h3 className="font-semibold">AI Automation</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Automate lead qualification, internal tickets, and repetitive tasks using AI + workflows.</p>
          </div>
          <div className="p-6 rounded-xl bg-white dark:bg-gray-800 border">
            <h3 className="font-semibold">Consulting & Integration</h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">From architecture to deployment — Pinecone, vector DBs, Dropbox, n8n and cloud integrations.</p>
          </div>
        </section>

        {/* Projects */}
        <section id="projects" className="mt-14">
          <h2 className="text-2xl font-semibold">Projects</h2>
          <div className="mt-6 grid sm:grid-cols-2 gap-4">
            <article className="p-4 rounded border bg-white dark:bg-gray-800">
              <h4 className="font-semibold">Healthcare support bot</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Reduced average response time by 60% and automated appointment booking flows.</p>
            </article>
            <article className="p-4 rounded border bg-white dark:bg-gray-800">
              <h4 className="font-semibold">Real estate lead gen</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Deployed multilingual RAG assistant for listing Q&A and booking viewings.</p>
            </article>
          </div>
        </section>

        {/* Contact */}
        <section id="contact" className="mt-14">
          <h2 className="text-2xl font-semibold">Contact</h2>
          <p className="mt-2 text-gray-600 dark:text-gray-300">Interested in a demo or pilot? Drop your details below and we’ll reach out.</p>

          <form onSubmit={handleContactSubmit} className="mt-4 grid sm:grid-cols-2 gap-4">
            <input 
              id="contact-name"
              name="name"
              type="text"
              required 
              className="p-3 rounded border bg-white dark:bg-gray-800" 
              placeholder="Your name" 
            />
            <input 
              id="contact-email"
              name="email"
              type="email"
              required 
              className="p-3 rounded border bg-white dark:bg-gray-800" 
              placeholder="Email" 
            />
            <textarea 
              id="contact-message"
              name="message"
              required 
              className="p-3 rounded border bg-white dark:bg-gray-800 sm:col-span-2" 
              placeholder="Tell us about your project" 
              rows={5}
            ></textarea>
            <button 
              type="submit" 
              className="bg-indigo-600 text-white px-6 py-3 rounded-md sm:col-span-2 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={formStatus === 'sending'}
            >
              {formStatus === 'sending' ? 'Sending...' : 'Request demo'}
            </button>
            {formStatusMessage && (
              <p className={`text-sm sm:col-span-2 ${formStatus === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                {formStatusMessage}
              </p>
            )}
          </form>
        </section>

        <footer className="mt-20 border-t pt-6 text-sm text-gray-500 dark:text-gray-400">© 2024 AISyncSo — AI Innovation Studio. Built for MENA · English & Arabic support.</footer>
      </main>

      {/* Chat drawer */}
      <div className={`fixed right-6 bottom-6 z-50 flex flex-col items-end gap-3`}>
        {chatOpen && (
          <div className="w-96 max-w-full shadow-2xl rounded-xl overflow-hidden border bg-white dark:bg-gray-800">
            <div className="px-4 py-3 flex items-center justify-between border-b dark:border-gray-700">
              <div className="font-semibold">AISyncSo Assistant</div>
              <div className="flex gap-2 items-center">
                <button onClick={() => { setMessages([]) }} title="clear" className="text-xs px-2 py-1 border rounded">Clear</button>
                <button onClick={() => setChatOpen(false)} className="px-2 py-1 rounded bg-gray-100 dark:bg-gray-700">Close</button>
              </div>
            </div>

            <div ref={chatScrollRef} className="p-4 h-64 overflow-y-auto bg-gray-50 dark:bg-gray-900" id="chat-scroll">
              {messages.length === 0 && <div className="text-sm text-gray-500">Say hi — ask about RAG, integrations or pricing.</div>}
              <div className="flex flex-col gap-3 mt-2">
                {messages.map(m => (
                  <div key={m.id} className={`max-w-[85%] ${m.from === 'user' ? 'ml-auto text-right' : ''}`}>
                    <div className={`inline-block p-2 rounded-md ${m.from === 'user' ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border'}`}>
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
                    <div className="inline-block p-2 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce animation-delay-150"></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce animation-delay-300"></span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleChatSubmit(); }} className="p-3 border-t dark:border-gray-700 bg-white dark:bg-gray-800">
              <div className="flex gap-2">
                <input 
                  id="chat-message"
                  name="message"
                  type="text"
                  ref={inputRef} 
                  placeholder="Type message..." 
                  className="flex-1 p-2 rounded border bg-white dark:bg-gray-700" 
                  disabled={isLoading}
                />
                <button 
                  type="submit" 
                  className="px-3 py-1 rounded bg-indigo-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={isLoading}
                >
                  {isLoading ? '...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        )}

        {!chatOpen && (
          <button onClick={openChat} aria-label="Open chat" className="bg-indigo-600 text-white p-3 rounded-full shadow-lg">Chat</button>
        )}
      </div>
    </div>
  )
}
