import chalk, {ChalkInstance} from "chalk";
import readline, { Interface } from "readline";
import ora, { Ora } from "ora";
import * as log from "./htmllog";
import terminalLink from "terminal-link";
import boxen from "boxen";

class UI {
    private static instance: UI;
    private rl!: Interface;
    private spinner!: Ora | null;

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

    async ask(question: string): Promise<string> {
        log.info(`Asking user: ${question}`);
        const answer: string = await new Promise((resolve) => {
            this.rl.question(chalk.green(question), (answer) => {
                resolve(answer);
            });
        });
        log.info(`Got answer: ${answer}`);
        return answer;
    }

    async askIfCodeFileIsSafe(functionName: string, quarantineFilePath: string): Promise<string> {
        const link = terminalLink(functionName, 'file:///' + quarantineFilePath);
        return await this.ask("Is this code safe to run? " + link + " (y/n)");
    }

    textBox(borderColor: string, textColor: keyof typeof chalk, text: string): void {
        log.info(text);
        let chalkInstance = chalk[textColor] as ChalkInstance;
        console.log(boxen(chalkInstance(`${text}`), { padding: 1, borderColor: borderColor, borderStyle: 'round' }));
    }

    removePreviousLine(): void {
        readline.moveCursor(process.stdout, 0, -1);
        readline.clearLine(process.stdout, 0);
    }

    startSpinner(text: string): void {
        log.info(text);
        this.spinner = ora(text).start();
    }

    stopSpinnerWithCheckmark(): void {
        log.info("Succeeded!");
        if (this.spinner) {
            this.spinner.succeed();
            process.stdin.resume();
        }
    }

    stopSpinnerWithCross(): void {
        log.info("Failed!");
        if (this.spinner) {
            this.spinner.fail();
            process.stdin.resume();
        }
    }

    close(): void {
        this.rl.close();
    }

    write(message: string): void {
        log.info(message);
        console.log(chalk.gray(message));
    }
}

const uiInstance = new UI();

export default uiInstance;
