// util.ts
import fs from "fs";

export function createFolderIfMissing(folderPath: string): void {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

export function removeFolderIfItExists(folderPath: string): void {
    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true });
    }
}

export function resetFolder(folderPath: string): void {
    if (fs.existsSync(folderPath)) {
        fs.rmSync(folderPath, { recursive: true });
    }
    fs.mkdirSync(folderPath, { recursive: true });
}

export function trimBackticks(content: string): string {
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

export function getLast<T>(array: T[]): T | undefined {
    return array[array.length - 1];
}

export function describeError(error: any, includeStack: boolean = true): string {
    if (error instanceof Error) {
        const description = `${error.name}: ${error.message}`;
        if (includeStack) {
            return description + "\n" + error.stack;
        } else {
            return description;
        }
    } else {
        return `Unknown Error: ${JSON.stringify(error)}`;
    }
}


