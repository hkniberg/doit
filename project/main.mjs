// main.mjs
import {callGptWithDynamicFunctionCreation, initGptLog} from "./gpt.mjs";
import OpenAI from "openai";
import {config} from "dotenv-safe";
import {resetFolder} from "./util.mjs";
import path from "path";
import fs from "fs";

config();
const OUTPUT_FOLDER = path.resolve(process.cwd(), '..', 'output');


const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY});

resetFolder(path.join(OUTPUT_FOLDER, "code"));
resetFolder(path.join(OUTPUT_FOLDER, "files"));
let gptLogFile = path.join(process.cwd(), "gpt.log.html");
if (fs.existsSync(gptLogFile)) {
    fs.rmSync(gptLogFile);
}
initGptLog();

const MODEL = "gpt-4";
(async () => {

    let prompt1 = "Create a file on my computer called ../output/files/hi.txt which contains the text 'Hello World!'"

    let prompt2 = "Download the contents of http://kniberg.com and save to a file called ../output/files/kniberg.txt."

    let prompt3 = "Clone the github repo https://github.com/hkniberg/test-project  " +
        "Run it and tell me what the output is."

    let prompt4 = "What does https://github.com/hkniberg/test-project do?"

    await callGptWithDynamicFunctionCreation(openai, MODEL, OUTPUT_FOLDER, prompt2)
})();

