
const express = require('express');
const {
  requireAuth,
  requireRole,
  requireVerifiedCandidate
} = require('../auth/guards');

function mapStatus(status) {
  switch (status) {
    case 'queued':
    case 'processing':
      return 'Processing';

    case 'completed':
    case 'completed_with_review':
      return 'Completed';

    case 'failed':
      return 'Failed';

    default:
      return 'Processing';
  }
}

function getFailureMessage(reason) {
  const normalizedReason = String(reason || '').toLowerCase();

  if (/email.*mismatch|mismatch.*email|email.*does not match/.test(normalizedReason)) {
    return "The email in your uploaded file doesn't match your account email.";
  }

  if (/empty text|no readable text|no text/.test(normalizedReason)) {
    return "We couldn't extract readable text from this file.";
  }

  if (/llm|language model/.test(normalizedReason)) {
    return "We couldn't process your file. Please try again.";
  }

  return "We couldn't process your file due to an unexpected error.";
}

function createCandidateRouter({ getDb }) {
  const router = express.Router();

  router.get(
    '/files',
    requireAuth,
    requireRole('candidate'),
    requireVerifiedCandidate(getDb),
    async (req, res, next) => {
      try {
        const result = await getDb().query(
          `SELECT
             f.id,
             f.original_filename,
             f.source_type,
             f.uploaded_at,
             j.status,
             j.failure_reason
           FROM uploaded_files f
           INNER JOIN processing_jobs j ON j.file_id = f.id
           WHERE f.candidate_id = $1
             AND f.source_type IN ('cv', 'linkedin')
           ORDER BY f.uploaded_at DESC`,
          [req.candidate.id]
        );

        const files = result.rows.map((row) => {
          const status = mapStatus(row.status);

          return {
            id: row.id,
            name: row.original_filename,
            type: row.source_type,
            uploadedAt: row.uploaded_at,
            status,
            message:
              status === 'Failed'
                ? `${getFailureMessage(row.failure_reason)} Upload an updated file to try again.`
                : null
          };
        });

        return res.status(200).json({ files });
      } catch (error) {
        return next(error);
      }
    }
  );

  return router;
}

module.exports = {
  createCandidateRouter,
  mapStatus,
  getFailureMessage
};
