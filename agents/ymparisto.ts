import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Lataa .env.local jos avainta ei ole jo ympäristössä. Ei tulosta arvoja. */
export function lataaPaikallinenYmparisto() {
  const polku = resolve(process.cwd(), ".env.local");
  if (!existsSync(polku)) return;
  for (const rivi of readFileSync(polku, "utf8").split("\n")) {
    const leikattu0 = rivi.trim();
    if (!leikattu0 || leikattu0.startsWith("#")) continue;
    const leikattu = leikattu0.startsWith("export ")
      ? leikattu0.slice(7).trim()
      : leikattu0;
    const i = leikattu.indexOf("=");
    if (i < 1) continue;
    const avain = leikattu.slice(0, i).trim();
    let arvo = leikattu.slice(i + 1).trim();
    if (
      (arvo.startsWith('"') && arvo.endsWith('"')) ||
      (arvo.startsWith("'") && arvo.endsWith("'"))
    ) {
      arvo = arvo.slice(1, -1);
    }
    if (process.env[avain] == null || process.env[avain] === "") {
      process.env[avain] = arvo;
    }
  }
}
