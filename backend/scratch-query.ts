import fs from 'fs';
import path from 'path';

const specFile = path.resolve(__dirname, '..', 'ZAPO', 'spec', 'proto', 'index.d.ts');
console.log("Reading spec file:", specFile);

if (fs.existsSync(specFile)) {
    const content = fs.readFileSync(specFile, 'utf-8');
    const lines = content.split('\n');
    
    const matchedNames = new Set<string>();
    const searchTerms = ['buttonsresponsemessage', 'listresponsemessage', 'interactiveresponsemessage'];
    
    for (const line of lines) {
        const lowerLine = line.toLowerCase();
        if (line.includes('interface ') || line.includes('type ')) {
            for (const term of searchTerms) {
                if (lowerLine.includes(term)) {
                    const match = line.match(/(?:interface|type)\s+([A-Za-z0-9_]+)/);
                    if (match && match[1]) {
                        matchedNames.add(match[1]);
                    }
                }
            }
        }
    }

    console.log("Matched interface/type names:", Array.from(matchedNames));

    for (const name of matchedNames) {
        console.log(`\n=== Declaration of ${name} ===`);
        const index = lines.findIndex(l => l.includes(`${name} `) || l.includes(`${name}{`) || l.includes(`${name}:`));
        if (index !== -1) {
            console.log(lines.slice(index - 1, index + 35).join('\n'));
        }
    }
} else {
    console.log("Spec file does not exist.");
}
