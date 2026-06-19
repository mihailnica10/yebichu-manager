import { useState, useCallback } from "react";

export function useRandomPassword(length = 8): [string, () => void] {
  const [password, setPassword] = useState(() => generatePassword(length));

  const regenerate = useCallback(() => {
    setPassword(generatePassword(length));
  }, [length]);

  return [password, regenerate];
}

function generatePassword(length: number): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().slice(0, length);
  }
  return Math.random().toString(36).slice(2, length + 2);
}
