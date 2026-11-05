/** @type {import('next').NextConfig} */
export default {
  output: "export",          // plain static HTML/JS in out/, no server needed
  trailingSlash: true,       // /method/ works on any static file server
  images: { unoptimized: true },
};
