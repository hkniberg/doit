A proof-of-concept implementation of dynamic GPT function calling. 
This allows GPT to generate the code it needs on-the-fly.

For example if you ask it to download a page, it will dynamially generate the code
to download a page, and then call it.

Example flow:
1. We send a prompt to GPT, such as "create a file called helloworld.txt".
2. GPT responds that it needs a createFile function for that.
3. We ask GPT to write the code for createFile and createFileTest.
4. We save the resulting code to file, install dependencies, and run the unit test.
5. We tell GPT that the createFile function now exists.
6. GPT responds that it wants to call createFile.
7. We call createFile, and inform GPT that it is done.
8. GPT responds that it has successfully completed the original request.

After this, the file helloworld.txt should exist.