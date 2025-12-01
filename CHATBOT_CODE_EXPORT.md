

## 1. API Route - Webhook Handler

**File:** `src/app/api/chatbot/route.ts`

This file handles all requests to the chatbot API and proxies them to the n8n webhook.

```typescript
import { NextRequest, NextResponse } from 'next/server'

type N8NRequestPayload = {
  chatInput: string
  step: unknown
  sessionId: string | null
  type?: string
  formData?: Record<string, unknown> | null
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Helper function to send message to n8n webhook
    async function sendMessageToN8N({ chatInput, step, sessionId, type, formData }: N8NRequestPayload) {
      const res = await fetch("https://syncso.app.n8n.cloud/webhook/chatbot", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: type || 'chat',
          chatInput,
          message: chatInput,
          step: step || null,
          sessionId: sessionId,
          formData: formData || null,
        }),
      });

      if (!res.ok) {
        // Try to parse error response as JSON first
        let errorMessage = ''
        try {
          const errorData = await res.json()
          errorMessage = errorData.message || errorData.error || JSON.stringify(errorData)
        } catch {
          // If not JSON, get as text
          errorMessage = await res.text().catch(() => '')
        
        throw new Error(`n8n webhook error (${res.status}): ${errorMessage || 'Unknown error'}`)
      }

      const rawBody = await res.text();
    
    }
    
    // Extract parameters from request body
    const chatInput: string | undefined = body.chatInput || body.message || body.userMessage
    const step = body.step || null
    const sessionId = body.session_id || body.sessionId
    const payloadType = typeof body.type === 'string' ? body.type : undefined
    const formData = body.formData || null

    if (!chatInput) {
      return NextResponse.json(
        { 
          error: 'Missing message',
          message: 'The message field is required'
        },
        { status: 400 }
      )
    }

    // Call the n8n webhook
    const response = await sendMessageToN8N({
      chatInput,
      step,
      sessionId: sessionId || null,
      type: payloadType,
      formData,
    })

    // Return the response with proper CORS headers
    // Support both { reply, step } and { response, message, text } formats
    return NextResponse.json(response, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  } catch (error: unknown) {
    console.error('Error proxying request to n8n:', error)
    
    const message = error instanceof Error ? error.message : 'An error occurred while processing your request'

    
    return NextResponse.json(
      { 
        error: 'Webhook error',
        message
      },
      { status: statusCode }
    )
  }
}

// Handle OPTIONS request for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
```

---

## 2. Session Management Utilities

**Location:** Can be extracted from `src/app/page.tsx` or created as a separate utility file.

```typescript
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
```

---

## 3. Chatbot Core Logic (Message Handling)

**Location:** Extracted from `src/app/page.tsx`

```typescript
type ChatMessage = { id: string; from: 'user' | 'bot'; text: string }
type TimeSlot = { value: string; label: string }

// State management
const [messages, setMessages] = useState<ChatMessage[]>([])
const [isLoading, setIsLoading] = useState(false)
const [formState, setFormState] = useState<{ isVisible: boolean; slots: TimeSlot[]; initialMessage: string }>({
  isVisible: false,
  slots: [],
  initialMessage: '',
})
const sessionIdRef = useRef<string | null>(null)

// Helper to add messages
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

// Session ID management
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

// Main message sending function
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
  
```

---

## 4. Form Component

**File:** `src/app/SchedulingForm.tsx` (or similar)

```typescript
import { useState, ChangeEvent, FormEvent } from 'react'
import PhoneInputField from './PhoneInput'

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

export default SchedulingForm
```

---

## 5. Phone Input Component

**File:** `src/app/PhoneInput.tsx`

```typescript
"use client";

import { forwardRef, useState, type InputHTMLAttributes } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";

interface PhoneInputFieldProps {
  onChange?: (value: string | undefined) => void
}

const StyledPhoneInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  (props, ref) => (
    <input
      {...props}
      ref={ref}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      className="flex-1 px-3 py-2 focus:outline-none"
    />
  )
);
StyledPhoneInput.displayName = "StyledPhoneInput";

export default function PhoneInputField({ onChange }: PhoneInputFieldProps) {
  const [value, setValue] = useState<string | undefined>(undefined);

  return (
    <div className="w-full">
      <PhoneInput
        international
        defaultCountry="QA"
        value={value}
        onChange={(v) => {
          setValue(v);
          if (onChange) onChange(v);
        }}
        className="flex w-full border border-gray-300 rounded-md overflow-hidden"
        inputComponent={StyledPhoneInput}
      />

      {!isValidPhoneNumber(value || "") && value && (
        <p className="text-red-500 text-sm mt-1">
          Invalid phone number
        </p>
      )}
    </div>
  );
}
```

---

## 6. Form Submission Handler

**Location:** Extracted from `src/app/page.tsx`

```typescript
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
```

---

## 7. Chat UI Component (JSX)

**Location:** Extracted from `src/app/page.tsx`

```tsx
clear button
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


```

---

## 8. Chat Submit Handler

```typescript
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
```

---

## Dependencies

Make sure to install these packages:

```bash
npm install react-phone-number-input
```

---

## Configuration

1. **Update n8n Webhook URL**: In `src/app/api/chatbot/route.ts`, change the webhook URL:
   ```typescript
   const res = await fetch("YOUR_N8N_WEBHOOK_URL", {
   ```

2. **Session Storage Key**: Update the session storage key if needed:
   ```typescript
   const SESSION_STORAGE_KEY = 'your-app:chat:session_id'
   ```

3. **Phone Input Default Country**: In `PhoneInput.tsx`, change the default country:
   ```typescript
   defaultCountry="QA" // Change to your default country code
   ```

---

## n8n Webhook Expected Format

The n8n webhook should return JSON in one of these formats:

```json
{
  "reply": "Bot response message",
  "action": "render_form", // optional
  "slots": [ // optional, for forms
    { "value": "morning", "label": "Morning" },
    { "value": "afternoon", "label": "Afternoon" }
  ]
}
```

Or:

```json
{
  "message": "Bot response message",
  "output": "Alternative response field",
  "response": "Another alternative"
}
```

The webhook receives:
```json
{
  "type": "chat" | "form_submit",
  "chatInput": "User message",
  "message": "User message",
  "step": null,
  "sessionId": "session-uuid",
  "formData": { ... } // if form submission
}
```