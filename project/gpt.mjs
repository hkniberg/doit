// gpt.mjs
import {callFunction, saveFunctionAndUpdateDependencies, testFunction} from "./codegen.mjs";
import readlineSync from 'readline-sync';
import path from "path";
import {createFolderIfMissing, getLast, trimBackticks} from "./util.mjs";
import fs from "fs";
import * as prompts from "./prompts.mjs";

// All these will be relative to the output folder
const TEST_SCRATCH_FOLDER_NAME='test-scratch';
const CODE_FOLDER_NAME='code';

async function executeGeneratedFunction(openai, model, generatedCodeFolder, functionName, functionArgs) {
    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
        try {
            return await callFunction(generatedCodeFolder, functionName, functionArgs);
        } catch (error) {
            console.log(`Function ${functionName} failed with error: ${error}`, error);
            console.log("Will attempt to debug it.");
            const success = await askGptToDebugFunction(openai, model, generatedCodeFolder, functionName, functionArgs, error);
            if (!success) {
                console.log("success == false");
                attempts++;
                if (attempts >= MAX_ATTEMPTS) {
                    console.log(`Failed to fix function ${functionName} after ${MAX_ATTEMPTS} attempts.`)
                    throw new Error(`Failed to fix function ${functionName} after ${MAX_ATTEMPTS} attempts.`);
                }
            }
        }
    }
}

// Function to initialize the log file with CSS styles
export function initGptLog() {
    const cssStyles = `<style>
                        pre {
                            white-space: pre-wrap;       
                            white-space: -moz-pre-wrap;  
                            white-space: -o-pre-wrap;    
                            word-wrap: break-word;       
                        }
                       </style>`;
    fs.writeFileSync(path.join(process.cwd(), 'gpt.log.html'), cssStyles);
}

async function askGptToDebugFunction(openai, model, generatedCodeFolder, functionName, functionArgs, error) {
    // Retrieve the function code
    const modulePath = path.join(generatedCodeFolder, `${functionName}.mjs`);
    const moduleCode = fs.readFileSync(modulePath, 'utf-8');

    // load the function spec
    const functionSpec = fs.readFileSync(path.join(generatedCodeFolder, `${functionName}.json`), 'utf-8');

    // Create a debug prompt for GPT to fix the function
    const userMessage = prompts.debugPrompt
        .replace('{codeStyle}', prompts.codeStyle)
        .replaceAll('{functionName}', functionName)
        .replace('{functionSpec}', functionSpec)
        .replace('{moduleCode}', moduleCode)
        .replace('{functionInput}', JSON.stringify(functionArgs))
        .replace('{functionError}', JSON.stringify(error));

    // Request GPT to fix the function
    console.log(`Asking GPT to debug and fix function ${functionName}`, userMessage);
    const response = await callOpenAICompletions(openai, model, [
        { role: "system", content: prompts.debugSystemPrompt },
        { role: "user", content: userMessage }
    ]);
    let responseContent = response.message;
    console.log("Got response content: ", responseContent);
    const fixedModuleCode = responseContent.content.split('---')[1].trim();
    const trimmedFixedModuleCode = trimBackticks(fixedModuleCode);

    // Show the fixed code to the user and ask for approval
    console.log(`======== Debugged function: ${functionName} ==============`);
    console.log(trimmedFixedModuleCode);
    console.log(`=========================================================`);
    const userApproval = readlineSync.question(`\n Do you approve the changes to this function? (Y/N) `);

    if (userApproval.toLowerCase() !== 'y') {
        console.log("Debugging changes declined by user.");
        return false;
    }

    // Replace the existing function code with the fixed code
    console.log("Saving the debugged function and updating dependencies...");
    await saveFunctionAndUpdateDependencies(generatedCodeFolder, functionName, trimmedFixedModuleCode);

    // Run the unit test for the debugged function
    console.log(`Running unit test ${functionName}Test...`);
    await testFunction(generatedCodeFolder, functionName);

    console.log(`Debugging complete! Function ${functionName} is now debugged and ready to use!`);
    return true;
}



async function askGptToGenerateFunction(openai, model, generatedCodeFolder, testScratchFolder, functionName, functionDescription) {
    let messages = [
        { role: "system", content: "You are an awesome javascript coding genius" },
    ];

    let implementationPrompt = prompts.createFunctionImplementationPrompt
        .replace('{codeStyle}', prompts.codeStyle)
        .replaceAll('{functionName}', functionName)
        .replace('{functionDescription}', functionDescription)
        .replaceAll('{testScratchFolder}', testScratchFolder);

    messages.push({ role: "user", content: implementationPrompt });

    console.log(`Asking GPT to write code and test for function ${functionName}...`);
    const implementationResponse = await callOpenAICompletions(openai, model, messages, null);
    const functionCode = implementationResponse.message.content.split('---')[1].trim();

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
    messages.push({ role: "user", content: prompts.createFunctionSpecPrompt });
    const specResponse = await callOpenAICompletions(openai, model, messages, null);

    const functionSpecString = specResponse.message.content.split('---')[1].trim();
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
        { role: "system", content: prompts.mainSystemMessage},
        { role: "user", content: gptPrompt }
    ];

    let functionSpecs = [prompts.requestFunctionSpec];

    while (true) {
        console.log("\n\n============================");
        console.log("Sending: ", getLast(messages));
        console.log("Including functions: ", functionSpecs);

        const response = await callOpenAICompletions(openai, model, messages, functionSpecs);
        let responseMessage = response.message;

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
        } else if (response.finish_reason === 'stop') {
            console.log("Chat completed! Final message: ", responseMessage.content);
            return responseMessage.content;
        }
    }
}

// Helper function to call OpenAI API and get the first choice message
async function callOpenAICompletions(openai, model, messages, functions) {
    let body = {
        model: model,
        messages: messages
    };
    if (functions) {
        body.functions = functions;
    }

    const requestBodyLog = `<h1>Request</h1><br>
                        <b>Model</b>: ${model} <br>
                        <b>Messages</b>: <br>
                        ${messages.map(m => `- ${m.role}: ${m.role === 'user' ? '<pre>'+ m.content + '</pre>' : m.content}`).join('<br>')} <br><br>
                        <b>Functions</b>: <br> <pre>${functions ? JSON.stringify(functions, null, 2) : 'None'}</pre> <br><hr>`;

    fs.appendFileSync(path.join(process.cwd(), 'gpt.log.html'), requestBodyLog);

    const response = await openai.chat.completions.create(body);

    let functionDetailsLog = '';
    if(response.choices[0].finish_reason === 'function_call') {
        const funcCall = response.choices[0].message.function_call;
        functionDetailsLog = `<b>Function Call</b>: <br> <b>Name</b>: ${funcCall.name} <br> <b>Arguments</b>: <pre>${JSON.stringify(JSON.parse(funcCall.arguments), null, 2)}</pre><br>`;
    }

    const responseBodyLog = `<h1>Response</h1> <br>
                         <b>Message Content</b>: <br><pre>${response.choices[0].message.content}</pre><br>
                         ${functionDetailsLog}
                         <b>Finish Reason</b>: ${response.choices[0].finish_reason} <br>
                         <hr>`;

    fs.appendFileSync(path.join(process.cwd(), 'gpt.log.html'), responseBodyLog);

    return response.choices[0];
}