// Lets node resolve the extensionless relative imports the source uses, which
// a bundler would normally handle. Dev only, for scripts/render-card.mjs.

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$|\.json$|\.css$/.test(specifier)) {
    try {
      return await next(specifier + '.ts', context);
    } catch {
      // fall through to the normal resolver
    }
  }
  return next(specifier, context);
}
