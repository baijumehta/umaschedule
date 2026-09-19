"use client";

import { useState } from "react";

/**
 * One shared passphrase for the house. Not a login system, deliberately — but
 * the schedule says where a sixteen-year-old is every afternoon, so it does not
 * sit open on the internet either.
 */
export function Gate({ onSubmit, error, busy }: {
  onSubmit: (key: string) => void;
  error: string;
  busy: boolean;
}) {
  const [key, setKey] = useState("");

  return (
    <div className="gate">
      <div className="panel">
        <h3>Uma&rsquo;s Block Planner</h3>
        <p className="lede">Enter the household passphrase to open it.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) onSubmit(key.trim());
          }}
        >
          <div className="field">
            <label htmlFor="gate-key">Passphrase</label>
            <input
              id="gate-key" type="password" autoComplete="current-password"
              value={key} onChange={(e) => setKey(e.target.value)} autoFocus
            />
          </div>

          {error && <p className="status status-bad">{error}</p>}

          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={busy || !key.trim()}>
              {busy ? "Checking…" : "Open"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
