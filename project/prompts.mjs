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
export const requestFunctionSpec = {
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
                "description": "A detailed description of what the function does, include input params, and return value." +
                    "For example: 'Sends an email to the given email address with the given subject and body'." +
                    "Also include an example of the input you plan to send to this function."
            }
        },
        "required": ["name", "description"]
    }
}
export const mainSystemMessage = `
        You are an assistant with the ability to dynamically request new functions.
        Before responding to a new prompt, figure out which functions you will need to complete the task.
        Use the given function requestFunction() function to describe what you need,
        and I will make sure those functions are available to you in the next message.
        After you have all the functions you need, respond to the original prompt.
        `;
export let codeStyle = `        
        - Use ESM syntax with import/export statements. Avoid using require().
        - {functionName} should accept only one argument, an object with named parameters.
        - Incorporate logging within the code to provide visibility into its operations.
        - The function should throw an error if it encounters any issues.
        - Favor async/await over callbacks for asynchronous operations.
        - Treat any file paths as relative to current working dir, not relative to the module. DOn't use __dirname.
`;
export const createFunctionImplementationPrompt = `
        Write a JavaScript function named {functionName} and a corresponding unit test named {functionName}Test
        based on the following description within triple quotes:
        """
        {functionDescription}
        """
        
        Provide a complete JavaScript module that exports {functionName}, obeying the following code style:
        {codeStyle}        
        

        Include export unit test function {functionName}Test, but only if the test can run without external dependencies (such as http requests).
        - {functionName}Test should not take any arguments.
        - If the test is successful, it should return nothing.
        - If it fails, it should throw an error and log details about which inputs and outputs were involved.
        - If {functionName}Test needs to generate temporary files, save them in pre-existing directory {testScratchFolder}.
        - If {functionName} is asynchronous, ensure {functionName}Test awaits its result.

        If you can't make an independent unit test, just skip {functionName}Test.
        
        The final output should be a complete JavaScript module that exports {functionName}
        and optionally also {functionName}Test.
        
        IMPORTANT: Include a bug that will make the function throw an error. I want to test debugging.

        Use --- as a delimiter at both the beginning and end of the module.
        `;
export const createFunctionSpecPrompt = `
    Create a function spec for the code above.
    It should be formatted as a JSON Schema Object. Here is an example:
    ${JSON.stringify(sampleFunctionSpec, null, 2)}
    
    Use --- as delimiter at the beginning and end of the function spec.
`;
export const debugSystemPrompt = `
    You are a master debugger. When you are asked to fix a function, you always return
    a complete new module with the fixed function code. 
    Use --- as a delimiter at both the beginning and end of the module.
`
export const debugPrompt = `
    Debug the {functionName} function. Here is the complete module:
    ---
    {moduleCode}
    ---

    I sent the following input:
    {functionInput}
    
    I got the following error:
    {functionError}

    Please provide a complete new version of this module, where the bug is fixed.
    
    Follow this code style: 
    {codeStyle} 
    
    If you are unable to determine the cause of the bug, just return the same module
    but with more logging to help you debug it later.
    
    Use --- as a delimiter at both the beginning and end of the module.
  `;