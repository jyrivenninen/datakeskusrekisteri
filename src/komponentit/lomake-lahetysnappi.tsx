"use client";

import { useFormStatus } from "react-dom";

export function LomakeLahetysNappi({
  valmis,
  odottaa,
}: {
  valmis: string;
  odottaa: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="rounded border border-foreground bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
    >
      {pending ? odottaa : valmis}
    </button>
  );
}
