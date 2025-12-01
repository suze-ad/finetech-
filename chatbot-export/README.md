# Chatbot Code Export

This folder contains all the chatbot logic extracted from the AISyncSo landing page, ready to be integrated into another project.

## 📁 Folder Structure

```
chatbot-export/
├── api/
│   └── chatbot/
│       └── route.ts          # Next.js API route for n8n webhook proxy
├── components/
│   ├── PhoneInput.tsx        # Phone number input component
│   └── SchedulingForm.tsx    # Form component for scheduling/bookings
├── hooks/
│   └── useChatbot.ts         # React hook with all chatbot logic
├── utils/
│   └── session.ts            # Session management utilities
└── README.md                 # This file
```

## 🚀 Quick Start

### 1. Copy Files to Your Project

Copy the files to your Next.js project maintaining the same structure:

```
your-project/
├── src/
│   ├── app/
│   │   └── api/
│   │       └── chatbot/
│   │           └── route.ts          # Copy from chatbot-export/api/chatbot/route.ts
│   ├── components/
│   │   ├── PhoneInput.tsx            # Copy from chatbot-export/components/PhoneInput.tsx
│   │   └── SchedulingForm.tsx       # Copy from chatbot-export/components/SchedulingForm.tsx
│   ├── hooks/
│   │   └── useChatbot.ts            # Copy from chatbot-export/hooks/useChatbot.ts
│   └── utils/
│       └── session.ts               # Copy from chatbot-export/utils/session.ts
```

### 2. Install Dependencies

```bash
npm install react-phone-number-input
```

### 3. Configure n8n Webhook URL

Edit `src/app/api/chatbot/route.ts` and update the webhook URL:

```typescript
const res = await fetch("YOUR_N8N_WEBHOOK_URL", {
```

### 4. Use in Your Component

```tsx
'use client'

import { useChatbot } from '@/hooks/useChatbot'
import SchedulingForm from '@/components/SchedulingForm'

export default function YourPage() {
  const {
    messages,
    isLoading,
    formState,
    sendMessageToBot,
    handleFormSubmission,
    clearMessages,
  } = useChatbot()

  // Your UI code here
  return (
    <div>
      {/* Chat UI */}
      {messages.map(m => (
        <div key={m.id}>{m.text}</div>
      ))}
      
      {/* Form */}
      {formState.isVisible && (
        <SchedulingForm
          slots={formState.slots}
          onFormSubmit={handleFormSubmission}
          initialMessage={formState.initialMessage}
        />
      )}
      
      {/* Input */}
      <input
        onKeyPress={(e) => {
          if (e.key === 'Enter') {
            sendMessageToBot(e.currentTarget.value)
            e.currentTarget.value = ''
          }
        }}
      />
    </div>
  )
}
```

## 📋 Features

- ✅ **n8n Webhook Integration**: Full integration with n8n webhooks
- ✅ **Session Management**: Persistent session IDs using localStorage
- ✅ **Message Handling**: Support for multiple response formats
- ✅ **Form Support**: Dynamic form rendering based on n8n responses
- ✅ **Error Handling**: Comprehensive error handling with user-friendly messages
- ✅ **CORS Support**: Built-in CORS headers for cross-origin requests
- ✅ **TypeScript**: Fully typed for better developer experience

## 🔧 Configuration

### Session Storage Key

Edit `utils/session.ts` to change the session storage key:

```typescript
const SESSION_STORAGE_KEY = 'your-app:chat:session_id'
```

### Phone Input Default Country

Edit `components/PhoneInput.tsx`:

```typescript
defaultCountry="QA" // Change to your default country code
```

## 📡 n8n Webhook Format

### Request Format

Your n8n webhook will receive:

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

### Response Format

Your n8n webhook should return JSON in one of these formats:

```json
{
  "reply": "Bot response message",
  "action": "render_form", // optional: "render_form" | "show_form" | "conversation_end"
  "slots": [ // optional, for forms
    { "value": "morning", "label": "Morning" },
    { "value": "afternoon", "label": "Afternoon" }
  ]
}
```

Or alternative formats:

```json
{
  "message": "Bot response message",
  "output": "Alternative response field",
  "response": "Another alternative"
}
```

## 🎨 Customization

### Form Component

The `SchedulingForm` component can be customized for different use cases. Modify `components/SchedulingForm.tsx` to change:
- Form fields
- Validation rules
- Styling
- Submit behavior

### Chat UI

The chat UI is not included in this export. You'll need to build your own UI using the `useChatbot` hook. See the example above for a basic implementation.

## 📝 Notes

- Session IDs are automatically generated and persisted in localStorage
- The chatbot supports conversation continuity through session IDs
- Error messages are user-friendly and include specific guidance for n8n workflow issues
- The form component is flexible and can be adapted for different use cases
- All components are client-side only (`'use client'`)

## 🐛 Troubleshooting

### n8n Webhook Not Responding

1. Check that your n8n workflow has a "Respond to Webhook" node at the end
2. Ensure the webhook URL in `route.ts` is correct
3. Check n8n workflow logs for errors

### Session Not Persisting

1. Check browser console for localStorage errors
2. Ensure you're not in private/incognito mode
3. Check that localStorage is enabled in browser settings

### Form Not Showing

1. Ensure your n8n response includes `"action": "render_form"` or `"action": "show_form"`
2. Check that slots are in the correct format (array of `{ value, label }`)
3. Check browser console for parsing errors

## 📄 License

This code is extracted from the AISyncSo landing page project.


