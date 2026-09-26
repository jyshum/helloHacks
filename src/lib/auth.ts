const DEFAULT_DOMAINS = "student.ubc.ca,ubc.ca,alumni.ubc.ca";

export function allowedDomains(): string[] {
  const raw =
    process.env.ALLOWED_EMAIL_DOMAINS ??
    process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS ??
    DEFAULT_DOMAINS;
  return raw.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
}

export function isAllowedEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  return !!domain && allowedDomains().includes(domain);
}

export function isDevEnvironment(): boolean {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "").includes("localhost");
}

export const FACULTIES = [
  "Applied Science",
  "Arts",
  "Sauder School of Business",
  "Dentistry",
  "Education",
  "Forestry",
  "Kinesiology",
  "Land and Food Systems",
  "Law (Allard)",
  "Medicine",
  "Pharmaceutical Sciences",
  "Science",
  "Graduate Studies",
] as const;
