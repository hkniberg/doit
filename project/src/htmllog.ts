import fs from "fs";
import path from "path";
import {ChatCompletionMessage} from "openai/src/resources/chat/completions";
import {describeError} from "./util";
import {ChatCompletion} from "openai/resources/chat";

const FILE_NAME: string = 'log.html';

export function info(message: string): void {
    appendHtml(`<br><xmp>${message}</xmp>`);
}

export function error(comment: string, error?: any): void {
    appendHtml(`<p>${comment}</p><br><pre>${describeError(error)}</pre><br><hr>`);
}

export function initLogFile(): void {
    // remove the file if it exists
    const logFile: string = path.join(process.cwd(), FILE_NAME);
    if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
    }

    const cssStyles: string = `<style>
                      pre, xmp {
                          white-space: pre-wrap;       
                          white-space: -moz-pre-wrap;  
                          white-space: -o-pre-wrap;    
                          word-wrap: break-word;       
                      }
                     
                     </style>`;
    appendHtml(cssStyles);
}

function getChatMessageAsHtmlListItem(m: ChatCompletionMessage) {
    return `<li><b>${m.role}</b> <xmp>${m.content}</xmp></li>`;
}

export function logGptRequest(model: string, messages: ChatCompletionMessage[], functions: any): void {
    const escapedFunctions = functions ? JSON.stringify(functions, null, 2) : 'None';
    const requestBodyLog: string = `\n\n<h1>Request</h1><br>
                          <b>Model</b>: ${model} <br>
                          <b>Messages</b>: <br>
                          <ul>
                          ${messages.map(message => getChatMessageAsHtmlListItem(message)).join('\n')}
                          </ul>
                          <b>Functions</b>: <br> <xmp>${escapedFunctions}</xmp> <br><hr>`;
    appendHtml(requestBodyLog);
}

export function logGptResponse(response: ChatCompletion): void {
    const choice = response.choices[0];
    const message = choice.message;
    const functionCallString = message.function_call? JSON.stringify(message.function_call, null, 2) : "";
    const responseBodyLog: string = `\n
<h1>Response</h1> 
<ul>
    <li>Finish reason: ${choice.finish_reason}</li>
    <li>Role: ${message.role}</li>
    <li>Message: <xmp>${message.content}</xmp></li>
    <li>Function call: <xmp>${functionCallString}</xmp></li>
</ul>
`
    appendHtml(responseBodyLog);
}

function appendHtml(responseBodyLog: string): void {
    fs.appendFileSync(path.join(process.cwd(), FILE_NAME), responseBodyLog);
}
