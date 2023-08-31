// gpt.mjs
import {callFunction, saveFunctionAndUpdateDependencies, testFunction} from "./codegen.mjs";
import readlineSync from 'readline-sync';
import path from "path";
import {createFolderIfMissing, getLast, trimBackticks} from "./util.mjs";
import fs from "fs";

// All these will be relative to the output folder
const TEST_SCRATCH_FOLDER_NAME='test-scratch';
const CODE_FOLDER_NAME='code';

const sampleFunctionSpec = {
    "name": "getWeather",
    "description": "Get the current weather for a city",
    "parameters": {
        "type": "object",
        "properties": {
            "city": {
                "type": "string",
                "description": "The city",
            },
        },
        "required": ["city"],
    },
}


const requestFunctionSpec = {
    "name": "requestFunction",
    "description": "Requests a new function with given name and description",
    "parameters": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "The name of the function, camelCase, no spaces. For example sendEmail."
            },
            "description": {
                "type": "string",
                "description": "A detailed description of what the function does, include input params, and return value." +
                    "For example: 'Sends an email to the given email address with the given subject and body'." +
                    "Also include an example of the input you plan to send to this function."
            }
        },
        "required": ["name", "description"]
    }
}

const mainSystemMessage = `
        You are an assistant with the ability to dynamically request new functions.
        Before responding to a new prompt, figure out which functions you will need to complete the task.
        Use the given function requestFunction() function to describe what you need,
        and I will make sure those functions are available to you in the next message.
        After you have all the functions you need, respond to the original prompt.
        `;

const createFunctionImplementationPrompt = `
        Write a JavaScript function named {functionName} and a corresponding unit test named {functionName}Test
        based on the following description within triple quotes:
        """
        {functionDescription}
        """
        
        Provide a complete JavaScript module that exports {functionName}.
        - Use ESM syntax with import/export statements. Avoid using require().
        - {functionName} should accept only one argument, an object with named parameters.
        - Incorporate logging within the code to provide visibility into its operations.
        - The function should throw an error if it encounters any issues.
        - Favor async/await over callbacks for asynchronous operations.
        - If {functionName} is asynchronous, ensure {functionName}Test awaits its result.
        
        Include export unit test function {functionName}Test, but only if the test can run without external dependencies (such as http requests).
        - {functionName}Test should not take any arguments.
        - If the test is successful, it should return nothing.
        - If it fails, it should throw an error and log details about which inputs and outputs were involved.
        - If {functionName}Test needs to generate temporary files, save them in pre-existing directory {testScratchFolder}.
        - Avoid using global variables like __dirname; instead, derive paths relative to the module using ESM techniques.

        If you can't make an independent unit test, just skip {functionName}Test.
        
        The final output should be a complete JavaScript module that exports {functionName}
        and optionally also {functionName}Test.

        Use --- as a delimiter at both the beginning and end of the module.
        `;


const createFunctionSpecPrompt = `
    Create a function spec for the code above.
    It should be formatted as a JSON Schema Object. Here is an example:
    ${JSON.stringify(sampleFunctionSpec, null, 2)}
    
    Use --- as delimiter at the beginning and end of the function spec.
`;

const debugSystemPrompt = `
    You are a master debugger. When you are asked to fix a function, you always return
    a complete new module with the fixed function code. 
    Use --- as a delimiter at both the beginning and end of the module.
`

const debugPrompt = `
    Debug the {functionName} function. Here is the complete module:
    ---
    {moduleCode}
    ---

    I sent the following input:
    {functionInput}
    
    I got the following output & error:
    {functionInput}

    Please provide a complete new version of this module, where the bug is fixed.
    If you are unable to determine the cause of the bug, just return the same module
    but with more logging to help you debug it later.
    
    Use --- as a delimiter at both the beginning and end of the module.
  `;

async function executeGeneratedFunction(openai, model, generatedCodeFolder, functionName, functionArgs) {
    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
        try {
            const result = await callFunction(generatedCodeFolder, functionName, functionArgs);
            return result; // Return the result if successful
        } catch (error) {
            // Handle the error and attempt to fix the function
            const success = await handleFunctionError(openai, model, generatedCodeFolder, functionName, functionArgs, error);
            if (!success) {
                attempts++;
                if (attempts >= MAX_ATTEMPTS) {
                    throw new Error(`Failed to fix function ${functionName} after ${MAX_ATTEMPTS} attempts.`);
                }
            }
        }
    }
}

async function handleFunctionError(openai, model, generatedCodeFolder, functionName, functionArgs, error, output) {
    // Retrieve the function code
    const moduleCode = fs.readFileSync(path.join(generatedCodeFolder, `${functionName}.mjs`), 'utf-8');

    // Create a debug prompt for GPT to fix the function
    const prompt = debugPrompt
        .replace('{functionName}', functionName)
        .replace('{moduleCode}', moduleCode)
        .replace('{functionInput}', JSON.stringify(functionArgs))
        .replace('{functionOutput}', JSON.stringify(output));

    // Request GPT to fix the function
    const response = await openai.chat.completions.create({ model, messages: [{ role: "user", content: prompt }] });
    const fixedModuleCode = response.choices[0].message.content.split('---')[1].trim();

    // Replace the existing function code with the fixed code
    fs.writeFileSync(path.join(generatedCodeFolder, `${functionName}.mjs`), fixedModuleCode);

    // Optionally, you can re-run the test for the function or perform additional validation here

    return true; // Return true if the fix was successful
}


async function askGptToGenerateFunction(openai, model, generatedCodeFolder, testScratchFolder, functionName, functionDescription) {
    let messages = [
        { role: "system", content: "You are an awesome javascript coding genius" },
    ];

    let implementationPrompt = createFunctionImplementationPrompt
        .replace('{functionName}', functionName)
        .replace('{functionDescription}', functionDescription)
        .replace('{testScratchFolder}', testScratchFolder);
    messages.push({ role: "user", content: implementationPrompt });

    console.log(`Asking GPT to write code and test for function ${functionName}...`);
    const implementationResponse = await openai.chat.completions.create({model, messages})

    const functionCode = implementationResponse.choices[0].message.content.split('---')[1].trim();
    const trimmedFunctionCode = trimBackticks(functionCode);

    // Show the generated code to the user and ask for approval
    console.log(`======== Generated function: ${functionName} ==============`);
    console.log(trimmedFunctionCode);
    console.log(`===========================================================`);
    const userApproval = readlineSync.question(`\n Do you approve the creation of this function? (Y/N) `);

    if (userApproval.toLowerCase() !== 'y') {
        throw new Error("Function creation declined by user.");
    }

    console.log("Saving the function and updating dependencies...")
    await saveFunctionAndUpdateDependencies(generatedCodeFolder, functionName, trimmedFunctionCode);

    console.log(`Running unit test ${functionName}Test...`);
    await testFunction(generatedCodeFolder, functionName);

    // Ask GPT for the function spec
    console.log("Test passed (or didn't exist). Asking GPT to generate a function spec...")
    messages.push({ role: "user", content: createFunctionSpecPrompt });
    const specResponse = await openai.chat.completions.create({model, messages});

    const functionSpecString = specResponse.choices[0].message.content.split('---')[1].trim();
    const trimmedFunctionSpecString = trimBackticks(functionSpecString);

    const functionSpecFilePath = path.join(generatedCodeFolder, `${functionName}.json`);
    fs.writeFileSync(functionSpecFilePath, trimmedFunctionSpecString);

    console.log(`Done! Function ${functionName} is now implemented and tested and ready to use!`);

    return JSON.parse(trimmedFunctionSpecString);
}

/**
 * Calls GPT and allows it to dynamically generate functions needed to complete the task.
 */
export async function callGptWithDynamicFunctionCreation(openai, model, outputFolder, gptPrompt) {
    const generatedCodeFolder = path.join(outputFolder, CODE_FOLDER_NAME);
    createFolderIfMissing(generatedCodeFolder);
    const testScratchFolder = path.join(outputFolder, TEST_SCRATCH_FOLDER_NAME);
    createFolderIfMissing(testScratchFolder);

    let messages = [
        { role: "system", content: mainSystemMessage},
        { role: "user", content: gptPrompt }
    ];

    let functionSpecs = [requestFunctionSpec];

    while (true) {
        console.log("\n\n============================")
        console.log("Sending: ", getLast(messages))
        console.log("Including functions: ", functionSpecs)
        const response = await openai.chat.completions.create({
            model: model,
            messages: messages,
            functions: functionSpecs
        });

        let responseMessage = response.choices[0].message;
        console.log("Got response: ", responseMessage);
        messages.push(responseMessage);

        if (responseMessage.function_call) {
            const functionName = responseMessage.function_call.name;
            const functionArgs = JSON.parse(responseMessage.function_call.arguments);

            if (functionName === 'requestFunction') {
                const generatedFunctionSpec = await askGptToGenerateFunction(
                    openai,
                    model,
                    generatedCodeFolder,
                    testScratchFolder,
                    functionArgs.name,
                    functionArgs.description
                );
                functionSpecs.push(generatedFunctionSpec);
                messages.push({ role: "function", name: 'requestFunction', content: "Function created successfully." });
            } else {
                const result = await executeGeneratedFunction(openai, model, generatedCodeFolder, functionName, functionArgs);
                const resultDescription = result !== undefined ? JSON.stringify(result) : "Function executed successfully but returned no value.";
                messages.push({ role: "function", name: functionName, content: resultDescription });
            }
        } else if (response.choices[0].finish_reason === 'stop') {
            console.log("Chat completed! Final message: ", responseMessage.content);
            return responseMessage.content;
        }
    }
}

