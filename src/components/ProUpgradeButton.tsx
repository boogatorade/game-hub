"use client";

import { useState } from "react";

export function ProUpgradeButton({ label = "Coming Soon" }: { label?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-fuchsia-400 px-4 py-2 font-semibold text-zinc-950 hover:bg-fuchsia-300"
      >
        {label}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 px-5">
          <div className="w-full max-w-sm rounded-lg border border-white/10 bg-zinc-950 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white">Pro plan</h2>
            <p className="mt-3 text-zinc-300">Pro plan - Coming soon!</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 rounded-md border border-white/15 px-4 py-2 font-semibold text-white hover:border-white/35"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
