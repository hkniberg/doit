// codegen.mjs
import fs from "fs";
import path from "path";
import detectiveEs6 from "detective-es6";
import {execSync} from "child_process";

/**
 * functionCode is a string containing the code for the function.
 * Should use ESM syntax with import/export instead of require.
 */
export function saveFunctionAndUpdateDependencies(generatedCodeFolder, functionName, functionCode) {
    console.log("saveFunctionAndUpdateDependencies", generatedCodeFolder, functionName)
    if (!generatedCodeFolder) {
        throw new Error("generatedCodeFolder is required");
    }
    if (!functionName) {
        throw new Error("functionName is required");
    }
    if (!functionCode) {
        throw new Error("functionCode is required");
    }

    // Save the implementation to a file in generatedCodeFolder
    const filePath = path.join(generatedCodeFolder, `${functionName}.mjs`);
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
        if (!packageJson.dependencies[module]) {
            packageJson.dependencies[module] = "*"; // Use latest version
        }
    }

    // Write the updated package.json back to the file
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

    // Run npm install in that folder
    execSync('npm install', { cwd: generatedCodeFolder, stdio: 'inherit' });
}

export async function callFunction(generatedCodeFolder, functionName, functionArgs) {
    console.log("callFunction", generatedCodeFolder, functionName, functionArgs);
    if (!generatedCodeFolder) {
        throw new Error("generatedCodeFolder is required");
    }
    if (!functionName) {
        throw new Error("functionName is required");
    }
    if (!functionArgs) {
        throw new Error("functionArgs is required");
    }

    const modulePath = path.join(generatedCodeFolder, `${functionName}.mjs`); // Updated to .mjs
    const module = await import(modulePath);
    const importedFunction = module[`${functionName}`];
    return importedFunction(functionArgs);
}

export async function testFunction(generatedCodeFolder, functionName) {
    if (!generatedCodeFolder) {
        throw new Error("generatedCodeFolder is required");
    }
    if (!functionName) {
        throw new Error("functionName is required");
    }
    const modulePath = path.join(generatedCodeFolder, `${functionName}.mjs`); // Updated to .mjs
    const module = await import(modulePath);
    const unitTestFunction = module[`${functionName}Test`];

    if (typeof unitTestFunction === 'function') {
        try {
            unitTestFunction();
            console.log(`Unit test for ${functionName} passed.`);
        } catch (error) {
            console.error(`Unit test for ${functionName} failed.`, error);
            throw new Error(`Unit test for ${functionName} failed.`);
        }
    } else {
        console.warn(`No unit test found for ${functionName}.`);
    }
}
