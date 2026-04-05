/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    // Disabled during builds only in development — enable for production
    // Warning: This should be enabled in CI/CD for quality assurance
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;