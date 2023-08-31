import boxen from "boxen";
import chalk from "chalk";
import readline from "readline";
import ora from "ora";
import * as log from "./htmllog.mjs";
import terminalLink from "terminal-link";

class UI {
    constructor() {
        if (UI.instance) {
            return UI.instance;
        }
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.spinner = null;
        UI.instance = this;
    }

    async ask(question) {
        log.info(`Asking user: ${question}`)
        let answer = await new Promise((resolve) => {
            this.rl.question(chalk.green(question), (answer) => {
                resolve(answer);
            });
        });
        log.info(`Got answer: ${answer}`)
        return answer
    }

    async askIfCodeFileIsSafe(functionName, quarantineFilePath) {
        const link = terminalLink(functionName, 'file:///' + quarantineFilePath)
        return await this.ask("Is this code safe to run? " + link + " (y/n)");
    }

    textBox(borderColor, textColor, text) {
        log.info(text);
        console.log(boxen(chalk[textColor](`${text}`), { padding: 1, borderColor: borderColor, borderStyle: 'round' }));
    }

    removePreviousLine() {
        readline.moveCursor(process.stdout, 0, -1);
        readline.clearLine(process.stdout, 0);
    }

    startSpinner(text) {
        log.info(text);
        this.spinner = ora(text).start();
    }

    stopSpinnerWithCheckmark() {
        log.info("Succeeded!");
        if (this.spinner) {
            this.spinner.succeed();
            process.stdin.resume();
        }
    }

    stopSpinnerWithCross() {
        log.info("Failed!");
        if (this.spinner) {
            this.spinner.fail();
            process.stdin.resume();
        }
    }
    close() {
        this.rl.close();
    }

    write(message) {
        log.info(message);
        console.log(chalk.gray(message));
    }

}

const uiInstance = new UI();

export default uiInstance;
