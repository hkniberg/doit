// gpt.mjs
import {
    callFunction,
    getLatestModuleCode,
    getModulePath,
    getNextModuleVersion,
    saveFunctionAndUpdateDependencies
} from "./codegen";
import path from "path";
import fs from "fs";
import * as prompts from "./prompts";
import * as log from "./htmllog";
import ui from "./ui";
import {Chat} from "openai/resources";
import {OpenAI} from "openai";
import {ChatCompletionMessage} from "openai/src/resources/chat/completions";
import {createFolderIfMissing, resetFolder, trimBackticks} from "./util";
import ChatCompletion = Chat.ChatCompletion;
import {ChatCompletionCreateParams, ChatCompletionCreateParamsNonStreaming} from "openai/resources/chat";

// All these will be relative to the output folder
const CODE_FOLDER_NAME='code';
const QUARANTINE_FOLDER_NAME='quarantine';

async function executeGeneratedFunction(openai: OpenAI,
                                        model: string,
                                        codeFolder: string,
                                        quarantineFolder: string,
                                        functionName: string,
                                        functionArgs: any): Promise<any> {
    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
        try {
            ui.startSpinner(`Running function ${functionName} with args ${JSON.stringify(functionArgs)}`)
            const result = await callFunction(codeFolder, functionName, functionArgs);
            ui.stopSpinnerWithCheckmark();
            return result;
        } catch (error) {
            ui.stopSpinnerWithCross();
            log.error(error);
            attempts++;
            if (attempts >= MAX_ATTEMPTS) {
                throw new Error(`Failed to fix function ${functionName} after ${MAX_ATTEMPTS} attempts.`);
            }

            await askGptToDebugFunction(openai, model, codeFolder, quarantineFolder, functionName, functionArgs, error);
        }
    }
}

async function askGptToDebugFunction(    openai: OpenAI,
                                         model: string,
                                         codeFolder: string,
                                         quarantineFolder: string,
                                         functionName: string,
                                         functionArgs: any,
                                         error: any): Promise<void> {
    // Retrieve the function code
    const moduleCode = await getLatestModuleCode(codeFolder, functionName);

    // load the function spec
    const functionSpec = fs.readFileSync(path.join(codeFolder, `${functionName}.json`), 'utf-8');

    // Create a debug prompt for GPT to fix the function
    const userMessage = prompts.debugPrompt
        .replace('{codeStyle}', prompts.codeStyle)
        .replaceAll('{functionName}', functionName)
        .replace('{functionSpec}', functionSpec)
        .replace('{moduleCode}', moduleCode)
        .replace('{functionInput}', JSON.stringify(functionArgs))
        .replace('{functionError}', JSON.stringify(error));

    // Request GPT to fix the function
    ui.startSpinner("Damn. It failed. Asking GPT to code up a new debugged version of it.");
    const response = await callOpenAICompletions(openai, model, [
        { role: "system", content: prompts.debugSystemPrompt },
        { role: "user", content: userMessage }
    ]);
    let responseContent = response.message;
    if (!responseContent.content) {
        throw new Error("GPT failed to generate a function, no content in response.");
    }

    const fixedModuleCode = responseContent.content.split('---')[1].trim();
    const trimmedFixedModuleCode = trimBackticks(fixedModuleCode);
    ui.stopSpinnerWithCheckmark();

    const possiblyUpdatedModuleCode = await verifyThatCodeIsSafe(codeFolder, quarantineFolder, functionName, trimmedFixedModuleCode);

    // Replace the existing function code with the fixed code
    ui.startSpinner("Installing the debugged function");
    await saveFunctionAndUpdateDependencies(codeFolder, functionName, possiblyUpdatedModuleCode);
    ui.stopSpinnerWithCheckmark();
}

async function askGptToGenerateFunction(    openai: OpenAI,
                                            model: string,
                                            codeFolder: string,
                                            quarantineFolder: string,
                                            functionName: string,
                                            functionDescription: string): Promise<ChatCompletionCreateParams.Function> {
    let messages: ChatCompletionMessage[] = [
        { role: "system", content: "You are an awesome javascript coding genius" },
    ];

    let implementationPrompt = prompts.createFunctionImplementationPrompt
        .replace('{codeStyle}', prompts.codeStyle)
        .replaceAll('{functionName}', functionName)
        .replace('{functionDescription}', functionDescription);

    messages.push({ role: "user", content: implementationPrompt });

    ui.startSpinner("GPT requested a function called " + functionName + ". Asking GPT to code it up.");

    const implementationResponse = await callOpenAICompletions(openai, model, messages);
    if (!implementationResponse.message.content) {
        throw new Error("GPT failed to generate a function, no content in response.");
    }
    const functionCode = implementationResponse.message.content.split('---')[1].trim();
    let trimmedFunctionCode = trimBackticks(functionCode);
    ui.stopSpinnerWithCheckmark();

    // clear the quarantine folder and add this function to it
    const possiblyUpdatedFunctionCode = await verifyThatCodeIsSafe(codeFolder, quarantineFolder, functionName, trimmedFunctionCode);

    ui.startSpinner("Installing the function");
    // TODO error handling here, ask GPT to debug if this fails
    await saveFunctionAndUpdateDependencies(codeFolder, functionName, possiblyUpdatedFunctionCode);
    ui.stopSpinnerWithCheckmark();

    // Ask GPT to generate a function spec for it
    ui.startSpinner("Asking GPT to generate a function spec, so we can include it in future prompts.")
    messages.push({ role: "user", content: prompts.createFunctionSpecPrompt });
    const specResponse = await callOpenAICompletions(openai, model, messages);

    if (!specResponse.message.content) {
        throw new Error("GPT failed to generate a function spec, no content in response.");
    }
    const functionSpecString = specResponse.message.content.split('---')[1].trim();
    const trimmedFunctionSpecString = trimBackticks(functionSpecString);

    const functionSpecFilePath = path.join(codeFolder, `${functionName}.json`);
    fs.writeFileSync(functionSpecFilePath, trimmedFunctionSpecString);
    ui.stopSpinnerWithCheckmark();

    return JSON.parse(trimmedFunctionSpecString);
}

async function verifyThatCodeIsSafe(    codeFolder: string,
                                        quarantineFolder: string,
                                        functionName: string,
                                        functionCode: string): Promise<string> {
    resetFolder(quarantineFolder);
    const nextVersion = getNextModuleVersion(codeFolder, functionName);
    const quarantineFilePath = getModulePath(quarantineFolder, functionName, nextVersion);
    fs.writeFileSync(quarantineFilePath, functionCode);
    const userApproval = await ui.askIfCodeFileIsSafe(functionName, quarantineFilePath);
    if (userApproval.toLowerCase() !== 'y') {
        throw new Error("Function creation declined by user.");
    }
    // reload it in case the user made changes
    let possiblyUpdatedFunctionCode = fs.readFileSync(quarantineFilePath, 'utf8').toString();
    fs.unlinkSync(quarantineFilePath);
    return possiblyUpdatedFunctionCode;
}

/**
 * Calls GPT and allows it to dynamically generate functions needed to complete the task.
 */
export async function callGptWithDynamicFunctionCreation(    openai: OpenAI,
                                                             model: string,
                                                             outputFolder: string,
                                                             functionSpecs: ChatCompletionCreateParams.Function[],
                                                             messages: any[],
                                                             userPrompt: string): Promise<string | null> {
    const codeFolder = path.join(outputFolder, CODE_FOLDER_NAME);
    createFolderIfMissing(codeFolder);
    const quarantineFolder = path.join(outputFolder, QUARANTINE_FOLDER_NAME);
    createFolderIfMissing(quarantineFolder);

    messages.push(
        { role: "user", content: userPrompt },
    );

    while (true) {
        ui.startSpinner('Waiting for GPT-4 response. Giving it functions: ' + functionSpecs.map(f => f.name).join(', '));
        const response = await callOpenAICompletions(openai, model, messages, functionSpecs);
        ui.stopSpinnerWithCheckmark();
        let responseMessage = response.message;
        messages.push(responseMessage);

        if (responseMessage.function_call) {
            const functionName = responseMessage.function_call.name;
            const functionArgs = JSON.parse(responseMessage.function_call.arguments);

            if (functionName === 'requestFunction') {
                const generatedFunctionSpec = await askGptToGenerateFunction(
                    openai,
                    model,
                    codeFolder,
                    quarantineFolder,
                    functionArgs.name,
                    functionArgs.description
                );
                functionSpecs.push(generatedFunctionSpec);
                messages.push({ role: "function", name: 'requestFunction', content: "Function created successfully." });
            } else {
                const result = await executeGeneratedFunction(openai, model, codeFolder, quarantineFolder, functionName, functionArgs);
                const resultDescription = result !== undefined ? JSON.stringify(result) : "Function executed successfully but returned no value.";
                messages.push({ role: "function", name: functionName, content: resultDescription });
            }
        } else if (response.finish_reason === 'stop') {
            return responseMessage.content;
        }
    }
}

// Helper function to call OpenAI API and get the first choice message
async function callOpenAICompletions(    openai: OpenAI,
                                         model: string,
                                         messages: ChatCompletionMessage[],
                                         functions?:  ChatCompletionCreateParams.Function[]): Promise<ChatCompletion.Choice> {
    let body: ChatCompletionCreateParamsNonStreaming = {
        model: model,
        messages: messages
    };
    if (functions) {
        body.functions = functions;
    }

    log.logGptRequest(model, messages, functions);

    const response: ChatCompletion = await openai.chat.completions.create(body);

    log.logGptResponse(response);

    return response.choices[0];
}