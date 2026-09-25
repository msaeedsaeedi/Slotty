"use client";

import { useEffect } from "react";

/** Pre-fill the timezone field with the browser's timezone. */
export function TimezoneDefault() {
  useEffect(() => {
    const input = document.getElementById("timezone") as HTMLInputElement | null;
    if (input && !input.value) input.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, []);
  return null;
}
