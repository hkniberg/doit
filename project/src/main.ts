// main.mjs
import {callGptWithDynamicFunctionCreation, loadFunctionSpecs} from "./gpt";
import {OpenAI} from "openai";
import {config} from "dotenv-safe";
import path from "path";
import ui from "./ui";
import * as log from "./htmllog";
import * as prompts from "./prompts";
import {initLogFile} from "./htmllog";
import {ChatCompletionCreateParams} from "openai/resources/chat";
import chalk from "chalk";

config();
const OUTPUT_FOLDER: string = path.resolve(process.cwd(), '..', 'output');
initLogFile();

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY as string });

const MODEL: string = process.env.MODEL as string;

const mainLoop = async (): Promise<void> => {
    let messages = [
        { role: "system", content: prompts.mainSystemMessage}
    ];
    const savedFunctionSpecs = await loadFunctionSpecs(OUTPUT_FOLDER);
    const functionSpecNames = savedFunctionSpecs.map(spec => chalk.red(spec.name));
    if (functionSpecNames.length > 0) {
        console.log(chalk.dim("Found some previously generated functions:", functionSpecNames.join(", ")));
    }
    const functionSpecs: ChatCompletionCreateParams.Function[] = [prompts.requestFunctionSpec, ...savedFunctionSpecs];

    while (true) {
        const question = await ui.ask("What would you like to ask GPT-4? (Type 'exit' to quit) ");

        ui.removePreviousLine();

        if (question.toLowerCase() === 'exit') {
            ui.textBox('red', 'white', 'Exiting...');
            ui.close();
            break;
        }

        ui.textBox('green', 'cyan', `You: ${question}`);

        try {
            const result = await callGptWithDynamicFunctionCreation(openai, MODEL, OUTPUT_FOLDER, functionSpecs, messages, question);
            ui.stopSpinnerWithCheckmark();
            ui.textBox('magenta', 'cyan', `GPT: ${result}`);
        } catch (error) {
            log.error("Something went wrong when talking to GPT", error);
            ui.stopSpinnerWithCheckmark();
            ui.textBox('red', 'white', `An error occurred: ${error}`);
        }
    }
};

mainLoop();
