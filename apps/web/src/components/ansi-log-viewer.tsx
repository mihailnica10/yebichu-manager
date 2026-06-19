"use client";
import { useMemo } from "react";
import Convert from "ansi-to-html";

const converter = new Convert({
  fg: "#4ade80",
  bg: "#000",
  newline: false,
  escapeXML: false,
  stream: false,
});

export function AnsiLogViewer({ text, className }: { text?: string; className?: string }) {
  const html = useMemo(() => {
    if (!text) return "";
    const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return converter.toHtml(escaped);
  }, [text]);

  if (!text) return null;

  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
