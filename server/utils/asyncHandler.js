// Async handler utility.
// Wraps async Express handlers and forwards thrown errors to the central error
// middleware instead of leaving requests unresolved.
function handleAsync(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { handleAsync };
