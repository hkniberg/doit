import boxen from "boxen";
import chalk from "chalk";
import readline from "readline";
import ora from "ora";

export class UIHelper {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        this.spinner = null;
    }

    async ask(question) {
        return await this.askQuestion(chalk.green(question))
    }

    drawBox(borderColor, textColor, text) {
        console.log(boxen(chalk[textColor](`${text}`), { padding: 1, borderColor: borderColor, borderStyle: 'round' }));
    }

    removePreviousLine() {
        readline.moveCursor(process.stdout, 0, -1);
        readline.clearLine(process.stdout, 0);
    }

    startSpinner(text) {
        this.spinner = ora(text).start();
    }

    stopSpinner() {
        if (this.spinner) {
            this.spinner.succeed();
            process.stdin.resume();
        }
    }

    askQuestion(query) {
        return new Promise((resolve) => {
            this.rl.question(query, (answer) => {
                resolve(answer);
            });
        });
    };

    close() {
        this.rl.close();
    }
}



