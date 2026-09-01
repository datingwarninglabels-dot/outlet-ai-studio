"use client";

// Only fires if the root layout itself throws (a much rarer case than
// error.tsx, which catches everything else) — Next.js requires this file
// to render its own <html>/<body> since it replaces the root layout
// entirely. Kept deliberately plain/inline-styled rather than depending on
// globals.css or the font setup, since whatever broke the root layout may
// have broken those too.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#0b0c10",
          color: "#f2f2f5",
        }}
      >
        <p style={{ fontSize: "0.875rem", color: "#5ec8b8" }}>Outlet AI Studio</p>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ fontSize: "0.875rem", color: "#9498a8", maxWidth: "24rem" }}>
          An unexpected error occurred loading the application. Please try again.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            height: "2.75rem",
            padding: "0 1.25rem",
            borderRadius: "0.5rem",
            background: "#5ec8b8",
            color: "#000",
            fontWeight: 500,
            border: "none",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
