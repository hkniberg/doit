// main.mjs
import {callGptWithDynamicFunctionCreation} from "./gpt.mjs";
import OpenAI from "openai";
import {config} from "dotenv-safe";
import {resetFolder} from "./util.mjs";
import path from "path";
import ui from "./ui.mjs";
import {initLogFile} from "./htmllog.mjs";
import * as log from "./htmllog.mjs";
import * as prompts from "./prompts.mjs";

config();
const OUTPUT_FOLDER = path.resolve(process.cwd(), '..', 'output');

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

resetFolder(path.join(OUTPUT_FOLDER, "code"));
resetFolder(path.join(OUTPUT_FOLDER, "files"));

initLogFile();

const MODEL = process.env.MODEL;

const mainLoop = async () => {
    let messages = [
        { role: "system", content: prompts.mainSystemMessage}
    ];
    let functionSpecs = [prompts.requestFunctionSpec];

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
            log.error(error);
            ui.stopSpinnerWithCheckmark();
            ui.textBox('red', 'white', `An error occurred: ${error}`);
        }
    }
};

mainLoop();
