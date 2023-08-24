// main.mjs
import {callGptWithDynamicFunctionCreation} from "./gpt.mjs";
import fs from "fs";
import OpenAI from "openai";
import {config} from "dotenv-safe";
config();
const OUTPUT_FOLDER = "../output";
const GENERATED_CODE_FOLDER = "../generated";

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY});

if (!fs.existsSync(OUTPUT_FOLDER)) {
    fs.mkdirSync(OUTPUT_FOLDER);
}

const MODEL = "gpt-4";
(async () => {
    let prompt1 = `Create a file on my computer called hello.txt which contains the text 'Hello World!'. 
    Place it in the ${OUTPUT_FOLDER} folder.`

    let prompt2 = "Download the contents of kniberg.com and save to a file called kniberg.txt."

    await callGptWithDynamicFunctionCreation(openai, MODEL, GENERATED_CODE_FOLDER, prompt2)
})();

