"use client";

import { useState } from "react";
import { FormField } from "@/components/form-field";
import { Input } from "@/components/ui/input";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password-policy";

const MISMATCH = "Passwords don't match.";

/**
 * New password and its confirmation. The mismatch shows next to the confirmation as soon as both
 * are filled in, and the browser won't submit until they match (the server checks again).
 */
export function PasswordFields() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm !== "" && password !== confirm ? MISMATCH : undefined;
  return (
    <>
      <FormField name="password" label="New password" hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </FormField>
      <FormField name="confirm" label="Confirm password" error={mismatch}>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            e.target.setCustomValidity(e.target.value && e.target.value !== password ? MISMATCH : "");
          }}
          ref={(el) => el?.setCustomValidity(confirm && confirm !== password ? MISMATCH : "")}
        />
      </FormField>
    </>
  );
}
