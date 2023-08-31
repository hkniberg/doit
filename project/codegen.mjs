// codegen.mjs
import fs from "fs";
import path from "path";
import detectiveEs6 from "detective-es6";
import {execSync} from "child_process";
import isBuiltinModule from 'is-builtin-module'
import * as log from "./htmllog.mjs";

/**
 * functionCode is a string containing the code for the function.
 * Should use ESM syntax with import/export instead of require.
 * Returns the file name.
 */
export function saveFunctionAndUpdateDependencies(generatedCodeFolder, functionName, functionCode) {
    if (!generatedCodeFolder) {
        throw new Error("generatedCodeFolder is required");
    }
    if (!functionName) {
        throw new Error("functionName is required");
    }
    if (!functionCode) {
        throw new Error("functionCode is required");
    }
    if (typeof functionCode !== "string") {
        throw new Error("functionCode must be a string");
    }

    const nextVersion = getNextModuleVersion(generatedCodeFolder, functionName);
    const filePath = getModulePath(generatedCodeFolder, functionName, nextVersion);

    // Save the implementation to a file in generatedCodeFolder
    fs.writeFileSync(filePath, functionCode);

    // Create or update package.json in that folder
    const packageJsonPath = path.join(generatedCodeFolder, 'package.json');
    let packageJson;
    if (fs.existsSync(packageJsonPath)) {
        packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    } else {
        packageJson = {
            name: "generated-code",
            version: "1.0.0",
        };
    }

    // Detect required modules using detective
    const requiredModules = detectiveEs6(functionCode);

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

export async function getLatestModuleCode(generatedCodeFolder, functionName) {
    if (!generatedCodeFolder) {
        throw new Error("generatedCodeFolder is required");
    }
    if (!functionName) {
        throw new Error("functionName is required");
    }

    const latestVersion = getLatestModuleVersion(generatedCodeFolder, functionName);
    if (latestVersion === null) {
        throw new Error(`No versions found for function ${functionName}`);
    }

    const latestModulePath = getModulePath(generatedCodeFolder, functionName, latestVersion);
    return fs.readFileSync(latestModulePath, 'utf8');
}

export async function callFunction(generatedCodeFolder, functionName, functionArgs) {
    if (!generatedCodeFolder) {
        throw new Error("generatedCodeFolder is required");
    }
    if (!functionName) {
        throw new Error("functionName is required");
    }
    if (!functionArgs) {
        throw new Error("functionArgs is required");
    }

    const latestVersion = getLatestModuleVersion(generatedCodeFolder, functionName);
    if (latestVersion === null) {
        throw new Error(`No versions found for function ${functionName}`);
    }

    const latestModulePath = getModulePath(generatedCodeFolder, functionName, latestVersion);

    const module = await import(latestModulePath);
    const importedFunction = module[functionName];
    return importedFunction(functionArgs);
}

export function getLatestModuleVersion(generatedCodeFolder, functionName) {
    let currentVersion = null;

    const files = fs.readdirSync(generatedCodeFolder);
    for (const file of files) {
        const match = file.match(new RegExp(`^${functionName}(\\d*)\\.mjs$`));
        if (match) {
            const version = match[1] ? parseInt(match[1], 10) : 1; // Default to 1 if no version number is found
            currentVersion = Math.max(currentVersion === null ? 0 : currentVersion, version);
        }
    }

    return currentVersion;
}

export function getNextModuleVersion(generatedCodeFolder, functionName) {
    const currentVersion = getLatestModuleVersion(generatedCodeFolder, functionName);
    return currentVersion === null ? 1 : currentVersion + 1;
}

export function getModulePath(generatedCodeFolder, functionName, versionNumber) {
    // Handle the special case where the first version doesn't have a number
    const fileName = versionNumber === 1 ? `${functionName}.mjs` : `${functionName}${versionNumber}.mjs`;
    return path.join(generatedCodeFolder, fileName);
}




