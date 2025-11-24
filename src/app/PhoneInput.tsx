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
