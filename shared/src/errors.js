class TemporaryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TemporaryError';
  }
}

class PermanentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PermanentError';
  }
}

module.exports = { TemporaryError, PermanentError };
