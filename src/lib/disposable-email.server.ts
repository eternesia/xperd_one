import domains from "disposable-email-domains/index.json";
import wildcardDomains from "disposable-email-domains/wildcard.json";
import { normalizeEmail, validEmail } from "./qalling-signup-rules";

// Bundled locally: no signup email addresses are sent to a third-party lookup service.
const blockedDomains = new Set<string>(domains);
const blockedWildcardDomains = new Set<string>(wildcardDomains);

export function isDisposableEmail(email: string): boolean {
  const domain = normalizeEmail(email).split("@").pop() ?? "";
  if (blockedDomains.has(domain)) return true;
  const labels = domain.split(".");
  // Wildcard entries cover both the base domain and all its subdomains.
  for (let i = 0; i < labels.length - 1; i++) {
    if (blockedWildcardDomains.has(labels.slice(i).join("."))) return true;
  }
  return false;
}

export function assertRegistrationEmail(email: string): void {
  if (!validEmail(email)) throw new Error("Email tidak valid");
  if (isDisposableEmail(email)) {
    throw new Error(
      "Email sementara tidak diizinkan. Gunakan email pribadi atau perusahaan yang aktif.",
    );
  }
}
