const CHATBOT_PROXY_URL = '/api/chatbot' // replace if your chat endpoint differs

const chatLog = document.getElementById('chat-log')
const chatInput = document.getElementById('chat-input')
const chatForm = document.getElementById('chat-input-form')

// Maintain session ID globally so both chat + meeting form share it
window.activeSessionId = window.activeSessionId || generateSessionId()

chatForm.addEventListener('submit', event => {
  event.preventDefault()
  const message = chatInput.value.trim()
  if (!message) return
  sendChatMessage(message)
})

function generateSessionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function addMessage(from, text) {
  const bubble = document.createElement('div')
  bubble.className = `chat-bubble ${from}`
  bubble.textContent = text
  chatLog.appendChild(bubble)
  chatLog.scrollTop = chatLog.scrollHeight
}

async function sendChatMessage(message, payload = {}) {
  if (message) {
    addMessage('user', message)
  }
  chatInput.value = ''

  try {
    const body = {
      message,
      session_id: window.activeSessionId,
      ...payload
    }

    const response = await fetch(CHATBOT_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      throw new Error(`Chatbot error: ${response.statusText}`)
    }

    const data = await response.json()
    return handleBotResponse(data)
  } catch (error) {
    console.error(error)
    addMessage('bot', 'Sorry, I could not reach the assistant. Please try again.')
  }
}

function handleBotResponse(response) {
  // 1. Process standard chat response text
  const reply =
    response?.output ||
    response?.reply ||
    response?.message ||
    response?.text

  if (reply) {
    addMessage('bot', reply)
  } else if (!response?.action) {
    addMessage('bot', 'I’m still thinking about that. Could you retry?')
  }

  // 2. Process special action: Show the form
  if ((response?.action === 'render_form' || response?.action === 'show_form')) {
    renderEmbeddedForm(response.slots, reply || "We're ready to schedule your call.")
  }

  // 3. Process final form confirmation
  if (response?.action === 'conversation_end') {
    // Optionally handle end of conversation UI updates
  }
  
  return response
}

function renderEmbeddedForm(slots, initialMessage) {
  const formContainer = document.createElement('div')
  formContainer.className = 'chat-bubble bot form-container'
  
  // Normalize slots to an array
  let finalSlots = [];
  let parsedSlots = slots;

  // Handle case where slots might be a JSON string
  if (typeof slots === 'string') {
    try {
      parsedSlots = JSON.parse(slots);
    } catch (e) {
      console.error('Failed to parse slots string:', e);
    }
  }
  
  if (Array.isArray(parsedSlots)) {
    // Check if elements are wrapped in { slot: ... }
    if (parsedSlots.length > 0 && parsedSlots[0].slot) {
       finalSlots = parsedSlots.map(item => {
          if (item.slot && item.slot.start) {
             return {
                value: item.slot.start,
                label: `${item.slot.startTimeDisplay} - ${item.slot.endTimeDisplay || ''}`
             };
          }
          return item;
       });
    } else {
       finalSlots = parsedSlots;
    }
  } else if (typeof parsedSlots === 'object' && parsedSlots !== null) {
    // Handle { slots: [...] } wrapper
    if (Array.isArray(parsedSlots.slots)) {
      finalSlots = parsedSlots.slots;
    } 
    // Handle single slot object { value: '...', label: '...' }
    else if (parsedSlots.value && parsedSlots.label) {
      finalSlots = [parsedSlots];
    }
    // Handle specific n8n structure: { period: '...', slot: { startTimeDisplay: '...', ... } }
    else if (parsedSlots.slot && typeof parsedSlots.slot === 'object') {
        const s = parsedSlots.slot;
        if (s.startTimeDisplay && s.start) {
          finalSlots = [{
              value: s.start, // Use ISO start time as value
              label: `${s.startTimeDisplay} - ${s.endTimeDisplay || ''}` // Display formatted time
          }];
        }
    }
    // Handle object map { 0: {...}, 1: {...} }
    else {
        const values = Object.values(parsedSlots);
        if (values.length > 0 && typeof values[0] === 'object' && values[0] !== null) {
          // Check if values look like slots
          if (values[0].value || (values[0].slot && values[0].slot.start)) {
             // If it's a map of n8n slot objects
             finalSlots = values.map(v => {
                 if (v.slot && v.slot.start) {
                     return {
                         value: v.slot.start,
                         label: `${v.slot.startTimeDisplay} - ${v.slot.endTimeDisplay || ''}`
                     };
                 }
                 return v;
             });
          } else {
             finalSlots = values;
          }
        }
    }
  }

  // Default slots if none provided
  const timeSlots = (finalSlots && finalSlots.length > 0) ? finalSlots : [
    { value: 'morning', label: 'Morning' },
    { value: 'afternoon', label: 'Afternoon' },
    { value: 'evening', label: 'Evening' }
  ];

  formContainer.innerHTML = `
    <div class="embedded-form">
      <p class="form-message">${initialMessage}</p>
      <form class="meeting-form-embedded">
        <input name="name" type="text" placeholder="Full Name" required class="form-input" />
        <input name="email" type="email" placeholder="Email Address" required class="form-input" />
        <input name="phone" type="tel" placeholder="Phone Number (Optional)" class="form-input" />
        <select name="preferred_time" required class="form-input">
          <option value="" disabled selected>Select a Preferred Time Slot</option>
          ${timeSlots.map(slot => `<option value="${slot.value}">${slot.label}</option>`).join('')}
        </select>
        <button type="submit" class="form-submit-btn">Confirm Meeting</button>
        <p class="form-error"></p>
      </form>
    </div>
  `

  const form = formContainer.querySelector('form')
  const submitBtn = formContainer.querySelector('button')
  const errorMsg = formContainer.querySelector('.form-error')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const formData = new FormData(form)
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      preferred_time: formData.get('preferred_time')
    }

    if (!data.name || !data.email || !data.preferred_time) {
      errorMsg.textContent = "Please fill in your Name, Email, and select a Time Slot."
      return
    }

    submitBtn.disabled = true
    submitBtn.textContent = "Booking..."
    errorMsg.textContent = ""

    try {
      // Send data to backend
      await fetch('/api/chatbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'form_submit',
          session_id: window.activeSessionId,
          formData: data
        })
      });

      // Remove the form completely
      formContainer.remove();

      // Append a confirmation bubble to chat
      addMessage('bot', `Thanks, ${data.name}! Your booking request was sent successfully.`);

    } catch (err) {
      submitBtn.disabled = false
      submitBtn.textContent = "Confirm Meeting"
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.'
      errorMsg.textContent = `Submission failed: ${errorMessage}. Please try again.`
    }
  })

  chatLog.appendChild(formContainer)
  chatLog.scrollTop = chatLog.scrollHeight
}

// Expose globally for chatbot hooks
window.renderEmbeddedForm = renderEmbeddedForm

// Demo helper: simulate n8n request (remove in production)
window.debugShowForm = function () {
  handleBotResponse({
    action: 'render_form',
    message: 'Can you share your contact details so I can arrange a meeting?',
    slots: [
        { value: '10:00', label: '10:00 AM' },
        { value: '14:00', label: '2:00 PM' }
    ]
  })
}

