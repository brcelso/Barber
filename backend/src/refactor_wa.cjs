const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'index.js');
const waFile = path.join(__dirname, 'whatsapp.js');

const code = fs.readFileSync(file, 'utf8');
const lines = code.split('\n');

const startIdx = lines.findIndex(l => l.includes('// Webhook for WhatsAppBot'));
let endIdx = startIdx;
let bracketCount = 0;
let foundStart = false;

for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].includes("if (url.pathname === '/api/whatsapp/webhook'")) {
        foundStart = true;
    }

    // Count braces
    for (const char of lines[i]) {
        if (char === '{') bracketCount++;
        if (char === '}') bracketCount--;
    }

    if (foundStart && bracketCount === 0) {
        endIdx = i;
        break;
    }
}

if (!foundStart || endIdx === startIdx) {
    console.error('Failed to find block boundaries');
    process.exit(1);
}

const webhookLines = lines.slice(startIdx + 1, endIdx); // excludes the if() and the final }
// Extract the inner body
// Wait, webhookLines contains `if (url.pathname ... {` which we don't want inside the new function if we are passing request.
// Actually, let's extract the whole block including `if` or just its body.
// Body only:
const bodyLines = lines.slice(startIdx + 2, endIdx);

const waCode = `export async function handleWhatsAppWebhook(request, env, json) {
${bodyLines.join('\n')}
};
`;

fs.writeFileSync(waFile, waCode, 'utf8');

// Replace in index
let newLines = [];
// insert import at the beginning
newLines.push(`import { handleWhatsAppWebhook } from './whatsapp.js';`);

for (let i = 0; i < lines.length; i++) {
    if (i === startIdx) {
        newLines.push(`            // Webhook for WhatsAppBot`);
        newLines.push(`            if (url.pathname === '/api/whatsapp/webhook' && request.method === 'POST') {`);
        newLines.push(`                return await handleWhatsAppWebhook(request, env, json);`);
        newLines.push(`            }`);
        i = endIdx; // skip the old block
    } else {
        newLines.push(lines[i]);
    }
}

fs.writeFileSync(file, newLines.join('\n'), 'utf8');
console.log('Refactor complete!');
