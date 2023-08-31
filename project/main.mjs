// main.mjs
import {callGptWithDynamicFunctionCreation, initGptLog} from "./gpt.mjs";
import OpenAI from "openai";
import {config} from "dotenv-safe";
import {resetFolder} from "./util.mjs";
import path from "path";
import fs from "fs";
import {UIHelper} from "./ui.mjs";

config();
const OUTPUT_FOLDER = path.resolve(process.cwd(), '..', 'output');

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY });

resetFolder(path.join(OUTPUT_FOLDER, "code"));
resetFolder(path.join(OUTPUT_FOLDER, "files"));
let gptLogFile = path.join(process.cwd(), "gpt.log.html");
if (fs.existsSync(gptLogFile)) {
    fs.rmSync(gptLogFile);
}
initGptLog();

const MODEL = process.env.MODEL;

const ui = new UIHelper();

const mainLoop = async () => {

    while (true) {
        const question = await ui.ask("What would you like to ask GPT-4? (Type 'exit' to quit) ");

        ui.removePreviousLine();

        if (question.toLowerCase() === 'exit') {
            ui.drawBox('red', 'white', 'Exiting...');
            ui.close();
            break;
        }

        ui.drawBox('green', 'blue', `You: ${question}`);

        ui.startSpinner('Waiting for GPT-4 response');

        try {
            const result = await callGptWithDynamicFunctionCreation(openai, MODEL, OUTPUT_FOLDER, question);
            ui.stopSpinner();
            ui.drawBox('magenta', 'blue', `GPT: ${result}`);
        } catch (error) {
            ui.stopSpinner();
            ui.drawBox('red', 'white', `An error occurred: ${error}`);
        }
    }
};

mainLoop();
