// htmllog.mjs
import fs from 'fs';
import path from 'path';

const FILE_NAME = 'log.html';

export function info(message) {
    appendHtml(`<br><pre>${message}</pre>`);
}

export function error(error) {
    appendHtml(`<h2>Error</h2><br><pre>${error}</pre><br><hr>`);
}

export function initLogFile() {
    // remove the file if it exists
    let logFile = path.join(process.cwd(), FILE_NAME);
    if (fs.existsSync(logFile)) {
        fs.unlinkSync(logFile);
    }

    const cssStyles = `<style>
                      pre {
                          white-space: pre-wrap;       
                          white-space: -moz-pre-wrap;  
                          white-space: -o-pre-wrap;    
                          word-wrap: break-word;       
                      }
                     </style>`;
    appendHtml(cssStyles);
}

// Log GPT request
export function logGptRequest(model, messages, functions) {
    const requestBodyLog = `<h1>Request</h1><br>
                          <b>Model</b>: ${model} <br>
                          <b>Messages</b>: <br>
                          ${messages.map(m => `- ${m.role}: ${m.role === 'user' ? '<pre>'+ m.content + '</pre>' : m.content}`).join('<br>')} <br><br>
                          <b>Functions</b>: <br> <pre>${functions ? JSON.stringify(functions, null, 2) : 'None'}</pre> <br><hr>`;
    appendHtml(requestBodyLog);
}

// Log GPT response
export function logGptResponse(response) {
    let functionDetailsLog = '';
    if(response.choices[0].finish_reason === 'function_call') {
        const funcCall = response.choices[0].message.function_call;
        functionDetailsLog = `<b>Function Call</b>: <br> <b>Name</b>: ${funcCall.name} <br> <b>Arguments</b>: <pre>${JSON.stringify(JSON.parse(funcCall.arguments), null, 2)}</pre><br>`;
    }

    const responseBodyLog = `<h1>Response</h1> <br>
                           <b>Message Content</b>: <br><pre>${response.choices[0].message.content}</pre><br>
                           ${functionDetailsLog}
                           <b>Finish Reason</b>: ${response.choices[0].finish_reason} <br>
                           <hr>`;

    appendHtml(responseBodyLog);
}

function appendHtml(responseBodyLog) {
    fs.appendFileSync(path.join(process.cwd(), FILE_NAME), responseBodyLog);
}
