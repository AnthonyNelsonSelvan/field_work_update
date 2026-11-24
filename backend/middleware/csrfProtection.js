export default function csrfProtection(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const requestPath = req.originalUrl.split("?")[0];
  if (req.method === "POST" && requestPath === "/api/auth/login") return next();

  if (!req.cookies?.csrfToken || req.cookies.csrfToken !== req.get("x-csrf-token")) {
    return res.status(403).json({
      message: "Security token missing. Refresh and retry.",
    });
  }
  next();
}
