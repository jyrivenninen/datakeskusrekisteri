import { SisaltoKaare } from "@/komponentit/sisalto-kaare";

export default function EiLoytynyt() {
  return (
    <main id="sisalto" className="sivuleveys flex-1 py-10">
      <SisaltoKaare>
        <h1 className="text-2xl font-semibold">Sivua ei löytynyt</h1>
        <p className="mt-3">
          <a href="/" className="text-link underline">
            Palaa etusivulle
          </a>
        </p>
      </SisaltoKaare>
    </main>
  );
}
