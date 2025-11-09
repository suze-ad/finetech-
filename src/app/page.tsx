'use client'


import { useEffect, useState, useRef } from 'react'

type ChatMessage = { id: string; from: 'user' | 'bot'; text: string }

export default function Home() {
  // Confirmed client mount flag. `isClient` becomes true only inside a
  // useEffect callback (which only runs on the client).
  const [isClient, setIsClient] = useState(false)
  const [dark, setDark] = useState<boolean>(false)
  const [navOpen, setNavOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const chatScrollRef = useRef<HTMLDivElement | null>(null)

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
        // eslint-disable-next-line no-console
        console.warn('Unable to read localStorage for theme:', err)
      }
    })

    // cleanup if component unmounts before raf fires
    return () => {
      try {
        if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
          // no-op: we didn't store id when using setTimeout fallback. harmless.
        }
      } catch (_) {
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
      // eslint-disable-next-line no-console
      console.warn('Could not write theme to localStorage:', err)
    }

    // Toggle class on documentElement only if classList API exists
    try {
      if (typeof document !== 'undefined' && document.documentElement && (document.documentElement as any).classList && typeof (document.documentElement as any).classList.toggle === 'function') {
        document.documentElement.classList.toggle('dark', dark)
      }
    } catch (err) {
      // ignore DOM errors
      // eslint-disable-next-line no-console
      console.warn('Could not toggle dark class on documentElement:', err)
    }
  }, [dark, isClient])

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

  // Send message to n8n webhook workflow
  // Generate or retrieve session ID (store in localStorage or state)
  function getOrCreateSessionId(): string {
    // Ensure we're on the client side
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      // Fallback for SSR or when localStorage is unavailable
      return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
    
    try {
      let sessionId = window.localStorage.getItem('chatbot_session_id')
      if (!sessionId) {
        sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        window.localStorage.setItem('chatbot_session_id', sessionId)
      }
      return sessionId
    } catch (error) {
      // If localStorage fails (e.g., private browsing), generate a new session ID
      console.warn('localStorage unavailable, using temporary session ID:', error)
      return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
  }

async function sendMessageToBot(userText: string) {
    if (!userText) return
    
    // Add user message immediately
    addMessage('user', userText)
    setIsLoading(true)

    try {
      // Get or create session ID for conversation continuity
      const sessionId = getOrCreateSessionId()
      
      // Send POST request to n8n webhook
      const response = await fetch('https://aisyncso.app.n8n.cloud/webhook/chatbot', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userText,
          session_id: sessionId, // CRITICAL: Required for conversation memory
        }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => '')
        throw new Error(`HTTP error! status: ${response.status}${errorText ? ` - ${errorText}` : ''}`)
      }

      // Get response text first to check if it's empty
      const responseText = await response.text()
      
      // Handle empty responses (204 No Content or empty body)
      if (!responseText || responseText.trim() === '') {
        console.warn('Empty response from n8n webhook. Status:', response.status)
        // If it's a 204 No Content, that's actually OK - the webhook processed the request
        if (response.status === 204) {
          const defaultReply = 'Message received! Your n8n workflow processed the request but didn\'t return a response. Please configure your workflow to return a response.'
          addMessage('bot', defaultReply)
          return defaultReply
        }
        // For other empty responses, show a helpful message
        const emptyReply = 'I received your message, but the server didn\'t return a response. Please check your n8n workflow configuration.'
        addMessage('bot', emptyReply)
        return emptyReply
      }

      // Try to parse as JSON, fallback to plain text
      let data: any
      const contentType = response.headers.get('content-type') || ''
      
      if (contentType.includes('application/json')) {
        try {
          data = JSON.parse(responseText)
        } catch (parseError) {
          // If JSON parsing fails, treat as plain text
          console.warn('Failed to parse JSON, treating as plain text:', parseError)
          data = responseText
        }
      } else {
        // Not JSON, treat as plain text
        data = responseText
      }
      
      // Extract the bot's reply from the response
      // Your n8n workflow returns: { response: "...", session_id: "..." }
      const botReply = data.response || data.message || data.text || 
                       (typeof data === 'string' ? data : 'Sorry, I encountered an error.')
      
      addMessage('bot', botReply)
      return botReply
      
    } catch (error) {
      console.error('Error sending message to bot:', error)
      const errorMessage = 'Sorry, I\'m having trouble connecting. Please try again.'
      addMessage('bot', errorMessage)
      return errorMessage
    } finally {
      setIsLoading(false)
    }
}

// Optional: Function to reset conversation (start fresh)
function resetConversation() {
  localStorage.removeItem('chatbot_session_id')
  // Clear your chat messages UI here
}
  function handleChatSubmit(e?: React.FormEvent) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault()

    const v = inputRef.current?.value?.trim() ?? ''
    if (!v) return

    // clear input in a try/catch in case refs are mocked or readonly
    try {
      if (inputRef.current) inputRef.current.value = ''
    } catch (err) {
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

            <button onClick={() => setChatOpen(true)} className="bg-indigo-600 text-white px-4 py-1 rounded-md">Chat</button>
          </nav>

          <div className="md:hidden flex items-center gap-3">
            <button onClick={() => setChatOpen(true)} className="bg-indigo-600 text-white px-3 py-1 rounded-md">Chat</button>
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
                <button onClick={() => setChatOpen(true)} className="bg-indigo-600 text-white px-4 py-1 rounded-md">Chat</button>
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
              <button onClick={() => setChatOpen(true)} className="px-6 py-3 rounded-md border">Try chatbot</button>
            </div>

            <div className="mt-8 text-sm text-gray-500 dark:text-gray-400">Trusted by regional companies across fintech, real estate, and healthcare.</div>
          </div>

          <div className="rounded-xl p-6 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 border shadow-sm">
            <div className="text-sm text-gray-500 dark:text-gray-400">Live demo — minimal simulated chat</div>
            <div className="mt-4 border rounded-md p-4 bg-white dark:bg-gray-800">
              <div className="text-xs text-gray-400">AISyncSo Assistant</div>
              <div className="mt-2 text-sm text-gray-700 dark:text-gray-200">Hi! Ask me about building a RAG chatbot, integrations, or pricing.</div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => void sendMessageToBot('How much does a basic chatbot cost?')} className="px-3 py-1 rounded border">Pricing</button>
                <button onClick={() => void sendMessageToBot('Can you integrate with Dropbox and Pinecone?')} className="px-3 py-1 rounded border">Integrations</button>
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

          <form onSubmit={(e) => { e.preventDefault(); alert('Thanks! This demo form won\'t send anywhere. Replace with a backend API.'); }} className="mt-4 grid sm:grid-cols-2 gap-4">
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
            <button type="submit" className="bg-indigo-600 text-white px-6 py-3 rounded-md sm:col-span-2">Request demo</button>
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
                {isLoading && (
                  <div className="max-w-[85%]">
                    <div className="inline-block p-2 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border">
                      <span className="inline-flex items-center gap-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
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
          <button onClick={() => setChatOpen(true)} aria-label="Open chat" className="bg-indigo-600 text-white p-3 rounded-full shadow-lg">Chat</button>
        )}
      </div>
    </div>
  )
}
