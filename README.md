A proof-of-concept implementation of dynamic GPT function calling. 
This allows GPT to generate the code it needs on-the-fly.

For example if you ask it to download a page, it will dynamially generate the code
to download a page, and then call it.

Example flow:
1. Send a prompt, such as "create a file called hello world"
2. GPT responds that it needs a createFile function for that
3. We ask GPT to write the code for it save it to file
4. We tell GPT that the function now exists
5. GPT responds that it wants to call createFile
6. We call createFile, and inform GPT that it is done
7. GPT responds that it has successfully created the file

