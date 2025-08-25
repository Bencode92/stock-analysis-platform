// scripts/crypto-volatility-return.js
// npm i csv-parse axios
const fs = require('fs').promises;
const path = require('path');
const { parse } = require('csv-parse/sync');
const axios = require('axios');

const API_KEY = process.env.TWELVE_DATA_API_KEY;
if (!API_KEY) {
  console.error('❌ TWELVE_DATA_API_KEY manquante');
  process.exit(1);
}

const DATA_DIR = process.env.DATA_DIR || 'data';
const OUT_DIR  = process.env.OUTPUT_DIR || 'data/metrics';
const INPUT    = 