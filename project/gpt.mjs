// gpt.mjs
import {callFunction, createFunction} from "./codegen.mjs";
import readlineSync from 'readline-sync';

const sampleFunctionSpec = {
    "name": "getWeather",
    "description": "Get the current weather for a city",
    "parameters": {
        "type": "object",
        "properties": {
            "city": {
                "type": "string",
                "description": "The city",
            },
        },
        "required": ["city"],
    },
}


const requestFunctionSpec = {
    "name": "requestFunction",
    "description": "Requests a new function with given name and description",
    "parameters": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "The name of the function, camelCase, no spaces. For example sendEmail."
            },
            "description": {
                "type": "string",
                "description": "A description of what the function does, include input params and return value." +
                    "For example: Sends an email to the given email address with the given subject and body."
            }
        },
        "required": ["name", "description"]
    }
}

const mainSystemMessage = `
        You are an assistant with the ability to dynamically request new functions.
        Before responding to a new prompt, figure out which functions you will need to complete the task.
        Use the given function requestFunction() function to describe what you need,
        and I will make sure those functions are available to you in the next message.
        After you have all the functions you need, respond to the original prompt.
    `
const createFunctionImplementationPrompt = `
        Write a javascript function named {functionName} based on the following description within tripple quotes:
        """
        {functionDescription}
        """
        
        Give me a complete javascript module with that function as the default export. 
        - Use require() to import any modules you need. Don't use import.
        - The function should only take one argument, an object with named parameters.
        - Include logging in the code so I can see what it is doing.
        - The function should throw an error if it can't complete.
        
        Use --- as delimiter at the beginning and end of the module.
        `

const createFunctionSpecPrompt = `
    Create a function spec for the code above.
    It should be formatted as a JSON Schema Object. Here is an example:
    ${JSON.stringify(sampleFunctionSpec, null, 2)}
    
    Use --- as delimiter at the beginning and end of the function spec.
`
async function askGptToGenerateFunction(openai, model, generatedCodeFolder, functionName, functionDescription) {
    let messages = [
        { role: "system", content: createFunctionImplementationPrompt.replace('{functionName}', functionName).replace('{functionDescription}', functionDescription) }
    ];

    // Ask GPT for the function implementation
    const implementationResponse = await openai.chat.completions.create({
        model: model,
        messages: messages
    });

    const implementation = implementationResponse.choices[0].message.content.split('---')[1].trim();

    // Show the generated code to the user and ask for approval
    console.log("\nGenerated Function Implementation:\n", implementation);
    const userApproval = readlineSync.question(`Do you approve the creation of this function? (Y/N) `);

    if (userApproval.toLowerCase() !== 'y') {
        throw new Error("Function creation declined by user.");
    }

    // Save the function
    await createFunction(generatedCodeFolder, functionName, implementation);

    // Ask GPT for the function spec
    messages.push({ role: "user", content: createFunctionSpecPrompt });
    const specResponse = await openai.chat.completions.create({
        model: model,
        messages: messages
    });

    const functionSpecString = specResponse.choices[0].message.content.split('---')[1].trim();
    return JSON.parse(functionSpecString);
}

/**
 * Calls GPT and allows it to dynamically generate functions needed to complete the task.
 */
export async function callGptWithDynamicFunctionCreation(openai, model, generatedCodeFolder, gptPrompt) {
    let messages = [
        { role: "system", content: mainSystemMessage },
        { role: "user", content: gptPrompt }
    ];

    let functionSpecs = [requestFunctionSpec];

    while (true) {
        console.log("\n\n============================")
        console.log("Sending: ", getLast(messages))
        console.log("Including functions: ", functionSpecs)
        const response = await openai.chat.completions.create({
            model: model,
            messages: messages,
            functions: functionSpecs
        });

        let responseMessage = response.choices[0].message;
        console.log("Got response: ", responseMessage);
        messages.push(responseMessage);

        if (responseMessage.function_call) {
            const functionName = responseMessage.function_call.name;
            const functionArgs = JSON.parse(responseMessage.function_call.arguments);

            if (functionName === 'requestFunction') {
                const generatedFunctionSpec = await askGptToGenerateFunction(
                    openai,
                    model,
                    generatedCodeFolder,
                    functionArgs.name,
                    functionArgs.description
                );
                functionSpecs.push(generatedFunctionSpec);
                messages.push({ role: "function", name: 'requestFunction', content: "Function created successfully." });
            } else {
                const result = await callFunction(generatedCodeFolder, functionName, functionArgs);
                const resultDescription = result !== undefined ? JSON.stringify(result) : "Function executed successfully but returned no value.";
                messages.push({ role: "function", name: functionName, content: resultDescription });
            }
        } else if (response.choices[0].finish_reason === 'stop') {
            console.log("Chat completed! Final message: ", responseMessage.content);
            return responseMessage.content;
        }
    }
}

function getLast(array) {
    return array[array.length - 1];
}