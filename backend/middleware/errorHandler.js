export default function errorHandler(error, req, res, next) {
  console.error(error);
  const status = error.code === 11000 ? 409 : error.status || 500;
  const message = error.code === 11000
    ? "That value is already in use."
    : error.status && error.message
      ? error.message
      : "Something went wrong. Please retry.";
  res.status(status).json({ message });
}
