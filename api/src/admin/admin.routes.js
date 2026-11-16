const express = require('express');
const { requireAuth, requireRole } = require('../auth/guards');
const {
  validateListQuery,
  validateCandidateId
} = require('./admin.validation');
const {
  validateListUnknownSkillsQuery,
  validateUnknownSkillId,
  validateSearchSkillsQuery
} = require('./unknown-skills.validation');
const { listCandidates, getCandidateProfile } = require('./candidates.service');
const { getCandidateHistory } = require('./history.service');
const {
  listUnknownSkills,
  getUnknownSkillById,
  searchSkills
} = require('./unknown-skills.service');

/**
 * Creates the admin router mounted at /api/admin.
 *
 * @param {object} deps
 * @param {() => object} deps.getDb - returns the pg Pool
 * @returns {express.Router}
 */
function createAdminRouter({ getDb }) {
  const router = express.Router();

  router.use(requireAuth, requireRole('admin'));

  router.get('/candidates', async (req, res, next) => {
    const validation = validateListQuery(req.query);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const result = await listCandidates(getDb(), validation.data);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/candidates/:id', async (req, res, next) => {
    const validation = validateCandidateId(req.params.id);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const result = await getCandidateProfile(getDb(), validation.data);
      if (!result) {
        return res
          .status(404)
          .json({ errors: { candidateId: 'Candidate not found' } });
      }
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/candidates/:id/history', async (req, res, next) => {
    const validation = validateCandidateId(req.params.id);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const result = await getCandidateHistory(getDb(), validation.data);
      if (!result) {
        return res
          .status(404)
          .json({ errors: { candidateId: 'Candidate not found' } });
      }
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/unknown-skills', async (req, res, next) => {
    const validation = validateListUnknownSkillsQuery(req.query);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const result = await listUnknownSkills(getDb(), validation.data);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/unknown-skills/:id', async (req, res, next) => {
    const validation = validateUnknownSkillId(req.params.id);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const result = await getUnknownSkillById(getDb(), validation.data);
      if (!result) {
        return res
          .status(404)
          .json({ errors: { unknownSkillId: 'Unknown skill not found' } });
      }
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  router.get('/skills/search', async (req, res, next) => {
    const validation = validateSearchSkillsQuery(req.query);
    if (!validation.success) {
      return res.status(400).json({ errors: validation.errors });
    }

    try {
      const result = await searchSkills(getDb(), validation.data);
      return res.status(200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

module.exports = { createAdminRouter };
