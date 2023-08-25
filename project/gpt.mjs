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
                const result = await callFunction(generatedCodeFolder, functionName, functionArgs);
                const resultDescription = result !== undefined ? JSON.stringify(result) : "Function executed successfully but returned no value.";
                messages.push({ role: "function", name: functionName, content: resultDescription });
            }
        } else if (response.choices[0].finish_reason === 'stop') {
            console.log("Chat completed! Final message: ", responseMessage.content);
            return responseMessage.content;
        }
    }
}

