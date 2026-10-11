// Kotlin's String.isBlank()/ifBlank {}, which the ported code leans on.

export const isBlank = (s) => s.trim() === '';

export const ifBlank = (s, fallback) => (isBlank(s) ? fallback : s);
