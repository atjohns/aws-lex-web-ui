#!/usr/bin/env node

/**
 * Post-build script to handle CSS file naming for library builds
 * This script copies the generated CSS file to the correct name based on build mode
 * and adds banner comments to CSS files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV?.trim() === 'production';
const bundleDir = path.join(__dirname, '..', 'dist', 'bundle');
const cssFileName = isProd ? 'lex-web-ui.min.css' : 'lex-web-ui.css';
const sourceCssFile = path.join(bundleDir, cssFileName);
const fallbackCssFile = path.join(bundleDir, 'lex-web-ui.css');

// Only run for library builds
if (process.env.BUILD_TARGET?.trim() !== 'lib') {
  console.log(`Skipping CSS post-processing for non-library build (BUILD_TARGET: '${process.env.BUILD_TARGET}')`);
  process.exit(0);
}

// Check if source CSS file exists
if (!fs.existsSync(sourceCssFile)) {
  if (isProd && fs.existsSync(fallbackCssFile)) {
    fs.renameSync(fallbackCssFile, sourceCssFile);
    console.log(`✓ Renamed ${path.basename(fallbackCssFile)} to ${path.basename(sourceCssFile)}`);
  } else {
    console.error('Source CSS file not found:', sourceCssFile);
    process.exit(1);
  }
}

/**
 * Creates a banner comment string from package information
 * @returns {string} Banner comment string
 */
function createBanner() {
  const packageJsonPath = path.join(__dirname, '..', 'package.json');
  const packageInfo = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const currentYear = new Date().getFullYear();
  const buildDate = new Date().toISOString().split('T')[0];
  
  return `/*!
 * ${packageInfo.name || 'Unknown Package'} v${packageInfo.version || '0.0.0'}
 * ${packageInfo.description || ''}
 * 
 * Copyright (c) ${currentYear} ${packageInfo.author || 'Unknown Author'}
 * Licensed under ${packageInfo.license || 'Unknown License'}
 * 
 * Built on: ${buildDate}
 */`;
}

/**
 * Adds banner to CSS file if it doesn't already have one
 * @param {string} filePath - Path to the CSS file
 */
function addBannerToCssFile(filePath) {
  const banner = createBanner();
  const cssContent = fs.readFileSync(filePath, 'utf8');
  
  // Check if banner is already present
  if (!cssContent.startsWith('/*!')) {
    const newContent = banner + '\n' + cssContent;
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`✓ Added banner to ${path.basename(filePath)}`);
  } else {
    console.log(`✓ Banner already present in ${path.basename(filePath)}`);
  }
}

// Add banner to the CSS file
addBannerToCssFile(sourceCssFile);

console.log(`✓ CSS file processed: ${path.basename(sourceCssFile)}`);