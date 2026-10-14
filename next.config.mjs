/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@anthropic-ai/sdk"],
  // upload das imagens das landings (até 3 MB) passa por server action
  experimental: { serverActions: { bodySizeLimit: "4mb" } },
};

export default nextConfig;
