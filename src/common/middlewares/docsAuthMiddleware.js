const docsAuthMiddleware = (req, res, next) => {
  const docsUser = process.env.SWAGGER_USER;
  const docsPass = process.env.SWAGGER_PASS;
  const docsToken = process.env.SWAGGER_BEARER_TOKEN;

  // If no docs credentials are configured, block docs in non-development.
  if (!docsUser && !docsPass && !docsToken) {
    if (process.env.NODE_ENV === 'development') return next();
    return res.status(403).json({ success: false, message: 'API docs are disabled.' });
  }

  const authHeader = req.headers.authorization || '';

  // Bearer token mode (preferred for CI/review links).
  if (docsToken) {
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (token === docsToken) return next();
  }

  // Basic auth mode.
  if (docsUser && docsPass) {
    const basic = authHeader.startsWith('Basic ') ? authHeader.slice(6).trim() : '';
    if (basic) {
      try {
        const decoded = Buffer.from(basic, 'base64').toString('utf8');
        const sep = decoded.indexOf(':');
        const user = sep >= 0 ? decoded.slice(0, sep) : '';
        const pass = sep >= 0 ? decoded.slice(sep + 1) : '';
        if (user === docsUser && pass === docsPass) return next();
      } catch (_) {
        // fall through
      }
    }
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Buuttii API Docs"');
  return res.status(401).json({ success: false, message: 'Unauthorized for API docs.' });
};

module.exports = docsAuthMiddleware;
