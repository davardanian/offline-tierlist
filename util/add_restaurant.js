#!/usr/bin/env node

/**
 * Utility script to add restaurants to tierlist JSON files
 * 
 * Usage: node util/add_restaurant.js
 * 
 * This script will:
 * 1. List all JSON files in the data folder
 * 2. Ask you to select a file
 * 3. Ask for restaurant name
 * 4. Ask for image URL
 * 5. Download and convert image to base64
 * 6. Append to untiered list
 * 
 * JSON Schema Documentation: See data/JSON_SCHEMA.md for structure details
 * 
 * Optimization: This script uses streaming file reading for large files,
 * but JSON parsing still requires the full file in memory. For files > 100MB,
 * consider using a streaming JSON parser library.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, '..', 'data');
const UTIL_DIR = path.join(__dirname);

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

// Get all JSON files in data directory
function getJsonFiles() {
  try {
    const files = fs.readdirSync(DATA_DIR);
    return files.filter(file => file.endsWith('.json'));
  } catch (error) {
    console.error('Error reading data directory:', error.message);
    process.exit(1);
  }
}

// Download image from URL and convert to base64
async function downloadAndConvertImage(imageUrl) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(imageUrl);
      const protocol = url.protocol === 'https:' ? https : http;
      
      protocol.get(imageUrl, (response) => {
        // Check if request was successful
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download image: HTTP ${response.statusCode}`));
          return;
        }

        // Get content type to determine image format
        const contentType = response.headers['content-type'] || 'image/png';
        let mimeType = 'image/png'; // default
        
        if (contentType.includes('webp')) {
          mimeType = 'image/webp';
        } else if (contentType.includes('jpeg') || contentType.includes('jpg')) {
          mimeType = 'image/jpeg';
        } else if (contentType.includes('png')) {
          mimeType = 'image/png';
        } else if (contentType.includes('gif')) {
          mimeType = 'image/gif';
        } else {
          // Try to infer from URL extension
          const urlLower = imageUrl.toLowerCase();
          if (urlLower.includes('.webp')) {
            mimeType = 'image/webp';
          } else if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) {
            mimeType = 'image/jpeg';
          } else if (urlLower.includes('.gif')) {
            mimeType = 'image/gif';
          }
        }

        const chunks = [];
        response.on('data', (chunk) => {
          chunks.push(chunk);
        });

        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const base64 = buffer.toString('base64');
          const dataUri = `data:${mimeType};base64,${base64}`;
          resolve(dataUri);
        });

        response.on('error', (error) => {
          reject(new Error(`Error downloading image: ${error.message}`));
        });
      }).on('error', (error) => {
        reject(new Error(`Error downloading image: ${error.message}`));
      });
    } catch (error) {
      reject(new Error(`Invalid URL: ${error.message}`));
    }
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
        
        // Validate structure (quick validation without reading full content)
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
      // Use JSON.stringify with replacer to handle large objects efficiently
      // Using 2-space indentation for readability (can be changed to 0 for smaller files)
      const jsonString = JSON.stringify(data, null, 2);
      
      // Write using streams for better memory efficiency
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

// Main function
async function main() {
  console.log('=== Add Restaurant to Tierlist ===\n');

  // Step 1: List JSON files
  const jsonFiles = getJsonFiles();
  
  if (jsonFiles.length === 0) {
    console.error('No JSON files found in data directory!');
    process.exit(1);
  }

  console.log('Available JSON files:');
  jsonFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${file}`);
  });
  console.log();

  // Step 2: Select file
  const fileChoice = await question(`Select a file (1-${jsonFiles.length}): `);
  const fileIndex = parseInt(fileChoice) - 1;

  if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= jsonFiles.length) {
    console.error('Invalid selection!');
    process.exit(1);
  }

  const selectedFile = jsonFiles[fileIndex];
  const filePath = path.join(DATA_DIR, selectedFile);
  console.log(`\nSelected: ${selectedFile}\n`);

  // Step 3: Get restaurant name
  const restaurantName = await question('Enter restaurant name: ');
  if (!restaurantName.trim()) {
    console.error('Restaurant name cannot be empty!');
    process.exit(1);
  }

  // Step 4: Get image URL
  const imageUrl = await question('Enter image URL: ');
  if (!imageUrl.trim()) {
    console.error('Image URL cannot be empty!');
    process.exit(1);
  }

  // Step 5: Load existing JSON
  console.log('\nLoading JSON file...');
  let jsonData;
  try {
    jsonData = await loadJsonFile(filePath);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    console.error('\nTip: Check data/JSON_SCHEMA.md for expected JSON structure');
    process.exit(1);
  }

  // Ensure untiered array exists (validated in loadJsonFile, but double-check)
  if (!jsonData.untiered) {
    jsonData.untiered = [];
  }

  // Step 6: Download and convert image
  console.log('Downloading image...');
  let dataUri;
  try {
    dataUri = await downloadAndConvertImage(imageUrl.trim());
    console.log('Image downloaded and converted successfully!');
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  // Step 7: Create new entry
  const newEntry = {
    src: dataUri,
    name: restaurantName.trim()
  };

  // Step 8: Append to untiered list
  jsonData.untiered.push(newEntry);

  // Step 9: Save file
  console.log('Saving to file...');
  try {
    await saveJsonFile(filePath, jsonData);
    const fileSizeMB = getFileSizeMB(filePath);
    console.log(`\n✓ Successfully added "${restaurantName.trim()}" to ${selectedFile}`);
    console.log(`  Total untiered items: ${jsonData.untiered.length}`);
    if (fileSizeMB) {
      console.log(`  File size: ${fileSizeMB} MB`);
    }
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
