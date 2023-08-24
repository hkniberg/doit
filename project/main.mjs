// main.mjs
import {callGptWithDynamicFunctionCreation} from "./gpt.mjs";
import OpenAI from "openai";
import {config} from "dotenv-safe";
import {createFolderIfMissing} from "./util.mjs";
import path from "path";

config();
const OUTPUT_FOLDER = "../output";

const openai = new OpenAI({ apiKey: process.env.OPENAI_KEY});

createFolderIfMissing(OUTPUT_FOLDER);
createFolderIfMissing(path.join(OUTPUT_FOLDER, "files"));

const MODEL = "gpt-4";
(async () => {
    let prompt1 = "Create a file on my computer called ../output/files/hi.txt which contains the text 'Hello World!'"

    let prompt2 = "Download the contents of http://kniberg.com and save to a file called ../output/files/kniberg.txt."

    await callGptWithDynamicFunctionCreation(openai, MODEL, OUTPUT_FOLDER, prompt2)
})();

