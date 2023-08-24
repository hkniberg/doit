import fs from "fs";

export function createFolderIfMissing(folderPath) {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

export function trimBackticks(content) {
    const lines = content.split('\n');

    // Remove the first line if it starts with ```
    if (lines[0].startsWith('```')) {
        lines.shift();
    }

    // Remove the last line if it starts with ```
    if (lines[lines.length - 1].startsWith('```')) {
        lines.pop();
    }

    return lines.join('\n');
}

export function getLast(array) {
    return array[array.length - 1];
}
