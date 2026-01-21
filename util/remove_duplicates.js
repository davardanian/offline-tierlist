#!/usr/bin/env node

/**
 * Utility script to remove duplicate restaurant entries from tierlist JSON files
 * 
 * Usage: node util/remove_duplicates.js
 * 
 * This script will:
 * 1. Load the tierlist JSON file
 * 2. Identify duplicate restaurants (same base name with different branch/location suffixes)
 * 3. Display all duplicates and let you specify which groups to skip
 * 4. Remove duplicates from all groups except skipped ones (keeping shortest name) and save the cleaned file
 * 
 * JSON Schema Documentation: See data/JSON_SCHEMA.md for structure details
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DEFAULT_FILE = 'restaurant_tierlist.json';

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask questions
function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

// Get file size in MB
function getFileSizeMB(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return (stats.size / (1024 * 1024)).toFixed(2);
  } catch (error) {
    return null;
  }
}

// Load JSON file using streams for better memory efficiency on large files
function loadJsonFile(filePath) {
  return new Promise((resolve, reject) => {
    // Check file size first
    const fileSizeMB = getFileSizeMB(filePath);
    if (fileSizeMB && parseFloat(fileSizeMB) > 50) {
      console.log(`⚠️  Warning: Large file detected (${fileSizeMB} MB). This may take a moment...`);
    }

    // Use stream for reading (though JSON.parse still needs full content)
    const chunks = [];
    const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
    
    stream.on('data', (chunk) => {
      chunks.push(chunk);
    });
    
    stream.on('end', () => {
      try {
        const content = chunks.join('');
        const parsed = JSON.parse(content);
        
        // Validate structure
        if (typeof parsed !== 'object' || parsed === null) {
          reject(new Error('Invalid JSON: root must be an object'));
          return;
        }
        
        if (!Array.isArray(parsed.rows)) {
          reject(new Error('Invalid JSON: "rows" must be an array'));
          return;
        }
        
        // Ensure untiered exists and is an array
        if (parsed.untiered !== undefined && !Array.isArray(parsed.untiered)) {
          reject(new Error('Invalid JSON: "untiered" must be an array if present'));
          return;
        }
        
        resolve(parsed);
      } catch (error) {
        if (error instanceof SyntaxError) {
          reject(new Error(`Invalid JSON syntax: ${error.message}`));
        } else {
          reject(new Error(`Error parsing JSON: ${error.message}`));
        }
      }
    });
    
    stream.on('error', (error) => {
      reject(new Error(`Error reading file: ${error.message}`));
    });
  });
}

// Save JSON file with optimized stringification
function saveJsonFile(filePath, data) {
  return new Promise((resolve, reject) => {
    try {
      const jsonString = JSON.stringify(data, null, 2);
      const writeStream = fs.createWriteStream(filePath, { encoding: 'utf8' });
      
      writeStream.on('error', (error) => {
        reject(new Error(`Error writing file: ${error.message}`));
      });
      
      writeStream.on('finish', () => {
        resolve();
      });
      
      writeStream.write(jsonString);
      writeStream.end();
    } catch (error) {
      reject(new Error(`Error saving JSON file: ${error.message}`));
    }
  });
}

// Normalize name for comparison (lowercase, trim)
function normalizeName(name) {
  return name.toLowerCase().trim();
}

// Check if two names are duplicates (one is substring of another)
function isDuplicate(name1, name2) {
  const norm1 = normalizeName(name1);
  const norm2 = normalizeName(name2);
  
  // Exact match
  if (norm1 === norm2) {
    return true;
  }
  
  // One is substring of another (but not both ways to avoid false positives)
  // Only consider it a duplicate if the shorter name is contained in the longer
  if (norm1.length < norm2.length) {
    return norm2.includes(norm1);
  } else if (norm2.length < norm1.length) {
    return norm1.includes(norm2);
  }
  
  return false;
}

// Collect all entries with their location information
function collectAllEntries(jsonData) {
  const entries = [];
  
  // Collect from tier rows
  jsonData.rows.forEach((row, rowIndex) => {
    if (Array.isArray(row.imgs)) {
      row.imgs.forEach((item, itemIndex) => {
        if (item && typeof item === 'object' && item.name) {
          entries.push({
            entry: item,
            location: {
              type: 'tier',
              tierName: row.name,
              rowIndex: rowIndex,
              itemIndex: itemIndex
            }
          });
        }
      });
    }
  });
  
  // Collect from untiered
  if (Array.isArray(jsonData.untiered)) {
    jsonData.untiered.forEach((item, itemIndex) => {
      if (item && typeof item === 'object' && item.name) {
        entries.push({
          entry: item,
          location: {
            type: 'untiered',
            itemIndex: itemIndex
          }
        });
      }
    });
  }
  
  return entries;
}

// Find duplicate groups using graph-based approach (connected components)
function findDuplicateGroups(entries) {
  const groups = [];
  const processed = new Set();
  
  for (let i = 0; i < entries.length; i++) {
    if (processed.has(i)) continue;
    
    const group = [entries[i]];
    processed.add(i);
    
    // Find all entries that are duplicates of any entry in this group
    let foundNew = true;
    while (foundNew) {
      foundNew = false;
      for (let j = 0; j < entries.length; j++) {
        if (processed.has(j)) continue;
        
        // Check if this entry is a duplicate of any entry in the current group
        for (const groupEntry of group) {
          if (isDuplicate(groupEntry.entry.name, entries[j].entry.name)) {
            group.push(entries[j]);
            processed.add(j);
            foundNew = true;
            break;
          }
        }
      }
    }
    
    // Only add groups with more than one entry (actual duplicates)
    if (group.length > 1) {
      groups.push(group);
    }
  }
  
  return groups;
}

// Select the entry with the shortest name from a group
function keepShortestEntry(group) {
  return group.reduce((shortest, current) => {
    return current.entry.name.length < shortest.entry.name.length ? current : shortest;
  });
}

// Display duplicate report
function displayDuplicateReport(duplicateGroups) {
  console.log('\n' + '='.repeat(80));
  console.log('DUPLICATE RESTAURANTS FOUND');
  console.log('='.repeat(80));
  console.log(`\nTotal duplicate groups: ${duplicateGroups.length}\n`);
  
  let totalDuplicates = 0;
  
  duplicateGroups.forEach((group, index) => {
    const kept = keepShortestEntry(group);
    const toRemove = group.filter(e => e !== kept);
    totalDuplicates += toRemove.length;
    
    console.log(`\nGroup ${index + 1}:`);
    console.log(`  ✓ KEEP: "${kept.entry.name}" (${kept.location.type === 'tier' ? `Tier ${kept.location.tierName}` : 'Untiered'})`);
    console.log(`  ✗ REMOVE:`);
    toRemove.forEach(entry => {
      const location = entry.location.type === 'tier' 
        ? `Tier ${entry.location.tierName}` 
        : 'Untiered';
      console.log(`    - "${entry.entry.name}" (${location})`);
    });
  });
  
  console.log('\n' + '='.repeat(80));
  console.log(`SUMMARY:`);
  console.log(`  - Duplicate groups found: ${duplicateGroups.length}`);
  console.log(`  - Total entries to remove: ${totalDuplicates}`);
  console.log('='.repeat(80) + '\n');
  
  return totalDuplicates;
}

// Parse group selection input (for groups to skip)
function parseGroupSelection(input, totalGroups) {
  const trimmed = input.trim().toLowerCase();
  
  if (trimmed === 'all' || trimmed === 'a') {
    return Array.from({ length: totalGroups }, (_, i) => i);
  }
  
  if (trimmed === 'none' || trimmed === 'n' || trimmed === '') {
    return [];
  }
  
  // Parse comma-separated or space-separated numbers
  const parts = trimmed.split(/[,\s]+/).filter(p => p.length > 0);
  const selected = new Set();
  
  for (const part of parts) {
    // Check for ranges like "1-5" or "1:5"
    if (part.includes('-') || part.includes(':')) {
      const rangeMatch = part.match(/(\d+)[-:](\d+)/);
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1]) - 1; // Convert to 0-based
        const end = parseInt(rangeMatch[2]) - 1;
        if (!isNaN(start) && !isNaN(end) && start >= 0 && end < totalGroups && start <= end) {
          for (let i = start; i <= end; i++) {
            selected.add(i);
          }
        }
      }
    } else {
      // Single number
      const num = parseInt(part) - 1; // Convert to 0-based
      if (!isNaN(num) && num >= 0 && num < totalGroups) {
        selected.add(num);
      }
    }
  }
  
  return Array.from(selected).sort((a, b) => a - b);
}

// Request groups to skip from user
async function requestGroupsToSkip(totalGroups) {
  console.log('\n' + '='.repeat(80));
  console.log('SELECT GROUPS TO SKIP');
  console.log('='.repeat(80));
  console.log('\nYou can specify groups to skip in the following ways:');
  console.log('  - Enter group numbers separated by commas: "1,3,5"');
  console.log('  - Enter a range: "1-5" or "1:5"');
  console.log('  - Enter "all" or "a" to skip all groups (process none)');
  console.log('  - Enter "none" or "n" or press Enter to process all groups\n');
  
  let skippedGroups = [];
  let validSelection = false;
  
  while (!validSelection) {
    const answer = await question(`Enter group numbers to skip (1-${totalGroups}), or press Enter for all: `);
    skippedGroups = parseGroupSelection(answer, totalGroups);
    validSelection = true;
  }
  
  return skippedGroups;
}

// Request user approval
async function requestApproval() {
  const answer = await question('Do you want to proceed with removing these duplicates? (y/n): ');
  return answer.toLowerCase().trim() === 'y' || answer.toLowerCase().trim() === 'yes';
}

// Create backup of the file
function createBackup(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const backupPath = `${filePath}.backup-${timestamp}`;
  
  try {
    fs.copyFileSync(filePath, backupPath);
    return backupPath;
  } catch (error) {
    throw new Error(`Failed to create backup: ${error.message}`);
  }
}

// Remove duplicates from JSON data
function removeDuplicatesFromTierlist(jsonData, duplicateGroups) {
  // Create a set of entries to remove (by reference or by creating a unique identifier)
  const entriesToRemove = new Set();
  
  duplicateGroups.forEach(group => {
    const kept = keepShortestEntry(group);
    group.forEach(entry => {
      if (entry !== kept) {
        // Create a unique identifier for this entry
        const id = entry.location.type === 'tier'
          ? `tier-${entry.location.rowIndex}-${entry.location.itemIndex}`
          : `untiered-${entry.location.itemIndex}`;
        entriesToRemove.add(id);
      }
    });
  });
  
  // Remove from tier rows (iterate backwards to maintain indices)
  jsonData.rows.forEach((row, rowIndex) => {
    if (Array.isArray(row.imgs)) {
      for (let i = row.imgs.length - 1; i >= 0; i--) {
        const id = `tier-${rowIndex}-${i}`;
        if (entriesToRemove.has(id)) {
          row.imgs.splice(i, 1);
        }
      }
    }
  });
  
  // Remove from untiered (iterate backwards to maintain indices)
  if (Array.isArray(jsonData.untiered)) {
    for (let i = jsonData.untiered.length - 1; i >= 0; i--) {
      const id = `untiered-${i}`;
      if (entriesToRemove.has(id)) {
        jsonData.untiered.splice(i, 1);
      }
    }
  }
  
  return jsonData;
}

// Count total entries
function countEntries(jsonData) {
  let count = 0;
  
  if (Array.isArray(jsonData.rows)) {
    jsonData.rows.forEach(row => {
      if (Array.isArray(row.imgs)) {
        count += row.imgs.length;
      }
    });
  }
  
  if (Array.isArray(jsonData.untiered)) {
    count += jsonData.untiered.length;
  }
  
  return count;
}

// Main function
async function main() {
  console.log('=== Remove Duplicate Restaurants ===\n');
  
  const filePath = path.join(DATA_DIR, DEFAULT_FILE);
  
  // Check if file exists
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  
  // Load JSON file
  console.log(`Loading ${DEFAULT_FILE}...`);
  let jsonData;
  try {
    jsonData = await loadJsonFile(filePath);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error('\nTip: Check data/JSON_SCHEMA.md for expected JSON structure');
    process.exit(1);
  }
  
  const initialCount = countEntries(jsonData);
  console.log(`Loaded ${initialCount} total restaurant entries.\n`);
  
  // Collect all entries
  console.log('Analyzing entries for duplicates...');
  const allEntries = collectAllEntries(jsonData);
  console.log(`Collected ${allEntries.length} entries.\n`);
  
  // Find duplicate groups
  console.log('Identifying duplicate groups...');
  const duplicateGroups = findDuplicateGroups(allEntries);
  
  if (duplicateGroups.length === 0) {
    console.log('✓ No duplicates found! The file is already clean.\n');
    rl.close();
    return;
  }
  
  // Display report
  const totalToRemove = displayDuplicateReport(duplicateGroups);
  
  // Request groups to skip
  const skippedGroupIndices = await requestGroupsToSkip(duplicateGroups.length);
  
  // Calculate which groups to process (all except skipped)
  const allGroupIndices = Array.from({ length: duplicateGroups.length }, (_, i) => i);
  const selectedGroupIndices = allGroupIndices.filter(idx => !skippedGroupIndices.includes(idx));
  
  if (selectedGroupIndices.length === 0) {
    console.log('\nAll groups skipped. Operation cancelled. No changes were made.\n');
    rl.close();
    return;
  }
  
  // Filter to only selected groups (all groups except skipped ones)
  const selectedGroups = selectedGroupIndices.map(idx => duplicateGroups[idx]);
  
  // Show which groups will be skipped
  if (skippedGroupIndices.length > 0) {
    console.log('\n' + '='.repeat(80));
    console.log('GROUPS TO SKIP');
    console.log('='.repeat(80));
    skippedGroupIndices.forEach(idx => {
      const group = duplicateGroups[idx];
      const kept = keepShortestEntry(group);
      console.log(`  Group ${idx + 1}: "${kept.entry.name}" (and ${group.length - 1} duplicates)`);
    });
    console.log('='.repeat(80));
  }
  
  // Calculate total to remove from selected groups
  let selectedTotalToRemove = 0;
  selectedGroups.forEach(group => {
    const kept = keepShortestEntry(group);
    const toRemove = group.filter(e => e !== kept);
    selectedTotalToRemove += toRemove.length;
  });
  
  // Display summary of selected groups
  console.log('\n' + '='.repeat(80));
  console.log('SELECTED GROUPS SUMMARY');
  console.log('='.repeat(80));
  selectedGroups.forEach((group, idx) => {
    const originalIndex = selectedGroupIndices[idx];
    const kept = keepShortestEntry(group);
    const toRemove = group.filter(e => e !== kept);
    console.log(`\nGroup ${originalIndex + 1} (selected):`);
    console.log(`  ✓ KEEP: "${kept.entry.name}"`);
    console.log(`  ✗ REMOVE: ${toRemove.length} entries`);
  });
  console.log('\n' + '='.repeat(80));
  console.log(`Total entries to remove: ${selectedTotalToRemove}`);
  console.log('='.repeat(80) + '\n');
  
  // Request approval
  const approved = await requestApproval();
  
  if (!approved) {
    console.log('\nOperation cancelled. No changes were made.\n');
    rl.close();
    return;
  }
  
  // Create backup
  console.log('\nCreating backup...');
  try {
    const backupPath = createBackup(filePath);
    console.log(`✓ Backup created: ${path.basename(backupPath)}\n`);
  } catch (error) {
    console.error(`⚠️  Warning: ${error.message}`);
    const continueAnswer = await question('Continue without backup? (y/n): ');
    if (continueAnswer.toLowerCase().trim() !== 'y' && continueAnswer.toLowerCase().trim() !== 'yes') {
      console.log('\nOperation cancelled.\n');
      rl.close();
      return;
    }
  }
  
  // Remove duplicates
  console.log('Removing duplicates...');
  const cleanedData = removeDuplicatesFromTierlist(jsonData, selectedGroups);
  
  // Save file
  console.log('Saving cleaned file...');
  try {
    await saveJsonFile(filePath, cleanedData);
    const finalCount = countEntries(cleanedData);
    const fileSizeMB = getFileSizeMB(filePath);
    
    console.log('\n' + '='.repeat(80));
    console.log('✓ SUCCESS!');
    console.log('='.repeat(80));
    console.log(`  - Entries before: ${initialCount}`);
    console.log(`  - Entries removed: ${selectedTotalToRemove}`);
    console.log(`  - Entries after: ${finalCount}`);
    if (fileSizeMB) {
      console.log(`  - File size: ${fileSizeMB} MB`);
    }
    console.log('='.repeat(80) + '\n');
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
  
  rl.close();
}

// Run the script
main().catch((error) => {
  console.error('Unexpected error:', error);
  rl.close();
  process.exit(1);
});
