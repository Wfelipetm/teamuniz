/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  sw: 'sw.js',
});

const nextConfig = {
  reactStrictMode: true,
  env: {
    REACT_APP_BACKEND_URL: process.env.REACT_APP_BACKEND_URL,
    REACT_APP_HOURS_CLOSE_TICKETS_AUTO: process.env.REACT_APP_HOURS_CLOSE_TICKETS_AUTO,
  },
};
module.exports = withPWA(nextConfig);
