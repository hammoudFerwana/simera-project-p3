/**
 * Shared upload middleware and responses, used by the candidate uploads
 * (POST /api/uploads/:sourceType) and the Simera upload
 * (POST /api/admin/simera-files).
 */
const multer = require('multer');
const { MAX_FILE_SIZE_BYTES } = require('shared/src/upload/upload.config');
const { uploadErrors } = require('shared/src/upload/upload.service');

const FILE_FIELD = 'file';

/** Sends a rejection as { errors: { file: message }, reason, ...details }. */
function sendUploadError(res, error) {
  return res.status(error.status).json({
    errors: { [error.field]: error.message },
    reason: error.reason,
    ...error.details
  });
}

function sendFileFieldError(res, message) {
  return res.status(400).json({ errors: { [FILE_FIELD]: message } });
}

// Kept in memory (at most 10 MB): the checks run before anything is written,
// so a rejected file never touches the disk.
const parseSingleFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  // Browsers send the file name as UTF-8.
  defParamCharset: 'utf8'
}).single(FILE_FIELD);

/** Runs Multer and turns its errors into upload responses. */
function receiveFile(req, res, next) {
  parseSingleFile(req, res, (error) => {
    if (!error) {
      return next();
    }
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return sendUploadError(res, uploadErrors.fileTooLarge());
      }
      if (
        error.code === 'LIMIT_FILE_COUNT' ||
        error.code === 'LIMIT_UNEXPECTED_FILE'
      ) {
        return sendFileFieldError(
          res,
          `Upload exactly one file in the "${FILE_FIELD}" field`
        );
      }
    }
    // Multer only parses the request here, so any other error is a malformed
    // multipart body.
    return res
      .status(400)
      .json({ errors: { body: 'The upload request is malformed' } });
  });
}

module.exports = {
  FILE_FIELD,
  receiveFile,
  sendFileFieldError,
  sendUploadError
};
