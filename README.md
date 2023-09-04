# What happens if you give GPT a 'createFunction' function?

This is a proof-of-concept implementation of dynamic GPT function calling.
It allows GPT to generate the code it needs on-the-fly.

This runs as a terminal-based ChatGPT clone that can autogenerate code on the fly.
So you can ask it to access the internet or create files or check the weather or whatever,
and it will figure it out on its own.

For example if you ask it to download a web page, it will dynamically generate the code
to access the web and save files. 

WARNING: This can be dangerous. Use carefully, and at own risk!

# Example flow 
1. App asks user for a prompt. User types "create a file called helloworld.txt".
1. App sends the prompt to GPT, but includes info that GPT can ask for new functions.
2. GPT responds that it needs a createFile function.
3. App asks GPT to write the code for createFile.
4. GPT responds with code.
5. App asks user if this code is safe to run. User says yes.
6. App saves the code locally and installs dependencies (npm install)
5. App tells GPT that the createFile function now exists.
6. GPT responds that it wants to call createFile.
7. App calls createFile, and informs GPT that it is done.
8. GPT informs user that the file has been created.
After this, the file helloworld.txt should exist.

If something goes wrong, the app sends the code, console output, and error stack trace to GPT.
GPT figures out if the problem is the code or the input. If it's the code, it provides a fix.
If it's the input, it provides new input, or prompts the user for input (for example if we need an API key to
access a service)

# Demo

![demo.jpg](docs/demo.jpg)

# Sample prompts

- Make a function called runShellCommand that uses child_process to run shell commands, and returns the result. Whenever suitable, use this instead of creating new functions, especially for basic tasks like file operations (ls, cat, mv, etc) or network operations (curl, wget, etc) or git operations (git clone, etc). Note that some tools like git write to stderr even if there isn't an error, so don't assume that stderr means failure. Also, if you're going to do something big, make sure you confirm with me first.
- You: This file is messy. Please clean it up. Clone the repo, make the change, and commit. Check with me before pushing. https://github.com/hkniberg/doit/blob/main/project/src/util.ts

# How to run

- `cd project`
- `npm run main`



