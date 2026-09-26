/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    // Expose to the browser so signup can reject non-UBC emails inline.
    NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS: process.env.ALLOWED_EMAIL_DOMAINS,
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
};

export default nextConfig;
