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
import {MAX_FUNCTION_RESPONSE_LENGTH} from "./prompts";
import * as log from "./htmllog";
import ui from "./ui";
import {Chat} from "openai/resources";
import {OpenAI} from "openai";
import {ChatCompletionMessageParam} from "openai/src/resources/chat/completions";
import {createFolderIfMissing, describeError, resetFolder, trimBackticks, truncateIfNecessary} from "./util";
import {ChatCompletionCreateParams, ChatCompletionCreateParamsNonStreaming} from "openai/resources/chat";
import chalk from "chalk";
import * as colors from "./colors";
import ChatCompletion = Chat.ChatCompletion;

// All these will be relative to the output folder
const CODE_FOLDER_NAME='code';
const FILES_FOLDER_NAME='files';
const QUARANTINE_FOLDER_NAME='quarantine';

export async function loadFunctionSpecs(outputFolder: string): Promise<ChatCompletionCreateParams.Function[]> {
    const codeFolder = path.join(outputFolder, CODE_FOLDER_NAME);
    if (!fs.existsSync(codeFolder)) {
        return [];
    }
    // All function specs are stored as xxx.json files in the code folder.
    // Load them all and return them.
    const files = fs.readdirSync(codeFolder);
    return files
        .filter(file => file.endsWith('.json') && (file !== 'package.json') && (file !== 'package-lock.json'))
        .map(file => {
            const functionSpec = fs.readFileSync(path.join(codeFolder, file), 'utf-8');
            return JSON.parse(functionSpec);
        });
}

async function executeGeneratedFunction(openai: OpenAI,
                                        model: string,
                                        messages: ChatCompletionMessageParam[],
                                        codeFolder: string,
                                        quarantineFolder: string,
                                        workingDir: string,
                                        functionName: string,
                                        functionArgs: any): Promise<string | null> {
    let attempts = 0;
    const MAX_ATTEMPTS = 3;

    while (attempts < MAX_ATTEMPTS) {
        ui.startSpinner(`Running function ${colors.functionName(functionName)} with args ${colors.functionArgs(JSON.stringify(functionArgs))}`)
        const result = await callFunction(codeFolder, workingDir, functionName, functionArgs);
        log.info("Result of function call: " + JSON.stringify(result, null, 2));
        if (!result.thrownError) {
            ui.stopSpinnerWithCheckmark();
            const resultDescription = result.returnValue !== undefined ? JSON.stringify(result.returnValue) : "Function executed successfully but returned no value.";
            const resultDescriptionTruncated = truncateIfNecessary(resultDescription, MAX_FUNCTION_RESPONSE_LENGTH);
            messages.push({ role: "function", name: functionName, content: resultDescriptionTruncated });
            return null;
        }

        messages.push({ role: "function", name: functionName, content: "An error was thrown: " + describeError(result.thrownError, false) });
        ui.stopSpinnerWithCross();
        log.error("The function threw an error: ", result.thrownError);
        attempts++;
        if (attempts >= MAX_ATTEMPTS) {
            throw new Error(`Failed to fix function ${functionName} after ${MAX_ATTEMPTS} attempts. Last error was: ${describeError(result.thrownError, false)}`);
        }

        const debugResponse = await askGptToDebugFunction(openai, model, messages, codeFolder, quarantineFolder, functionName, functionArgs, result.consoleOutput, result.thrownError);
        if (!debugResponse.newModuleCode && !debugResponse.newInputParams) {
            return debugResponse.content;
        }
        if (debugResponse.newInputParams) {
            functionArgs = debugResponse.newInputParams;
        }
    }
    return null;
}

type DebugResponse = {
    newInputParams?: any;
    newModuleCode?: string;
    content: string;
};
export function parseGptDebugResponse(response: string): DebugResponse {
    const result: DebugResponse = {
        content: response
    };

    // Check for new input params
    const inputMatch = response.match(/===(.*?)===/s);
    if (inputMatch && inputMatch[1]) {
        try {
            result.newInputParams = JSON.parse(inputMatch[1].trim());
        } catch (e) {
            console.error("Failed to parse new input params:", e);
        }
    }

    // Check for new module code
    const moduleMatch = response.match(/---(.*?)---/s);
    if (moduleMatch && moduleMatch[1]) {
        result.newModuleCode = trimBackticks(moduleMatch[1].trim());
    }

    return result;
}

async function askGptToDebugFunction(    openai: OpenAI,
                                         model: string,
                                         messages: ChatCompletionMessageParam[],
                                         codeFolder: string,
                                         quarantineFolder: string,
                                         functionName: string,
                                         functionArgs: any,
                                         consoleOutput: string[],
                                         error: any): Promise<DebugResponse> {
    // Retrieve the function code
    const moduleCode = await getLatestModuleCode(codeFolder, functionName);

    // load the function spec
    const functionSpec = fs.readFileSync(path.join(codeFolder, `${functionName}.json`), 'utf-8');

    // Create a debug prompt for GPT to fix the function
    const debugMessage = prompts.debugPrompt
        .replaceAll('{functionName}', functionName)
        .replace('{functionSpec}', functionSpec)
        .replace('{moduleCode}', moduleCode)
        .replace('{functionInput}', JSON.stringify(functionArgs))
        .replace('{consoleOutput}', consoleOutput.join('\n'))
        .replace('{functionError}', describeError(error));

    messages.push({ role: "user", content: debugMessage })

    // Request GPT to fix the function
    ui.startSpinner("Damn. It failed. " + chalk.red(describeError(error, false)) + ". Asking GPT to solve the problem.");
    const response = await callOpenAICompletions(openai, model, 0,  messages);
    let responseContent = response.message;
    if (!responseContent.content) {
        ui.stopSpinnerWithCross();
        throw new Error("GPT failed to generate a function, no content in response.");
    }

    const debugResponse: DebugResponse = parseGptDebugResponse(responseContent.content);
    ui.stopSpinnerWithCheckmark();

    if (debugResponse.newModuleCode) {
        const possiblyUpdatedModuleCode = await verifyThatCodeIsSafe(codeFolder, quarantineFolder, functionName, debugResponse.newModuleCode);

        // Replace the existing function code with the fixed code
        ui.startSpinner("Got a new version of the code. Installing it.");
        await saveFunctionAndUpdateDependencies(codeFolder, functionName, possiblyUpdatedModuleCode);
        ui.stopSpinnerWithCheckmark();
    } else if (debugResponse.newInputParams) {
        ui.write("Got new input params. Let's try again and see if that works better.");
    }
    return debugResponse;
}

async function askGptToGenerateFunction(    openai: OpenAI,
                                            model: string,
                                            codeFolder: string,
                                            quarantineFolder: string,
                                            functionName: string,
                                            functionDescription: string): Promise<ChatCompletionCreateParams.Function> {
    let messages: ChatCompletionMessageParam[] = [
        { role: "system", content: "You are an awesome javascript coding genius" },
    ];

    let implementationPrompt = prompts.createFunctionImplementationPrompt
        .replaceAll('{functionName}', functionName)
        .replace('{functionDescription}', functionDescription);

    messages.push({ role: "user", content: implementationPrompt });

    ui.startSpinner(`GPT requested a new function called ${colors.functionName(functionName)}. Asking GPT to code it up.`);

    const implementationResponse = await callOpenAICompletions(openai, model, 0, messages);
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
    const specResponse = await callOpenAICompletions(openai, model, 0, messages);

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

function getFunctionNamesString(functionSpecs: ChatCompletionCreateParams.Function[]) {
    let functionNames = functionSpecs.map(f => colors.functionName(f.name));
    return functionNames.join(', ');
}

/**
 * Calls GPT and allows it to dynamically generate functions needed to complete the task.
 */
export async function callGptWithDynamicFunctionCreation(    openai: OpenAI,
                                                             model: string,
                                                             temperature: number,
                                                             outputFolder: string,
                                                             functionSpecs: ChatCompletionCreateParams.Function[],
                                                             messages: ChatCompletionMessageParam[],
                                                             userPrompt: string): Promise<string | null> {
    const codeFolder = path.join(outputFolder, CODE_FOLDER_NAME);
    createFolderIfMissing(codeFolder);
    const quarantineFolder = path.join(outputFolder, QUARANTINE_FOLDER_NAME);
    createFolderIfMissing(quarantineFolder);
    const workingDirWhenRunningFunctions = path.join(outputFolder, FILES_FOLDER_NAME);
    createFolderIfMissing(workingDirWhenRunningFunctions);

    messages.push(
        { role: "user", content: userPrompt },
    );

    ui.startSpinner(`Waiting for GPT-4 response. Giving it functions: ${getFunctionNamesString(functionSpecs)}`);
    while (true) {
        const response = await callOpenAICompletions(openai, model, temperature, messages, functionSpecs);
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
                messages.push({ role: "function", name: 'requestFunction', content: "Function created successfully." })
                ui.startSpinner(`Telling GPT that the function ${colors.functionName(functionArgs.name)} is now available.`);
            } else {
                const result = await executeGeneratedFunction(openai, model, messages, codeFolder, quarantineFolder, workingDirWhenRunningFunctions, functionName, functionArgs);
                if (result) {
                    return result;
                }
                ui.startSpinner(`Giving GPT the result of ${colors.functionName(functionName)}`);
            }
        } else if (response.finish_reason === 'stop') {
            return responseMessage.content;
        } else {
            log.info("Strange, this response is neither a function call nor a stop: " + JSON.stringify(response));
        }
    }
}

// Helper function to call OpenAI API and get the first choice message
async function callOpenAICompletions(    openai: OpenAI,
                                         model: string,
                                         temperature: number,
                                         messages: ChatCompletionMessageParam[],
                                         functions?:  ChatCompletionCreateParams.Function[]): Promise<ChatCompletion.Choice> {
    let body: ChatCompletionCreateParamsNonStreaming = {
        model: model,
        messages: messages,
        temperature: temperature,
    };
    if (functions) {
        body.functions = functions;
    }

    log.logGptRequest(model, messages, functions);

    const response: ChatCompletion = await openai.chat.completions.create(body);

    log.logGptResponse(response);

    return response.choices[0];
}