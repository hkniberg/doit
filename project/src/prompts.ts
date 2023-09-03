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
        
        Before responding to a new prompt, figure out if you need any functions to complete the task.
        Use the given function requestFunction() function to describe what you need,
        and I will make sure those functions are available to you in the next message.
        
        Don't request a new function if that function already exists.
        Don't request a new function for things you can do yourself.  
        
        Example 1: If I ask you to summarize a web page, don't ask for a function to summarize a web page.
        Instead, ask for a function to access a web page (since you can't do that yourself), and then you
        do the summarizing. That way we keep the functions as small and simple as possible.
        
        Example 2: If I ask you about current events in the world that have happened after your cutoff, you
        can request a function to search the web, and then you can summarize and interpret the results yourself.
        
        If you need information from the user, for example an API key for a third-party service, you can
        should ask the user for that information and then send it to the function. 
        Don't rely on process.env or any other local environment variables or config files.
        
         After you have all the functions and information you need, respond to the original prompt.
        `;
export let codeStyle = `        
        - Use ESM syntax with import/export statements. Avoid using require().
        - {functionName} should accept only one argument, an object with named parameters.
        - The function should throw an error if it can't complete successfully.
        - Favor async/await over callbacks for asynchronous operations.
        - Treat any file paths as relative to current working dir, not relative to the module. Don't use __dirname.
        - Use packages whenever possible. Avoid writing your own code for common tasks.
        - Don't include dummy code or placeholder code. The function should be complete and ready for production use.
        - If the function needs user-specific information or environment-specific information,
          for example a password or an API key for a third-party service, 
          then that should be passed in as parameters to the function,
          and the assistant should ask the user about this information before calling the function. 
          Don't prompt the user from inside the function, and don't rely on hardcoded values, config files, or environment variables. 
`;
export const createFunctionImplementationPrompt = `
        Write a JavaScript function named {functionName}
        based on the following description within triple quotes:
        """
        {functionDescription}
        """
        
        Provide a complete JavaScript module that exports {functionName}, obeying the following code rules:
        {codeStyle}        
                
        The final output should be a complete JavaScript module that exports {functionName}
        
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
    Debug the {functionName} function.
    
    Here is the function spec:
    {functionSpec}
    
    Here is the complete module:
    ---
    {moduleCode}
    ---

    I sent the following input:
    ---
    {functionInput}
    ---

    Here is the console output:
    ---
    {consoleOutput}
    ---

    I got the following error:
    ---
    {functionError}
    ---

    Please provide a complete new version of this module, where the bug is fixed.
    Make sure the implementation obeys the function spec.
    
    Follow these code rules: 
    {codeStyle} 
    
    If you are unable to determine the cause of the bug, just return the same module
    but with more logging to help you debug it later.
    
    Use --- as a delimiter at both the beginning and end of the module.
  `;