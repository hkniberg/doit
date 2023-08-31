// main.mjs
import readline from 'readline';
import { callGptWithDynamicFunctionCreation, initGptLog } from "./gpt.mjs";
import OpenAI from "openai";
import { config } from "dotenv-safe";
import { resetFolder } from "./util.mjs";
import path from "path";
import fs from "fs";
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';

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

const MODEL = "gpt-4";

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => {
    return new Promise((resolve) => {
        rl.question(query, (answer) => {
            resolve(answer);
        });
    });
};

const mainLoop = async () => {
    while (true) {
        const question = await askQuestion(chalk.green("What would you like to ask GPT-4? (Type 'exit' to quit) "));

        // Clear the last line and move the cursor to the start of the line
        readline.moveCursor(process.stdout, 0, -1);
        readline.clearLine(process.stdout, 0);

        if (question.toLowerCase() === 'exit') {
            console.log(chalk.red('Exiting...'));
            rl.close();
            break;
        }

        // Replace the cleared line with a boxen box
        console.log(boxen(chalk.blue(`You: ${question}`), { padding: 1, borderColor: 'green', borderStyle: 'round' }));

        const spinner = ora('Waiting for GPT-4 response...').start();

        try {
            const result = await callGptWithDynamicFunctionCreation(openai, MODEL, OUTPUT_FOLDER, question);
            spinner.stop();
            process.stdin.resume();
            console.log(boxen(chalk.blue(`GPT: ${result}`), { padding: 1, borderColor: 'cyan', borderStyle: 'round' }));
        } catch (error) {
            spinner.stop();
            console.log(chalk.red('An error occurred:', error));
        }
    }
};

mainLoop();
