import { useState, ChangeEvent, FormEvent } from 'react'
import PhoneInputField from './PhoneInput'

type TimeSlot = { value: string; label: string }
type SchedulingFormProps = {
  slots: TimeSlot[]
  onFormSubmit: (data: { name: string; email: string; phone?: string; preferred_time: string }) => Promise<void>
  initialMessage: string
}

export default function SchedulingForm({ slots, onFormSubmit, initialMessage }: SchedulingFormProps) {
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


