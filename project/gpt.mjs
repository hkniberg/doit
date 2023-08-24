// gpt.mjs
import {callFunction, saveFunctionAndUpdateDependencies, testFunction} from "./codegen.mjs";
import readlineSync from 'readline-sync';
import path from "path";
import {createFolderIfMissing, getLast, trimBackticks} from "./util.mjs";

// All these will be relative to the output folder
const TEST_SCRATCH_FOLDER_NAME='test-scratch';
const CODE_FOLDER_NAME='code';
const FILES_FOLDER_NAME='files';

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
        Write a javascript function named {functionName} and a corresponding unit test named {functionName}Test
        based on the following description within tripple quotes:
        """
        {functionDescription}
        """
        
        Give me a complete javascript module that exports {functionName} and {functionName}Test.
        - Use require() to import any modules you need. Don't use import.
        - {functionName} should only take one argument, an object with named parameters.
        - Include logging in the code so I can see what it is doing.
        - The function should throw an error if it can't complete.
        - {functionName}Test should take no arguments. If the test passes, it should return nothing. If it fails, it should throw an error.
        - If {functionName}Test needs to create temporary files, it should place them in {testScratchFolder} (create the folder if missing).
        - Use async/await for asynchronous operations, rather than callbacks.
        - if {functionName} is async, the test should use await the result.
        
        Use --- as delimiter at the beginning and end of the module.
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
    console.log("Test passed! Asking GPT to generate a function spec...")
    messages.push({ role: "user", content: createFunctionSpecPrompt });
    const specResponse = await openai.chat.completions.create({model, messages});

    const functionSpecString = specResponse.choices[0].message.content.split('---')[1].trim();
    const trimmedFunctionSpecString = trimBackticks(functionSpecString);
    console.log(`Done! Function ${functionName} is now implemented and tested and ready to use!`);
    return JSON.parse(trimmedFunctionSpecString);
}

/**
 * Calls GPT and allows it to dynamically generate functions needed to complete the task.
 */
export async function callGptWithDynamicFunctionCreation(openai, model, outputFolder, gptPrompt) {
    const outputFilesFolder = path.join(outputFolder, FILES_FOLDER_NAME);
    createFolderIfMissing(outputFilesFolder);
    const generatedCodeFolder = path.join(outputFolder, CODE_FOLDER_NAME);
    createFolderIfMissing(generatedCodeFolder);
    const testScratchFolder = path.join(outputFolder, TEST_SCRATCH_FOLDER_NAME);
    createFolderIfMissing(testScratchFolder);

    let messages = [
        { role: "system", content: mainSystemMessage.replace('{OUTPUT_FILES_FOLDER}', outputFilesFolder)},
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

