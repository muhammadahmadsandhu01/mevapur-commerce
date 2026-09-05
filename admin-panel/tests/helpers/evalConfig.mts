import config from '../../next.config.ts';

async function main() {
  const resolved = ((config as Record<string, unknown>).default || config) as Record<string, unknown>;
  const hasOutput = Object.prototype.hasOwnProperty.call(resolved, 'output');
  const outputVal = resolved.output;
  const hasHeaders = typeof resolved.headers === 'function';
  const headersList = hasHeaders ? await (resolved.headers as () => Promise<Array<{ source: string; headers: Array<{ key: string; value: string }> }>>) () : [];
  const rootHeaderRule = headersList.find((h: { source: string }) => h.source === '/:path*');
  const headerKeys = rootHeaderRule ? rootHeaderRule.headers.map((h: { key: string }) => h.key) : [];
  const imageUnoptimized = (resolved.images as { unoptimized?: boolean })?.unoptimized;
  const ignoreBuildErrors = (resolved.typescript as { ignoreBuildErrors?: boolean })?.ignoreBuildErrors;
  const serverMinification = (resolved.experimental as { serverMinification?: boolean })?.serverMinification;

  console.log(JSON.stringify({
    hasOutput,
    outputVal,
    headerKeys,
    imageUnoptimized,
    ignoreBuildErrors,
    serverMinification
  }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
