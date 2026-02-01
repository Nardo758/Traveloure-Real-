#!/usr/bin/env node
/**
 * Script to replace console.log with logger
 * This ensures production logs are environment-aware
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BASE_DIR = path.join(__dirname, 'attached_assets/traveloure_frontend/Traveloure-Frontend-main/src');

// Files that already have console.log properly wrapped or are special cases
const SKIP_FILES = [
  'lib/logger.js', // The logger itself
  'app/debug/page.jsx', // Debug page intentionally uses console
];

// Get all files with console.log
const getFilesWithConsoleLogs = () => {
  const result = execSync(
    `find ${BASE_DIR} -type f \\( -name "*.js" -o -name "*.jsx" -o -name "*.ts" -o -name "*.tsx" \\) -exec grep -l "console\\.log" {} \\;`,
    { encoding: 'utf-8' }
  );
  
  return result
    .trim()
    .split('\n')
    .filter(file => {
      const relativePath = path.relative(BASE_DIR, file);
      return !SKIP_FILES.some(skip => relativePath.includes(skip));
    });
};

// Check if file already imports logger
const hasLoggerImport = (content) => {
  return /import.*logger.*from.*['"].*logger/.test(content) ||
         /import.*{.*logger.*}.*from/.test(content);
};

// Add logger import to file
const addLoggerImport = (content, filePath) => {
  // Determine relative path to logger
  const fileDir = path.dirname(filePath);
  const loggerPath = path.join(BASE_DIR, 'lib/logger.js');
  let relativePath = path.relative(fileDir, loggerPath).replace(/\\/g, '/');
  
  if (!relativePath.startsWith('.')) {
    relativePath = './' + relativePath;
  }
  
  // Remove .js extension
  relativePath = relativePath.replace(/\.js$/, '');
  
  // Find the last import statement
  const lines = content.split('\n');
  let lastImportIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().startsWith('import ') || lines[i].trim().startsWith('} from ')) {
      lastImportIndex = i;
    }
  }
  
  const importStatement = `import logger from '${relativePath}'`;
  
  if (lastImportIndex >= 0) {
    lines.splice(lastImportIndex + 1, 0, importStatement);
  } else {
    // No imports found, add at top after any comments
    let insertIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].trim().startsWith('//') && 
          !lines[i].trim().startsWith('/*') && 
          !lines[i].trim().startsWith('*') &&
          lines[i].trim() !== '') {
        insertIndex = i;
        break;
      }
    }
    lines.splice(insertIndex, 0, importStatement);
  }
  
  return lines.join('\n');
};

// Replace console.log with logger
const replaceConsoleLogs = (content) => {
  // Replace console.log with logger.debug (development only)
  // Simple console.log calls
  content = content.replace(/console\.log\(/g, 'logger.debug(');
  
  // Replace console.error with logger.error
  content = content.replace(/console\.error\(/g, 'logger.error(');
  
  // Replace console.warn with logger.warn
  content = content.replace(/console\.warn\(/g, 'logger.warn(');
  
  // Replace console.info with logger.info
  content = content.replace(/console\.info\(/g, 'logger.info(');
  
  return content;
};

// Process a single file
const processFile = (filePath) => {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;
    
    // Check if file has console.log
    if (!content.includes('console.')) {
      return { processed: false, reason: 'No console statements' };
    }
    
    // Add logger import if not present
    if (!hasLoggerImport(content)) {
      content = addLoggerImport(content, filePath);
    }
    
    // Replace console.log with logger
    content = replaceConsoleLogs(content);
    
    // Only write if content changed
    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf-8');
      return { processed: true, reason: 'Replaced console.* with logger' };
    }
    
    return { processed: false, reason: 'No changes needed' };
  } catch (error) {
    return { processed: false, reason: `Error: ${error.message}` };
  }
};

// Main execution
const main = () => {
  console.log('🔍 Finding files with console.log...\n');
  
  const files = getFilesWithConsoleLogs();
  
  console.log(`Found ${files.length} files with console statements\n`);
  
  let processedCount = 0;
  let skippedCount = 0;
  
  files.forEach((file, index) => {
    const relativePath = path.relative(BASE_DIR, file);
    const result = processFile(file);
    
    if (result.processed) {
      console.log(`✅ [${index + 1}/${files.length}] ${relativePath}`);
      processedCount++;
    } else {
      console.log(`⏭️  [${index + 1}/${files.length}] ${relativePath} - ${result.reason}`);
      skippedCount++;
    }
  });
  
  console.log('\n📊 Summary:');
  console.log(`   Processed: ${processedCount} files`);
  console.log(`   Skipped: ${skippedCount} files`);
  console.log(`   Total: ${files.length} files`);
  console.log('\n✨ Done! All console.log statements have been replaced with logger.');
};

main();
