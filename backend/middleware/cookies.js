const parseCookies = (req, res, next) => {
  const cookies = Object.create(null);
  const header = req.headers.cookie;

  if (typeof header === 'string') {
    header.split(';').forEach((pair) => {
      const separator = pair.indexOf('=');
      if (separator <= 0) return;

      const name = pair.slice(0, separator).trim();
      const rawValue = pair.slice(separator + 1).trim();
      if (!name) return;

      try {
        cookies[name] = decodeURIComponent(rawValue);
      } catch {
        cookies[name] = rawValue;
      }
    });
  }

  req.cookies = cookies;
  next();
};

module.exports = parseCookies;
