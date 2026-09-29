// eslint-disable-next-line @typescript-eslint/no-require-imports
const config = require('../../next.config.js');

async function main() {
  const hasOutput = Object.prototype.hasOwnProperty.call(config, 'output');
  const outputVal = config.output;
  const hasHeaders = typeof config.headers === 'function';
  const headersList = hasHeaders ? await config.headers() : [];
  const rootHeaderRule = headersList.find((h) => h.source === '/:path*');
  const headerKeys = rootHeaderRule ? rootHeaderRule.headers.map((h) => h.key) : [];
  const privateRule = headersList.find((h) => h.source && h.source.includes('checkout'));
  const robotsHeader = privateRule ? privateRule.headers.find((h) => h.key === 'X-Robots-Tag') : null;
  const remotePatterns = config.images?.remotePatterns || [];
  const hasRewrites = typeof config.rewrites === 'function';
  const rewritesList = hasRewrites ? await config.rewrites() : [];

  console.log(JSON.stringify({
    hasOutput,
    outputVal,
    headerKeys,
    hasRobotsHeader: !!robotsHeader,
    robotsHeaderValue: robotsHeader ? robotsHeader.value : null,
    remotePatternsCount: remotePatterns.length,
    hasRewrites,
    rewritesCount: rewritesList.length,
    rewritesSources: rewritesList.map((r) => r.source)
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
