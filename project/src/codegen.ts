// codegen.ts
import fs from "fs";
import path from "path";

// @ts-ignore
import detectiveEs6 from "detective-es6";

import { execSync } from "child_process";
import isBuiltinModule from 'is-builtin-module';

/**
 * functionCode is a string containing the code for the function.
 * Should use ESM syntax with import/export instead of require.
 * Returns the file name.
 */
export async function saveFunctionAndUpdateDependencies(generatedCodeFolder: string, functionName: string, functionCode: string): Promise<string> {
    if (!generatedCodeFolder) {
        throw new Error("generatedCodeFolder is required");
    }
    if (!functionName) {
        throw new Error("functionName is required");
    }
    if (!functionCode) {
        throw new Error("functionCode is required");
    }

    const nextVersion: number = getNextModuleVersion(generatedCodeFolder, functionName);
    const filePath: string = getModulePath(generatedCodeFolder, functionName, nextVersion);

    // Save the implementation to a file in generatedCodeFolder
    fs.writeFileSync(filePath, functionCode);

    // Create or update package.json in that folder
    const packageJsonPath: string = path.join(generatedCodeFolder, 'package.json');
    let packageJson: any;
    if (fs.existsSync(packageJsonPath)) {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } else {
        packageJson = {
            name: "generated-code",
            version: "1.0.0",
        };
    }

    // Detect required modules using detective
    const requiredModules: string[] = detectiveEs6(functionCode);

    // Add detected modules to the package.json dependencies
    packageJson.dependencies = packageJson.dependencies || {};
    for (const module of requiredModules) {
        if (!isBuiltinModule(module) && !packageJson.dependencies[module]) {
            packageJson.dependencies[module] = "*"; // Use latest version
        }
    }

    // Write the updated package.json back to the file
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Run npm install in that folder
    execSync('npm install', { cwd: generatedCodeFolder, stdio: 'inherit' });

    return filePath;
}

export async function getLatestModuleCode(generatedCodeFolder: string, functionName: string): Promise<string> {
    if (!generatedCodeFolder) {
        throw new Error("generatedCodeFolder is required");
    }
    if (!functionName) {
        throw new Error("functionName is required");
    }

    const latestVersion: number | null = getLatestModuleVersion(generatedCodeFolder, functionName);
    if (latestVersion === null) {
        throw new Error(`No versions found for function ${functionName}`);
    }

    const latestModulePath: string = getModulePath(generatedCodeFolder, functionName, latestVersion);
    return fs.readFileSync(latestModulePath, 'utf8');
}

export async function callFunction(generatedCodeFolder: string, functionName: string, functionArgs: any): Promise<any> {
    if (!generatedCodeFolder) {
        throw new Error("generatedCodeFolder is required");
    }
    if (!functionName) {
        throw new Error("functionName is required");
    }
    if (!functionArgs) {
        throw new Error("functionArgs is required");
    }

    const latestVersion: number | null = getLatestModuleVersion(generatedCodeFolder, functionName);
    if (latestVersion === null) {
        throw new Error(`No versions found for function ${functionName}`);
    }

    const latestModulePath: string = getModulePath(generatedCodeFolder, functionName, latestVersion);

    const module: any = await import(latestModulePath);
    const importedFunction: any = module[functionName];
    return importedFunction(functionArgs);
}

export function getLatestModuleVersion(generatedCodeFolder: string, functionName: string): number | null {
    let currentVersion: number | null = null;

    const files: string[] = fs.readdirSync(generatedCodeFolder);
    for (const file of files) {
        const match: RegExpMatchArray | null = file.match(new RegExp(`^${functionName}(\\d*)\\.mjs$`));
        if (match) {
            const version: number = match[1] ? parseInt(match[1], 10) : 1; // Default to 1 if no version number is found
            currentVersion = Math.max(currentVersion === null ? 0 : currentVersion, version);
        }
    }

    return currentVersion;
}

export function getNextModuleVersion(generatedCodeFolder: string, functionName: string): number {
    const currentVersion: number | null = getLatestModuleVersion(generatedCodeFolder, functionName);
    return currentVersion === null ? 1 : currentVersion + 1;
}

export function getModulePath(generatedCodeFolder: string, functionName: string, versionNumber: number): string {
    // Handle the special case where the first version doesn't have a number
    const fileName: string = versionNumber === 1 ? `${functionName}.mjs` : `${functionName}${versionNumber}.mjs`;
    return path.join(generatedCodeFolder, fileName);
}




