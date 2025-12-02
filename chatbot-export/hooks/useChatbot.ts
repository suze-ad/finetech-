import { useState, useRef, useCallback } from 'react'
import { generateSessionId, readSessionIdFromStorage, persistSessionId } from '../utils/session'

export type ChatMessage = { id: string; from: 'user' | 'bot'; text: string }
export type TimeSlot = { value: string; label: string }

export function useChatbot() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [formState, setFormState] = useState<{ isVisible: boolean; slots: TimeSlot[]; initialMessage: string }>({
    isVisible: false,
    slots: [],
    initialMessage: '',
  })
  const sessionIdRef = useRef<string | null>(null)

  function addMessage(from: ChatMessage['from'], text: string) {
    const m: ChatMessage = {
      id: String(Date.now()) + Math.random().toString(36).slice(2, 8),
      from,
      text,
    }
    setMessages(prev => [...prev, m])
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
        console.log('Rendering form with slots:', data.slots);
        
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

  function clearMessages() {
    setMessages([])
  }

  return {
    messages,
    isLoading,
    formState,
    sendMessageToBot,
    handleFormSubmission,
    clearMessages,
    ensureSessionId,
  }
}


