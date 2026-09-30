/* File routes — mounted at /api/files */
'use strict';
const express = require('express');
const router = express.Router();
const c = require('../controllers/file.controller');

router.post('/', express.raw({ type: () => true, limit: '51mb' }), c.upload);
router.get('/:id', c.download);

module.exports = router;
