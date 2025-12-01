# Chatbot Integration Guide

This guide will help you integrate the chatbot code into your new project.

## 📦 What's Included

1. **API Route** (`api/chatbot/route.ts`) - Next.js API route that proxies requests to n8n
2. **Chatbot Hook** (`hooks/useChatbot.ts`) - React hook with all chatbot logic
3. **Form Component** (`components/SchedulingForm.tsx`) - Reusable form component
4. **Phone Input** (`components/PhoneInput.tsx`) - Phone number input with validation
5. **Session Utils** (`utils/session.ts`) - Session management utilities

## 🔄 Integration Steps

### Step 1: Copy Files

Copy all files from `chatbot-export/` to your project:

```
chatbot-export/
├── api/chatbot/route.ts          → src/app/api/chatbot/route.ts
├── components/
│   ├── PhoneInput.tsx            → src/components/PhoneInput.tsx
│   └── SchedulingForm.tsx        → src/components/SchedulingForm.tsx
├── hooks/useChatbot.ts           → src/hooks/useChatbot.ts
└── utils/session.ts              → src/utils/session.ts
```

### Step 2: Install Dependencies

```bash
npm install react-phone-number-input
```

### Step 3: Update Webhook URL

Edit `src/app/api/chatbot/route.ts`:

```typescript
// Line 17 - Update this URL to your n8n webhook
const res = await fetch("YOUR_N8N_WEBHOOK_URL", {
```

### Step 4: Create Chat UI Component

Create a new component (e.g., `src/components/Chatbot.tsx`):

```tsx
'use client'

import { useRef, useEffect } from 'react'
import { useChatbot } from '@/hooks/useChatbot'
import SchedulingForm from '@/components/SchedulingForm'

export default function Chatbot() {
  const {
    messages,
    isLoading,
    formState,
    sendMessageToBot,
    handleFormSubmission,
    clearMessages,
  } = useChatbot()
  
  const inputRef = useRef<HTMLInputElement>(null)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight
    }
  }, [messages, formState.isVisible])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const value = inputRef.current?.value?.trim()
    if (!value) return
    
    sendMessageToBot(value)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="w-96 max-w-full shadow-2xl rounded-xl overflow-hidden border bg-white dark:bg-gray-800">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b">
        <div className="font-semibold">Chat Assistant</div>
        <div className="flex gap-2">
          <button onClick={clearMessages} className="text-xs px-2 py-1 border rounded">
            Clear
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={chatScrollRef} className="p-4 h-64 overflow-y-auto bg-gray-50">
        {messages.length === 0 && (
          <div className="text-sm text-gray-500">Say hi to get started!</div>
        )}
        <div className="flex flex-col gap-3 mt-2">
          {messages.map(m => (
            <div
              key={m.id}
              className={`max-w-[85%] ${m.from === 'user' ? 'ml-auto text-right' : ''}`}
            >
              <div
                className={`inline-block p-2 rounded-md ${
                  m.from === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-800 border'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          
          {/* Form */}
          {formState.isVisible && (
            <div className="max-w-[85%]">
              <SchedulingForm
                slots={formState.slots}
                onFormSubmit={handleFormSubmission}
                initialMessage={formState.initialMessage}
              />
            </div>
          )}
          
          {/* Loading indicator */}
          {isLoading && (
            <div className="max-w-[85%]">
              <div className="inline-block p-2 rounded-md bg-white border">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-3 border-t bg-white">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="Type message..."
            className="flex-1 p-2 rounded border"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="px-3 py-1 rounded bg-indigo-600 text-white disabled:opacity-50"
            disabled={isLoading}
          >
            {isLoading ? '...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  )
}
```

### Step 5: Use in Your Page

```tsx
'use client'

import { useState } from 'react'
import Chatbot from '@/components/Chatbot'

export default function Home() {
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <div>
      {/* Your page content */}
      
      {/* Chatbot */}
      <div className="fixed right-6 bottom-6 z-50">
        {chatOpen ? (
          <Chatbot />
        ) : (
          <button
            onClick={() => setChatOpen(true)}
            className="bg-indigo-600 text-white p-3 rounded-full shadow-lg"
          >
            Chat
          </button>
        )}
      </div>
    </div>
  )
}
```

## 🎯 Key Features

### Session Management
- Sessions are automatically created and persisted in localStorage
- Session IDs are sent with every request for conversation continuity
- Sessions persist across page refreshes

### Message Handling
- Supports multiple response formats from n8n:
  - `{ reply: "..." }`
  - `{ message: "..." }`
  - `{ output: "..." }`
  - `{ response: "..." }`
  - `{ text: "..." }`

### Form Support
- Automatically detects form requests from n8n
- Supports dynamic time slots
- Handles various slot formats from n8n responses
- Form submissions are sent back to n8n with session ID

### Error Handling
- User-friendly error messages
- Specific guidance for n8n workflow issues
- Network error detection
- Graceful fallbacks

## 🔧 Customization

### Change Session Storage Key

Edit `src/utils/session.ts`:

```typescript
const SESSION_STORAGE_KEY = 'your-app:chat:session_id'
```

### Change Phone Input Default Country

Edit `src/components/PhoneInput.tsx`:

```typescript
defaultCountry="US" // Change to your country code
```

### Customize Form Fields

Edit `src/components/SchedulingForm.tsx` to add/remove fields:

```typescript
// Add new field
<input
  type="text"
  name="company"
  placeholder="Company Name"
  value={formData.company}
  onChange={handleInputChange}
/>
```

### Customize n8n Webhook Payload

Edit `src/hooks/useChatbot.ts` in the `sendMessageToBot` function to add custom fields:

```typescript
const payload = {
  type: 'chat',
  chatInput: userText,
  session_id: sessionId,
  sessionId,
  customField: 'custom value', // Add your custom fields
}
```

## 📡 n8n Webhook Setup

### Expected Request Format

Your n8n webhook will receive:

```json
{
  "type": "chat" | "form_submit",
  "chatInput": "User message",
  "message": "User message",
  "step": null,
  "sessionId": "session-uuid-here",
  "formData": {
    "name": "...",
    "email": "...",
    "phone": "...",
    "preferred_time": "..."
  }
}
```

### Expected Response Format

Your n8n webhook should return JSON:

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

**Important:** Your n8n workflow must end with a "Respond to Webhook" node that returns JSON.

## 🐛 Troubleshooting

### Chatbot not responding
1. Check browser console for errors
2. Verify n8n webhook URL is correct
3. Check n8n workflow is active
4. Ensure "Respond to Webhook" node exists

### Form not showing
1. Check n8n response includes `"action": "render_form"`
2. Verify slots format is correct
3. Check browser console for parsing errors

### Session not persisting
1. Check localStorage is enabled
2. Not in private/incognito mode
3. Check browser console for storage errors

## 📝 Notes

- All components are client-side only (`'use client'`)
- Session IDs use crypto.randomUUID() when available, fallback to timestamp-based IDs
- The chatbot supports conversation continuity through session IDs
- Error messages are user-friendly and include specific guidance
- CORS is handled automatically in the API route

## 🎨 Styling

The components use Tailwind CSS classes. If you're not using Tailwind, you'll need to:
1. Install Tailwind CSS, or
2. Replace Tailwind classes with your CSS framework, or
3. Add custom CSS classes

## ✅ Checklist

- [ ] Copied all files to your project
- [ ] Installed `react-phone-number-input`
- [ ] Updated n8n webhook URL in `route.ts`
- [ ] Created Chat UI component
- [ ] Integrated chatbot into your page
- [ ] Tested message sending
- [ ] Tested form rendering
- [ ] Tested session persistence
- [ ] Customized styling (if needed)
- [ ] Updated session storage key (if needed)


