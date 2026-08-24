const fs = require('fs');

// Read the file without trying to parse it yet
let content = fs.readFileSync('english.json', 'utf8');

// Find and replace unescaped newlines within strings
// This regex finds strings and replaces actual newlines with spaces
let fixed = content.replace(/"[^"]*"/g, function(match) {
  // Replace actual newlines/carriage returns/tabs with spaces
  return match.replace(/[\r\n\t]/g, ' ');
});

// Try to parse
try {
  let data = JSON.parse(fixed);
  fs.writeFileSync('english.json', JSON.stringify(data, null, 2) + '\n');
  console.log('✓ JSON fixed and formatted successfully!');
  console.log('✓ Total size: ' + JSON.stringify(data).length + ' characters');
  if (Array.isArray(data)) {
    console.log('✓ Valid JSON array with ' + data.length + ' items');
  }
} catch(e) {
  console.log('✗ Error:', e.message.substring(0, 150));
}
