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
      const res = await fetch("https://syncso.app.n8n.cloud/webhook/5eb7311a-c140-48e8-90b0-fef09f11473d", {
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
        }
        
        // Create a more helpful error message
        if (errorMessage.includes('No Respond to Webhook node')) {
          throw new Error('n8n workflow error: Your n8n workflow is missing a "Respond to Webhook" node. Please add one at the end of your workflow to return a response.')
        }
        
        throw new Error(`n8n webhook error (${res.status}): ${errorMessage || 'Unknown error'}`)
      }

      const rawBody = await res.text();
      
      if (!rawBody) {
        return {
          message: 'I received your request, but the automation did not send any reply. Please ensure your n8n workflow ends with a "Respond to Webhook" node that returns JSON.',
          warning: 'n8n webhook returned an empty response.',
          error: 'EMPTY_RESPONSE',
        }
      }

      try {
        return JSON.parse(rawBody);
      } catch {
        console.warn('n8n returned non-JSON response, forwarding as text:', rawBody);
        return {
          message: typeof rawBody === 'string' && rawBody.trim() ? rawBody : 'Your automation responded with non-JSON content. Please update the n8n "Respond to Webhook" node to return valid JSON.',
          warning: 'n8n webhook responded with non-JSON content. Returning raw text.',
          error: 'NON_JSON_RESPONSE',
        }
      }
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

    // Determine the appropriate status code
    let statusCode = 500
    if (message.includes('n8n workflow error')) {
      statusCode = 502 // Bad Gateway - workflow configuration issue
    } else if (message.includes('Failed to fetch') || message.includes('ECONNREFUSED')) {
      statusCode = 503 // Service Unavailable - can't reach n8n
    }
    
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
